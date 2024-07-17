import { ToolBuilder, ToolFunction, ToolImplementation } from '../../openai'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import * as jsYAML from 'js-yaml'

// https://cookbook.openai.com/examples/function_calling_with_an_openapi_spec
// https://pub.aimind.so/practical-guide-to-openai-function-calling-for-openapi-operations-970b2058ab5

function convertOperationToOpenAIFunction(
  pathKey: string,
  method: string,
  operation: OpenAPIV3.OperationObject,
  server: OpenAPIV3.ServerObject
): ToolFunction {
  // Extracting parameters
  const parameters = (operation.parameters || []).reduce(
    (acc, param: any) => {
      if (param.in === 'query' && param.schema) {
        acc[param.name] = {
          type: param.schema.type,
          description: param.description || '',
          required: param.required || false,
        }
      }
      return acc
    },
    {} as { [key: string]: { type: string; description: string; required: boolean } }
  )

  // Extracting response
  const responseSchema = (operation.responses!['200'] as OpenAPIV3.ResponseObject).content![
    'application/json'
  ].schema as OpenAPIV3.SchemaObject
  const responseProperties = responseSchema.properties!
  /*
  const response = Object.keys(responseProperties).reduce(
    (acc, key) => {
      const property = responseProperties[key] as OpenAPIV3.SchemaObject
      acc[key] = {
        type: property.type!,
      }
      return acc
    },
    {} as { [key: string]: { type: string } }
  )
*/
  // Constructing the OpenAI function
  const openAIFunction: ToolFunction = {
    function: {
      type: 'function',
      function: {
        name: `${method}_${pathKey.replace(/[/{}]/g, '_')}`.toLowerCase(),
        description: operation.description || '',
        parameters: {
          type: 'object',
          properties: parameters,
        },
      },
    },
    invoke: async () => {
      const url = `${server.url}${pathKey}`
      console.log(`Invoking API at ${url}`)
      const response = await fetch(url)
      const responseBody = await response.text()
      console.log(`response body = ${responseBody}`)
      return responseBody
    },
  }
  return openAIFunction
}

function convertOpenAPIToOpenAIFunctions(openAPISpec: OpenAPIV3.Document): ToolFunction[] {
  const openAIFunctions: ToolFunction[] = []

  for (const pathKey in openAPISpec.paths) {
    const pathItem = openAPISpec.paths[pathKey] as OpenAPIV3.PathItemObject
    for (const method in pathItem) {
      const operation = pathItem[
        method as keyof OpenAPIV3.PathItemObject
      ] as OpenAPIV3.OperationObject
      if (operation) {
        try {
          const openAIFunction = convertOperationToOpenAIFunction(
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
    return convertOpenAPIToOpenAIFunctions(openAPISpec)
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

  constructor(params: OpenApiPluginParams, functions: ToolFunction[]) {
    super()
    this.params = params
    this.functions = functions
  }

  functions: ToolFunction[] = [
    {
      function: {
        type: 'function',
        function: {
          name: 'timeOfDay',
          description: 'Retrieve the current time',
          parameters: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
                description: 'The city and state, e.g. San Francisco, CA',
              },
            },
            required: ['location'],
          },
        },
      },
      invoke: async () => {
        return new Date().toLocaleString()
      },
    },
  ]
}
