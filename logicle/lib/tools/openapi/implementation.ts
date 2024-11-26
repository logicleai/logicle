import { ToolBuilder, ToolFunction, ToolFunctions, ToolImplementation } from '@/lib/chat/tools'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import env from '@/lib/env'
import { JSONSchema7 } from 'json-schema'
import { getFileWithId } from '@/models/file'
import FormData from 'form-data'
import { PassThrough } from 'stream'
import { logger } from '@/lib/logging'
import { parseDocument } from 'yaml'
import { expandEnv } from 'templates'
import { storage } from '@/lib/storage'

export interface OpenApiPluginParams extends Record<string, any> {
  spec: string
}

async function formDataToBuffer(form: FormData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Collect chunks as they stream in
    const chunks: any[] = []

    // Create a PassThrough stream to read form data
    const pass = new PassThrough()

    // Handle form-data pipe to stream
    form.pipe(pass)

    // Listen for 'data' event to collect the chunks
    pass.on('data', (chunk) => {
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
    for (const requestBodyType of ['multipart/form-data', 'application/json']) {
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
  toolParams: Record<string, string>,
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
      for (const param of (operation.parameters || []) as any[]) {
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
                const fileContent = await storage.readBuffer(fileEntry.path)
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
              toolParams[securitySchemeId],
              provisioned
            )
          } else if (securityScheme.type == 'http') {
            const authParam = toolParams[securitySchemeId]
            if (!authParam) {
              throw new Error(`auth parameter ${securitySchemeId} not configured`)
            }
            let expanded = expandIfProvisioned(authParam, provisioned)
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
      const responseBody = await response.text()
      return responseBody
    },
    requireConfirm: env.tools.openApi.requireConfirmation,
  }
  return openAIFunction
}

function convertOpenAPIDocumentToToolFunctions(
  openAPISpec: OpenAPIV3.Document,
  toolParams: Record<string, string>,
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
  static builder: ToolBuilder = async (params: Record<string, any>, provisioned: boolean) => {
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
