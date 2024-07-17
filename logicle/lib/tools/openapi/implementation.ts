import { ToolBuilder, ToolFunction, ToolImplementation } from '../../openai'
import { OpenApiInterface } from './interface'
import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'

// https://cookbook.openai.com/examples/function_calling_with_an_openapi_spec
// https://pub.aimind.so/practical-guide-to-openai-function-calling-for-openapi-operations-970b2058ab5

function convertOperationToOpenAIFunction(
  pathKey: string,
  method: string,
  operation: OpenAPIV3.OperationObject
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

  // Constructing the OpenAI function
  const openAIFunction: ToolFunction = {
    function: {
      type: 'function',
      function: {
        name: `${method}_${pathKey.replace(/[\/{}]/g, '_')}`.toLowerCase(),
        description: operation.description || '',
        parameters: {
          type: 'object',
          properties: parameters,
        },
      },
    },
    invoke: async () => {
      return new Date().toLocaleString()
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
          const openAIFunction = convertOperationToOpenAIFunction(pathKey, method, operation)
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
    const openAPISpec = (await OpenAPIParser.validate(openAPIString)) as OpenAPIV3.Document
    return convertOpenAPIToOpenAIFunctions(openAPISpec)
  } catch (error) {
    console.error('Error parsing OpenAPI string:', error)
    return []
  }
}

// Example usage
const openAPIString = `
openapi: 3.0.0
info:
  title: Weather API
  description: API for retrieving weather information
  version: 1.0.0
paths:
  /weather:
    get:
      summary: Get the weather
      description: Returns the current weather for a given location
      parameters:
        - name: location
          in: query
          description: The location to get the weather for
          required: true
          schema:
            type: string
      responses:
        '200':
          description: A weather object
          content:
            application/json:
              schema:
                type: object
                properties:
                  temperature:
                    type: number
                  description:
                    type: string
`

export interface OpenApiPluginParams {
  spec: string
}

const aaaa = await convertOpenAPIStringToOpenAIFunction(openAPIString)

export class OpenApiPlugin extends OpenApiInterface implements ToolImplementation {
  static builder: ToolBuilder = (params: Record<string, any>) =>
    new OpenApiPlugin(params as OpenApiPluginParams) // TODO: need a better validation

  params: OpenApiPluginParams

  constructor(params: OpenApiPluginParams) {
    super()
    this.params = params
    this.functions = []
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
