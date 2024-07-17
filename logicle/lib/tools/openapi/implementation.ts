import { ToolBuilder, ToolFunction, ToolImplementation } from '../../openai'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import * as jsYAML from 'js-yaml'
import * as dto from '@/types/dto'

// https://cookbook.openai.com/examples/function_calling_with_an_openapi_spec
// https://pub.aimind.so/practical-guide-to-openai-function-calling-for-openapi-operations-970b2058ab5

function convertOpenAPIOperationToOpenAIFunction(
  pathKey: string,
  method: string,
  operation: OpenAPIV3.OperationObject,
  server: OpenAPIV3.ServerObject
): ToolFunction {
  // Extracting parameters
  const required: string[] = []
  const parameters = (operation.parameters || []).reduce(
    (acc, param: any) => {
      if (param.in === 'query' && param.schema) {
        acc[param.name] = {
          type: param.schema.type,
          description: param.description || '',
        }
        if (param.required) {
          required.push(param.name)
        }
      }
      if (param.in === 'path' && param.schema) {
        acc[param.name] = {
          type: param.schema.type,
          description: param.description || '',
        }
        if (param.required) {
          required.push(param.name)
        }
      }
      return acc
    },
    {} as { [key: string]: { type: string; description: string } }
  )

  // Constructing the OpenAI function
  const openAIFunction: ToolFunction = {
    name: `${method}_${pathKey.replace(/[/{}]/g, '_')}`.toLowerCase(),
    description: operation.description || '',
    parameters: {
      type: 'object',
      properties: parameters,
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
      if (queryParams.length) {
        url = `${url}?${queryParams.join('&')}`
      }
      console.log(`Invoking API at ${url}`)
      const response = await fetch(url)
      const responseBody = await response.text()
      console.log(`response body = ${responseBody}`)
      return responseBody
    },
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
