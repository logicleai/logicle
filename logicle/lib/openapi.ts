import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import * as jsYAML from 'js-yaml'

export const extractApiKeysFromOpenApiSchema = async (schemaText: string): Promise<string[]> => {
  const result = new Map<string, OpenAPIV3.SecuritySchemeObject>()
  const openApiSpecYaml = jsYAML.load(schemaText)
  const openAPISpec = (await OpenAPIParser.validate(openApiSpecYaml)) as OpenAPIV3.Document
  if (openAPISpec.components?.securitySchemes) {
    for (const component in openAPISpec.components.securitySchemes) {
      const key = component
      const value = openAPISpec.components.securitySchemes[key] as OpenAPIV3.SecuritySchemeObject
      if (value.type == 'apiKey') {
        result.set(key, value as OpenAPIV3.SecuritySchemeObject)
      }
    }
  }
  return Array.from(result.keys())
}
