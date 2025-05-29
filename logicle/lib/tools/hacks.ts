import { JSONSchema7 } from '@ai-sdk/provider'

function makeSchemaOpenAiCompatibleInPlace(schema: JSONSchema7) {
  if (schema.type == 'object' && schema.properties) {
    schema.additionalProperties = false
    const properties = schema.properties
    for (const [name, value] of Object.entries(properties)) {
      const valueAsSchemaObject = value as JSONSchema7
      if (valueAsSchemaObject.type == 'string') {
        valueAsSchemaObject.format = undefined
      } else {
        makeSchemaOpenAiCompatibleInPlace(valueAsSchemaObject)
      }
      const isSimpleType =
        valueAsSchemaObject.type == 'string' || valueAsSchemaObject.type == 'integer'
      if (!valueAsSchemaObject.required?.includes(name) && isSimpleType) {
        valueAsSchemaObject.type = ['string', 'null']
      }
    }
    schema.required = Object.keys(properties)
  } else if (schema.type == 'array' && schema.items) {
    makeSchemaOpenAiCompatibleInPlace(schema.items as JSONSchema7)
  }
  return schema
}

export function makeSchemaOpenAiCompatible(openApiSchema: JSONSchema7) {
  const result: JSONSchema7 = structuredClone(openApiSchema)
  makeSchemaOpenAiCompatibleInPlace(result)
  return result
}
