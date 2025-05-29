import { OpenAPIV3 } from 'openapi-types'

function makeSchemaOpenAiCompatibleInPlace(schema: OpenAPIV3.SchemaObject) {
  if (schema.type == 'object' && schema.properties) {
    schema.additionalProperties = false
    const properties = schema.properties
    for (const [, value] of Object.entries(properties)) {
      const valueAsSchemaObject = value as OpenAPIV3.SchemaObject
      if (valueAsSchemaObject.type == 'string') {
        valueAsSchemaObject.format = undefined
      } else {
        makeSchemaOpenAiCompatibleInPlace(valueAsSchemaObject)
      }
    }
    schema.required = Object.keys(properties)
  } else if (schema.type == 'array' && schema.items) {
    makeSchemaOpenAiCompatibleInPlace(schema.items as OpenAPIV3.SchemaObject)
  }
  return schema
}

export function makeSchemaOpenAiCompatible(openApiSchema: OpenAPIV3.SchemaObject) {
  const result: OpenAPIV3.SchemaObject = structuredClone(openApiSchema)
  makeSchemaOpenAiCompatibleInPlace(result)
  return result
}
