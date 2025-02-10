import { JSONSchema7 } from 'json-schema'

export interface ToolFunctionSchemaParams {
  properties: { [key: string]: JSONSchema7 }
  required: string[]
  additionalProperties: any
}
