import { ToolBuilder, ToolFunction, ToolFunctions, ToolImplementation } from '@/lib/chat/tools'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import * as jsYAML from 'js-yaml'
import env from '@/lib/env'
import { JSONSchema7 } from 'json-schema'

// https://cookbook.openai.com/examples/function_calling_with_an_openapi_spec
// https://pub.aimind.so/practical-guide-to-openai-function-calling-for-openapi-operations-970b2058ab5

// List of plugins ()
// https://github.com/dannyp777/ChatGPT-AI-Plugin-Manifest-Lists
function convertOpenAPIOperationToOpenAIFunction(
  spec: OpenAPIV3.Document,
  pathKey: string,
  method: string,
  operation: OpenAPIV3.OperationObject,
  toolParams: Record<string, string>
): ToolFunction {
  // Extracting parameters
  const server = spec.servers![0]
  const required: string[] = []
  const openAiParameters: { [key: string]: JSONSchema7 } = {}
  const securitySchemes = spec.components?.securitySchemes
  if (operation.parameters) {
    operation.parameters.forEach((param: any) => {
      if (param.in === 'query' && param.schema) {
        openAiParameters[param.name] = {
          type: param.schema.type,
          description: param.description || '',
        }
        if (param.required) {
          required.push(param.name)
        }
      }
      if (param.in === 'path' && param.schema) {
        if (param.schema.anyOf) {
          openAiParameters[param.name] = {
            type: 'string',
            description: param.description || '',
          }
        } else {
          openAiParameters[param.name] = {
            type: param.schema.type,
            description: param.description || '',
          }
        }
        if (param.required) {
          required.push(param.name)
        }
      }
    })
  }
  const requestBodyDefinition = operation.requestBody as OpenAPIV3.RequestBodyObject | undefined
  if (requestBodyDefinition) {
    const jsonBody = requestBodyDefinition.content['application/json']
    const schema = jsonBody?.schema as OpenAPIV3.SchemaObject | undefined
    if (schema && schema.type == 'object') {
      const properties = schema.properties || {}
      for (const propName of Object.keys(properties)) {
        const schema = properties[propName] as OpenAPIV3.SchemaObject
        openAiParameters[propName] = {
          type: schema.type,
          description: schema.description || '',
        }
      }
    }
    //console.log(JSON.stringify(requestBodyDefinition.content, null, 2))
  }
  // Constructing the OpenAI function
  const openAIFunction: ToolFunction = {
    description: operation.description ?? operation.summary ?? 'No description',
    parameters: {
      type: 'object',
      properties: openAiParameters,
      required: required,
    },
    invoke: async ({ params }) => {
      let url = `${server.url}${pathKey}`
      const queryParams: string[] = []
      for (const param of (operation.parameters || []) as any[]) {
        if (param.in === 'path' && param.schema) {
          url = url.replace(`{${param.name}}`, params[param.name])
        }
        if (param.in === 'query' && param.schema && params[param.name]) {
          queryParams.push(`${param.name}=${encodeURIComponent(params[param.name])}`)
        }
      }
      let body: string | undefined = undefined
      let headers: Record<string, string> = {}
      if (requestBodyDefinition) {
        const jsonBody = requestBodyDefinition.content['application/json']
        const schema = jsonBody?.schema as OpenAPIV3.SchemaObject | undefined
        const requestBodyObj = {}
        if (schema && schema.type == 'object') {
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
      if (securitySchemes) {
        for (const securitySchemeId in securitySchemes) {
          const securityScheme = securitySchemes[securitySchemeId] as OpenAPIV3.SecuritySchemeObject
          if (securityScheme.type == 'apiKey') {
            headers[securityScheme.name] = toolParams[securitySchemeId]
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
      console.log(
        `Invoking ${requestInit.method} at ${url} with body ${
          requestInit.body
        } and headers ${JSON.stringify(headers)}`
      )
      const response = await fetch(url, requestInit)
      const responseBody = await response.text()
      return responseBody
    },
    requireConfirm: env.tools.openApi.requireConfirmation,
  }
  return openAIFunction
}

function convertOpenAPIDocumentToToolFunctions(
  openAPISpec: OpenAPIV3.Document,
  toolParams: Record<string, string>
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
          const openAIFunction = convertOpenAPIOperationToOpenAIFunction(
            openAPISpec,
            pathKey,
            method,
            operation,
            toolParams
          )
          openAIFunctions[`${operation.operationId ?? 'undefined'}`] = openAIFunction
        } catch (error) {
          console.error(`Error converting operation ${method.toUpperCase()} ${pathKey}:`, error)
        }
      }
    }
  }

  return openAIFunctions
}
async function convertOpenAPISpecToToolFunctions(
  openAPIString: string,
  toolParams: Record<string, string>
): Promise<ToolFunctions> {
  try {
    const jsonAPI = jsYAML.load(openAPIString)
    const openAPISpec = (await OpenAPIParser.validate(jsonAPI)) as OpenAPIV3.Document
    return convertOpenAPIDocumentToToolFunctions(openAPISpec, toolParams)
  } catch (error) {
    console.error('Error parsing OpenAPI string:', error)
    return {}
  }
}

export interface OpenApiPluginParams {
  spec: string
}

export class OpenApiPlugin extends OpenApiInterface implements ToolImplementation {
  static builder: ToolBuilder = async (params: Record<string, any>) => {
    const functions = await convertOpenAPISpecToToolFunctions(params.spec, params)
    return new OpenApiPlugin(params as OpenApiPluginParams, functions) // TODO: need a better validation
  }

  params: OpenApiPluginParams
  functions: ToolFunctions

  constructor(params: OpenApiPluginParams, functions: ToolFunctions) {
    super()
    this.params = params
    this.functions = functions
  }
}
