import { ToolBuilder, ToolFunction, ToolImplementation } from '../../openai'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import * as jsYAML from 'js-yaml'
import * as dto from '@/types/dto'
import env from '@/lib/env'

// https://cookbook.openai.com/examples/function_calling_with_an_openapi_spec
// https://pub.aimind.so/practical-guide-to-openai-function-calling-for-openapi-operations-970b2058ab5

// List of plugins ()
// https://github.com/dannyp777/ChatGPT-AI-Plugin-Manifest-Lists
function convertOpenAPIOperationToOpenAIFunction(
  pathKey: string,
  method: string,
  operation: OpenAPIV3.OperationObject,
  server: OpenAPIV3.ServerObject
): ToolFunction {
  // Extracting parameters
  const required: string[] = []
  const openAiParameters: { [key: string]: any } = {}
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
        openAiParameters[param.name] = {
          type: param.schema.type,
          description: param.description || '',
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
    name: `${method}_${pathKey.replace(/[/{}]/g, '_')}`.toLowerCase(),
    description: operation.description || '',
    parameters: {
      type: 'object',
      properties: openAiParameters,
      required: required,
    },
    invoke: async (messages: dto.Message[], assistantId: string, params: Record<string, any>) => {
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
      const requestInit: RequestInit = {
        method: method.toUpperCase(),
      }
      if (requestBodyDefinition) {
        const jsonBody = requestBodyDefinition.content['application/json']
        const schema = jsonBody?.schema as OpenAPIV3.SchemaObject | undefined
        const requestBodyObj = {}
        if (schema && schema.type == 'object') {
          const properties = schema.properties || {}
          for (const propName of Object.keys(properties)) {
            requestBodyObj[propName] = params[propName]
          }
          requestInit.body = JSON.stringify(requestBodyObj)
          requestInit.headers = {
            'content-type': 'application/json',
          }
        }
      }
      if (queryParams.length) {
        url = `${url}?${queryParams.join('&')}`
      }
      console.log(`Invoking ${requestInit.method} at ${url} with body ${requestInit.body}`)
      const response = await fetch(url, requestInit)
      const responseBody = await response.text()
      return responseBody
    },
    requireConfirm: env.tools.openApi.requireConfirmation,
  }
  return openAIFunction
}

function convertOpenAPIDocumentToOpenAIFunctions(openAPISpec: OpenAPIV3.Document): ToolFunction[] {
  const openAIFunctions: ToolFunction[] = []

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
            pathKey,
            method,
            operation,
            openAPISpec.servers![0]
          )
          openAIFunctions.push(openAIFunction)
        } catch (error) {
          console.error(`Error converting operation ${method.toUpperCase()} ${pathKey}:`, error)
        }
      }
    }
  }

  return openAIFunctions
}
async function convertOpenAPIStringToOpenAIFunction(
  openAPIString: string
): Promise<ToolFunction[]> {
  try {
    const jsonAPI = jsYAML.load(openAPIString)
    const openAPISpec = (await OpenAPIParser.validate(jsonAPI)) as OpenAPIV3.Document
    return convertOpenAPIDocumentToOpenAIFunctions(openAPISpec)
  } catch (error) {
    console.error('Error parsing OpenAPI string:', error)
    return []
  }
}

export interface OpenApiPluginParams {
  spec: string
}

export class OpenApiPlugin extends OpenApiInterface implements ToolImplementation {
  static builder: ToolBuilder = async (params: Record<string, any>) => {
    const functions = await convertOpenAPIStringToOpenAIFunction(params.spec)
    return new OpenApiPlugin(params as OpenApiPluginParams, functions) // TODO: need a better validation
  }

  params: OpenApiPluginParams
  functions: ToolFunction[]

  constructor(params: OpenApiPluginParams, functions: ToolFunction[]) {
    super()
    this.params = params
    this.functions = functions
  }
}
