import { ToolBuilder, ToolFunction, ToolFunctions, ToolImplementation } from '@/lib/chat/tools'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import env from '@/lib/env'
import { JSONSchema7 } from 'json-schema'
import { addFile, getFileWithId } from '@/models/file'
import FormData from 'form-data'
import { PassThrough } from 'stream'
import { logger } from '@/lib/logging'
import { parseDocument } from 'yaml'
import { expandEnv } from 'templates'
import { storage } from '@/lib/storage'
import { parseMultipart } from '@mjackson/multipart-parser'
import { InsertableFile } from '@/types/dto'
import { nanoid } from 'nanoid'

export interface OpenApiPluginParams extends Record<string, unknown> {
  spec: string
}

async function formDataToBuffer(form: FormData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Collect chunks as they stream in
    const chunks: Uint8Array[] = []

    // Create a PassThrough stream to read form data
    const pass = new PassThrough()

    // Handle form-data pipe to stream
    form.pipe(pass)

    // Listen for 'data' event to collect the chunks
    pass.on('data', (chunk: Uint8Array) => {
      chunks.push(chunk)
    })

    // Listen for 'end' event to resolve the buffer
    pass.on('end', () => {
      // Concatenate the collected chunks into a Buffer
      const buffer = Buffer.concat(chunks)
      resolve(buffer)
    })

    // Handle errors
    pass.on('error', (err) => {
      reject(err)
    })
  })
}

function mergeSchemaIntoJsonProps(
  jsonProps: { [key: string]: JSONSchema7 },
  openApiSchema: OpenAPIV3.SchemaObject
) {
  if (openApiSchema && openApiSchema.type == 'object' && openApiSchema.properties) {
    const properties = openApiSchema.properties
    for (const propName of Object.keys(properties)) {
      jsonProps[propName] = properties[propName] as JSONSchema7
    }
  }
}

function chooseRequestBody(spec?: OpenAPIV3.RequestBodyObject) {
  if (spec) {
    for (const requestBodyType of [
      'multipart/form-data',
      'application/json',
      'application/x-www-form-urlencoded',
    ]) {
      const mediaObject = spec.content[requestBodyType]
      if (mediaObject && mediaObject.schema) {
        return {
          format: requestBodyType,
          schema: mediaObject.schema as OpenAPIV3.SchemaObject,
        }
      }
    }
  }
  return undefined
}

function expandIfProvisioned(template: string, provisioned: boolean) {
  if (!provisioned) return template
  else return expandEnv(template)
}

