import {
  ToolBuilder,
  ToolFunction,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
} from '@/lib/chat/tools'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import env from '@/lib/env'
import { JSONSchema7 } from 'json-schema'
import { addFile } from '@/models/file'
import { logger } from '@/lib/logging'
import { parseDocument } from 'yaml'
import { expandEnv } from 'templates'
import { parseMultipart } from '@mjackson/multipart-parser'
import { InsertableFile } from '@/types/dto'
import { nanoid } from 'nanoid'
import { log } from 'winston'
import { ToolFunctionSchemaParams } from './types'
import { BodyHandler, findBodyHandler } from './body'
import { storage } from '@/lib/storage'

export interface OpenApiPluginParams extends Record<string, unknown> {
  spec: string
}

function mergeOperationParamsIntoToolFunctionSchema(
  toolParams: ToolFunctionSchemaParams,
  operationParams: OpenAPIV3.ParameterObject[]
) {
  const operationParameters = operationParams as OpenAPIV3.ParameterObject[]
  operationParameters.forEach((param: OpenAPIV3.ParameterObject) => {
    if (param.schema && (param.in === 'query' || param.in === 'path')) {
      toolParams.properties[param.name] = param.schema as JSONSchema7
      if (param.required) {
        toolParams.required.push(param.name)
      }
    }
  })
}

function computeSecurityHeaders(
  securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject>,
  toolParams,
  provisioned: boolean
): Record<string, any> {
  const headers: Record<string, any> = {}
  for (const securitySchemeId in securitySchemes) {
    const securityScheme = securitySchemes[securitySchemeId]
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
  return headers
}

function expandIfProvisioned(template: string, provisioned: boolean) {
  if (!provisioned) return template
  else return expandEnv(template)
}

function dumpTruncatedBodyContent(body: RequestInit['body']): String {
  if (!body) return '<no body>'
  if (typeof body === 'string') {
    return body.substring(0, 100)
  } else {
    return '<not a string>'
  }
}

function convertOpenAPIOperationToToolFunction(
  spec: OpenAPIV3.Document,
  pathKey: string,
  method: string,
  operation: OpenAPIV3.OperationObject,
  toolParams: Record<string, unknown>,
  provisioned: boolean
): ToolFunction | undefined {
  // Extracting parameters
  const server = spec.servers![0]
  const toolFunctionParams: ToolFunctionSchemaParams = {
    properties: {},
    required: [],
    additionalProperties: false,
  }
  const securitySchemes = spec.components?.securitySchemes

  if (operation.parameters) {
    mergeOperationParamsIntoToolFunctionSchema(
      toolFunctionParams,
      operation.parameters as OpenAPIV3.ParameterObject[]
    )
  }

  let bodyHandler: BodyHandler | undefined
  if (operation.requestBody) {
    bodyHandler = findBodyHandler(operation.requestBody as OpenAPIV3.RequestBodyObject)
    if (!bodyHandler) {
      log('error', `Can't create a tool function for ${pathKey}, unsupported body`)
      return undefined
    }
  }

  bodyHandler?.mergeParamsIntoToolFunctionSchema(toolFunctionParams)

  const invoke = async ({ params: invocationParams, uiLink, debug }: ToolInvokeParams) => {
    let url = `${server.url}${pathKey}`
    const queryParams: string[] = []
    const opParameters = operation.parameters as OpenAPIV3.ParameterObject[]
    for (const param of opParameters || []) {
      if (param.in === 'path' && param.schema) {
        url = url.replace(`{${param.name}}`, '' + invocationParams[param.name])
      }
      if (param.in === 'query' && param.schema && param.name in invocationParams) {
        queryParams.push(`${param.name}=${encodeURIComponent('' + invocationParams[param.name])}`)
      }
    }
    let body: BodyInit | undefined
    let headers: Record<string, any> = {}
    if (bodyHandler) {
      const res = await bodyHandler.createBody(invocationParams)
      body = res.body
      headers = { ...headers, ...res.headers }
    }
    if (securitySchemes) {
      const securityHeaders = computeSecurityHeaders(
        securitySchemes as Record<string, OpenAPIV3.SecuritySchemeObject>,
        toolParams,
        provisioned
      )
      headers = { ...headers, ...securityHeaders }
    }

    if (queryParams.length) {
      url = `${url}?${queryParams.join('&')}`
    }
    const requestInit: RequestInit = {
      method: method.toUpperCase(),
      headers: headers,
      body: body,
    }
    logger.info(`Invoking ${requestInit.method} at ${url}`, {
      body: body,
      headers: headers,
    })
    if (debug) {
      await uiLink.debugMessage(`Calling HTTP endpoint ${url}`, {
        method,
        headers,
        body: dumpTruncatedBodyContent(body),
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
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Http request failed with status ${response.status} body ${await response.text()}`
      )
    }
    if (contentType && contentType == 'application/json') {
      return await response.json()
    } else {
      return await response.text()
    }
  }
  // Building the OpenAI function
  const openAIFunction: ToolFunction = {
    description: operation.description ?? operation.summary ?? 'No description',
    parameters: {
      type: 'object',
      ...toolFunctionParams,
    },
    invoke,
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
          if (openAIFunction) {
            openAIFunctions[`${operation.operationId ?? 'undefined'}`] = openAIFunction
          }
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
