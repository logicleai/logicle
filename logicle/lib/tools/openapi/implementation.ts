import {
  ToolBuilder,
  ToolFunction,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import env from '@/lib/env'
import { addFile } from '@/models/file'
import { logger } from '@/lib/logging'
import { parseDocument } from 'yaml'
import { expandEnv } from 'templates'
import { parseMultipart } from '@mjackson/multipart-parser'
import JacksonHeaders from '@mjackson/headers'
import { InsertableFile } from '@/types/dto'
import { nanoid } from 'nanoid'
import { log } from 'winston'
import { ToolFunctionSchemaParams } from './types'
import { Body, BodyHandler, findBodyHandler } from './body'
import { storage } from '@/lib/storage'
import { fetch, Agent } from 'undici'

export interface OpenApiPluginParams extends Record<string, unknown> {
  spec: string
  supportedMedia?: string[]
}

function mergeOperationParamsIntoToolFunctionSchema(
  toolParams: ToolFunctionSchemaParams,
  operationParams: OpenAPIV3.ParameterObject[]
) {
  const operationParameters = operationParams as OpenAPIV3.ParameterObject[]
  operationParameters.forEach((param: OpenAPIV3.ParameterObject) => {
    if (param.schema && (param.in === 'query' || param.in === 'path')) {
      toolParams.properties[param.name] = param.schema
      if (param.required) {
        toolParams.required.push(param.name)
      }
    }
  })
}

function computeSecurityHeaders(
  securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject>,
  toolParams: Record<string, unknown>,
  provisioned: boolean
): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const securitySchemeId in securitySchemes) {
    const securityScheme = securitySchemes[securitySchemeId]
    if (securityScheme.type === 'apiKey') {
      if (!toolParams[securitySchemeId]) {
        throw new Error(`auth parameter ${securitySchemeId} not configured`)
      }
      headers[securityScheme.name] = expandIfProvisioned(
        `${toolParams[securitySchemeId]}`,
        provisioned
      )
    } else if (securityScheme.type === 'http') {
      const authParam = toolParams[securitySchemeId]
      if (!authParam) {
        throw new Error(`auth parameter ${securitySchemeId} not configured`)
      }
      let expanded = expandIfProvisioned(`${authParam}`, provisioned)
      if (securityScheme.scheme === 'bearer' && !expanded.startsWith('Bearer')) {
        expanded = `Bearer ${expanded}`
      }
      headers.Authorization = expanded
    }
  }
  return headers
}

function expandIfProvisioned(template: string, provisioned: boolean) {
  if (!provisioned) return template
  else return expandEnv(template)
}

function dumpTruncatedBodyContent(body: RequestInit['body']): string | undefined {
  if (!body) return undefined
  if (typeof body === 'string') {
    return body.substring(0, 100)
  } else {
    return '<not a string>'
  }
}