function convertOpenAPIOperationToToolFunction(
  spec: OpenAPIV3.Document,
  pathKey: string,
  method: string,
  operation: OpenAPIV3.OperationObject,
  toolParams: Record<string, unknown>,
  provisioned: boolean
): ToolFunction {
  // Extracting parameters
  const server = spec.servers![0]
  const required: string[] = []
  const openAiParameters: { [key: string]: JSONSchema7 } = {}
  const securitySchemes = spec.components?.securitySchemes
  if (operation.parameters) {
    const operationParameters = operation.parameters as OpenAPIV3.ParameterObject[]
    operationParameters.forEach((param: OpenAPIV3.ParameterObject) => {
      if (param.schema && (param.in === 'query' || param.in === 'path')) {
        openAiParameters[param.name] = param.schema as JSONSchema7
        if (param.required) {
          required.push(param.name)
        }
      }
    })
  }

  const requestBodyDefinition = operation.requestBody
    ? chooseRequestBody(operation.requestBody as OpenAPIV3.RequestBodyObject)
    : undefined
  if (requestBodyDefinition) {
    mergeSchemaIntoJsonProps(openAiParameters, requestBodyDefinition.schema)
  }
  // Constructing the OpenAI function
  const openAIFunction: ToolFunction = {
    description: operation.description ?? operation.summary ?? 'No description',
    parameters: {
      type: 'object',
      properties: openAiParameters,
      required: required,
    },
    invoke: async ({ params, uiLink, debug }) => {
      let url = `${server.url}${pathKey}`
      const queryParams: string[] = []
      const opParameters = operation.parameters as OpenAPIV3.ParameterObject[]
      for (const param of opParameters || []) {
        if (param.in === 'path' && param.schema) {
          url = url.replace(`{${param.name}}`, '' + params[param.name])
        }
        if (param.in === 'query' && param.schema && param.name in params) {
          queryParams.push(`${param.name}=${encodeURIComponent('' + params[param.name])}`)
        }
      }
      let body: string | Buffer | undefined = undefined
      let headers: Record<string, string> = {}
      if (requestBodyDefinition) {
        const schema = requestBodyDefinition.schema
        if (requestBodyDefinition.format == 'multipart/form-data') {
          const form = new FormData()
          if (schema.type == 'object') {
            const properties = schema.properties || {}
            for (const propName of Object.keys(properties)) {
              const propSchema = properties[propName] as OpenAPIV3.SchemaObject
              if (propSchema.format == 'binary') {
                const fileId = params[propName]
                if (!fileId) {
                  throw new Error(
                    `Tool invocation requires a body, but param ${propName} is missing`
                  )
                }
                const fileEntry = await getFileWithId('' + params[propName])
                if (!fileEntry) {
                  throw new Error(`Tool invocation required non existing file: ${params[propName]}`)
                }
                const fileContent = await storage.readBuffer(
                  fileEntry.path,
                  fileEntry.encrypted ? true : false
                )
                form.append(propName, fileContent, {
                  filename: fileEntry.name,
                })
              } else {
                const propValue = params[propName] ?? propSchema.default ?? ''
                form.append(propName, propValue)
              }
            }
            body = await formDataToBuffer(form)
            headers = { ...form.getHeaders() }
          }
        } else if (requestBodyDefinition.format == 'application/json') {
          const requestBodyObj = {}
          if (schema.type == 'object') {
            const properties = schema.properties || {}
            for (const propName of Object.keys(properties)) {
              requestBodyObj[propName] = params[propName]
            }
            body = JSON.stringify(requestBodyObj)
            headers = {
              'content-type': 'application/json',
            }
          }
        } else if (requestBodyDefinition.format == 'application/x-www-form-urlencoded') {
          if (schema.type == 'object') {
            const properties = schema.properties || {}
            const urlParams = new URLSearchParams()
            for (const propName of Object.keys(properties)) {
              urlParams.append(propName, `${params[propName]}`)
            }
            body = urlParams.toString()
            headers = {
              'content-type': 'application/x-www-form-urlencoded',
            }
          }
        }
      }
      if (securitySchemes) {
        for (const securitySchemeId in securitySchemes) {
          const securityScheme = securitySchemes[securitySchemeId] as OpenAPIV3.SecuritySchemeObject
          if (securityScheme.type == 'apiKey') {
            if (!toolParams[securitySchemeId]) {
              throw new Error(`auth parameter ${securitySchemeId} not configured`)
            }
            headers[securityScheme.name] = expandIfProvisioned(
              '' + toolParams[securitySchemeId],
              provisioned
            )
          } else if (securityScheme.type == 'http') {
            const authParam = toolParams[securitySchemeId]
            if (!authParam) {
              throw new Error(`auth parameter ${securitySchemeId} not configured`)
            }
            let expanded = expandIfProvisioned('' + authParam, provisioned)
            if (securityScheme.scheme == 'bearer' && !expanded.startsWith('Bearer')) {
              expanded = `Bearer ${expanded}`
            }
            headers['Authorization'] = expanded
          }
        }
      }
      const requestInit: RequestInit = {
        method: method.toUpperCase(),
        headers: headers,
        body: body,
      }

      if (queryParams.length) {
        url = `${url}?${queryParams.join('&')}`
      }
      logger.info(`Invoking ${requestInit.method} at ${url}`, {
        body: body,
        headers: headers,
      })
      if (debug) {
        await uiLink.debugMessage(`Calling HTTP endpoint ${url}`, {
          method,
          headers,
        })
      }
      const response = await fetch(url, requestInit)
      if (debug) {
        await uiLink.debugMessage(`Received response`, {
          status: response.status,
        })
      }
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.startsWith('multipart/')) {
        const boundary = contentType.split('boundary=')[1]
        if (!boundary) {
          throw new Error('Boundary not found in Content-Type')
        }

        let result: string | undefined
        for await (const part of parseMultipart(response.body!, boundary)) {
          console.log(`name = ${part.name} filename = ${part.filename} type = ${part.mediaType}`)
          // filename comes from... Content-Disposition: attachment
          // so, if there's a filename, we assume it's an attachment, and not the "body", which we want to
          // send to the LLM
          const isAttachment = part.filename !== undefined
          const fileName = part.filename ?? part.name ?? 'no_name'
          const mediaType = part.mediaType ?? ''
          // We use as body the first part not marked as attachment, with a text/xxx content type
          if (result === undefined && !isAttachment && /^text\//.test(part.mediaType ?? '')) {
            result = await part.text()
          } else {
            const data = await part.bytes()
            const path = `${fileName}-${nanoid()}`
            await storage.writeBuffer(path, data, env.fileStorage.encryptFiles)

            const dbEntry: InsertableFile = {
              name: fileName,
              type: mediaType,
              size: data.byteLength,
            }

            const dbFile = await addFile(dbEntry, path, env.fileStorage.encryptFiles)
            await uiLink.newMessage()
            uiLink.addAttachment({
              id: dbFile.id,
              mimetype: mediaType,
              name: fileName,
              size: data.byteLength,
            })
          }
        }
        return result || 'no response'
      }
      if (contentType && contentType == 'application/json') {
        return await response.json()
      } else {
        return await response.text()
      }
    },
    requireConfirm: env.tools.openApi.requireConfirmation,
  }
  return openAIFunction
}

function convertOpenAPIDocumentToToolFunctions(
  openAPISpec: OpenAPIV3.Document,
  toolParams: Record<string, unknown>,
  provisioned: boolean
): ToolFunctions {
  const openAIFunctions: ToolFunctions = {}

  if (!openAPISpec.servers) {
    throw new Error('Server not specified in OpenAPI schema')
  }

  for (const pathKey in openAPISpec.paths) {
    const pathItem = openAPISpec.paths[pathKey] as OpenAPIV3.PathItemObject
    for (const method in pathItem) {
      const operation = pathItem[
        method as keyof OpenAPIV3.PathItemObject
      ] as OpenAPIV3.OperationObject
      if (operation) {
        try {
          const openAIFunction = convertOpenAPIOperationToToolFunction(
            openAPISpec,
            pathKey,
            method,
            operation,
            toolParams,
            provisioned
          )
          openAIFunctions[`${operation.operationId ?? 'undefined'}`] = openAIFunction
        } catch (error) {
          logger.error(`Error converting operation ${method.toUpperCase()} ${pathKey}: ${error}`)
        }
      }
    }
  }

  return openAIFunctions
}
async function convertOpenAPISpecToToolFunctions(
  toolParams: OpenApiPluginParams,
  provisioned: boolean
): Promise<ToolFunctions> {
  try {
    const doc = parseDocument(toolParams.spec)
    const openAPISpec = (await OpenAPIParser.validate(doc.toJSON())) as OpenAPIV3.Document
    return convertOpenAPIDocumentToToolFunctions(openAPISpec, toolParams, provisioned)
  } catch (error) {
    logger.error(`Error parsing OpenAPI string: ${error}`)
    return {}
  }
}

export class OpenApiPlugin extends OpenApiInterface implements ToolImplementation {
  static builder: ToolBuilder = async (params: Record<string, unknown>, provisioned: boolean) => {
    const toolParams = params as OpenApiPluginParams
    const functions = await convertOpenAPISpecToToolFunctions(toolParams, provisioned)
    return new OpenApiPlugin(functions) // TODO: need a better validation
  }

  functions: ToolFunctions

  constructor(functions: ToolFunctions) {
    super()
    this.functions = functions
  }
}