function hideSecurityHeaders(headers: Record<string, string>) {
  const hidden: Record<string, string> = {}
  for (const headerName of Object.keys(headers)) {
    hidden[headerName] = '<hidden>'
  }
  return hidden
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
    const storeAndSendAsAttachment = async (
      data: Uint8Array,
      fileName: string,
      contentType: string
    ) => {
      const path = `${fileName}-${nanoid()}`
      await storage.writeBuffer(path, data, env.fileStorage.encryptFiles)

      const dbEntry: InsertableFile = {
        name: fileName,
        type: contentType,
        size: data.byteLength,
      }

      const dbFile = await addFile(dbEntry, path, env.fileStorage.encryptFiles)
      uiLink.addAttachment({
        id: dbFile.id,
        mimetype: contentType,
        name: fileName,
        size: data.byteLength,
      })
    }

    const opParameters = operation.parameters as OpenAPIV3.ParameterObject[]
    let builtPath = pathKey
    for (const param of opParameters || []) {
      if (param.in === 'path') {
        // No need for schema check here unless you really need it
        const value = encodeURIComponent(String(invocationParams[param.name]))
        builtPath = builtPath.replace(`{${param.name}}`, value)
      }
    }

    const url = new URL(`${server.url}${builtPath}`)

    for (const param of opParameters || []) {
      if (param.in === 'query' && param.schema && param.name in invocationParams) {
        const value = invocationParams[param.name]
        if (param.required || value != null) {
          url.searchParams.set(param.name, String(value))
        }
      }
    }
    let body: Body
    let headers: Record<string, string> = {}
    if (bodyHandler) {
      const res = await bodyHandler.createBody(invocationParams)
      body = res.body
      headers = { ...headers, ...res.headers }
    }
    let sensitiveHeaders: Record<string, string> = {}
    if (securitySchemes) {
      sensitiveHeaders = computeSecurityHeaders(
        securitySchemes as Record<string, OpenAPIV3.SecuritySchemeObject>,
        toolParams,
        provisioned
      )
    }

    const urlString = url.toString()
    const allHeaders = { ...headers, ...sensitiveHeaders }

    logger.info(`Invoking ${method} at ${urlString}`, {
      body: body,
      headers: allHeaders,
    })
    if (debug) {
      uiLink.debugMessage(`HTTP ${method.toUpperCase()} ${urlString}`, {
        headers: { ...headers, ...hideSecurityHeaders(sensitiveHeaders) },
        body: dumpTruncatedBodyContent(body),
      })
    }

    const response = await customFetch(urlString, method, allHeaders, body)
    try {
      if (debug) {
        uiLink.debugMessage(`Received response`, {
          status: response.status,
        })
      }
      const contentType = response.headers.get('content-type')
      const jacksonHeaders = new JacksonHeaders(response.headers)
      const contentDisposition = jacksonHeaders.contentDisposition
      if (contentType?.startsWith('multipart/')) {
        const boundary = contentType.split('boundary=')[1]
        if (!boundary) {
          throw new Error('Boundary not found in Content-Type')
        }

        let result: string | undefined
        for await (const part of parseMultipart(response.body!, boundary)) {
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
            await storeAndSendAsAttachment(await part.bytes(), fileName, mediaType)
          }
        }
        return result || 'no response'
      }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `Http request failed with status ${response.status} body ${await response.text()}`
        )
      }
      if (contentDisposition.type === 'attachment') {
        const contentTypeOrDefault = contentType ?? 'application/binary'
        const fileName = contentDisposition.preferredFilename ?? 'fileName'
        const body = await response.blob()
        await storeAndSendAsAttachment(await body.bytes(), fileName, contentTypeOrDefault)
        return `File ${fileName} has been sent to the user and is plainly visible, so don't repeat the descriptions in detail. Do not list download links as they are available in the ChatGPT UI already. Do not mention anything about visualizing / downloading to the user`
      } else if (contentType && contentType === 'application/json') {
        return await response.json()
      } else {
        return await response.text()
      }
    } finally {
      // If the body has not been consumed at all, we need to cancel the response
      // To avoid resource leaks
      if (response.body && !response.body.locked) {
        await response.body.cancel()
      }
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

async function customFetch(
  url: string,
  method: string,
  allHeaders: { [x: string]: string },
  body: Body
) {
  // TODO: verify that creating an agent for each and every request
  // is perhaps not a good idea
  const agent = new Agent({
    headersTimeout: env.tools.openApi.timeoutSecs * 1000,
  })
  try {
    return await fetch(url, {
      method: method.toUpperCase(),
      headers: allHeaders,
      body: body,
      dispatcher: agent,
    })
  } finally {
    // This will close the agent when all pending requests are done
    void agent.close()
  }
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
  static builder: ToolBuilder = async (toolParams: ToolParams, params: Record<string, unknown>) => {
    const config = params as OpenApiPluginParams
    const functions = await convertOpenAPISpecToToolFunctions(config, toolParams.provisioned)
    return new OpenApiPlugin(toolParams, functions, config.supportedMedia || []) // TODO: need a better validation
  }

  constructor(
    public toolParams: ToolParams,
    private functions_: ToolFunctions,
    public supportedMedia: string[]
  ) {
    super()
  }
  functions = async () => this.functions_
}
