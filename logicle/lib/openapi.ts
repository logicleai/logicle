import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import { parseDocument } from 'yaml'
import { openapi } from '@apidevtools/openapi-schemas'
import AjvDraft4 from 'ajv-draft-04'
import Ajv from 'ajv/dist/2020'

/**
 * Determines which version of Ajv to load and prepares it for use.
 *
 * @param {bool} draft04
 * @returns {Ajv}
 */
function initializeAjv(draft04 = true) {
  const opts = {
    allErrors: true,
    strict: false,
    validateFormats: false,
  }

  if (draft04) {
    return new AjvDraft4(opts)
  }

  return new Ajv(opts)
}

/**
 * Validates the given Swagger API against the Swagger 2.0 or OpenAPI 3.0 and 3.1 schemas.
 *
 * @param {SwaggerObject} api
 */
export function validateSchema(api) {
  let ajv

  // Choose the appropriate schema (Swagger or OpenAPI)
  let schema

  if (api.swagger) {
    schema = openapi.v2
    ajv = initializeAjv()
  } else {
    if (api.openapi.startsWith('3.1')) {
      schema = openapi.v31

      // There's a bug with Ajv in how it handles `$dynamicRef` in the way that it's used within the 3.1 schema so we
      // need to do some adhoc workarounds.
      // https://github.com/OAI/OpenAPI-Specification/issues/2689
      // https://github.com/ajv-validator/ajv/issues/1573
      const schemaDynamicRef = schema.$defs.schema
      delete schemaDynamicRef.$dynamicAnchor

      schema.$defs.components.properties.schemas.additionalProperties = schemaDynamicRef
      schema.$defs.header.dependentSchemas.schema.properties.schema = schemaDynamicRef
      schema.$defs['media-type'].properties.schema = schemaDynamicRef
      schema.$defs.parameter.properties.schema = schemaDynamicRef

      ajv = initializeAjv(false)
    } else {
      schema = openapi.v3
      ajv = initializeAjv()
    }
  }

  // Validate against the schema
  let isValid = ajv.validate(schema, api)
  return { isValid: isValid, errors: ajv.errors }
}

export const extractApiKeysFromOpenApiSchema = async (schemaObject: any): Promise<string[]> => {
  const result = new Map<string, OpenAPIV3.SecuritySchemeObject>()
  const openAPISpec = (await OpenAPIParser.validate(schemaObject)) as OpenAPIV3.Document
  const securitySchemes = openAPISpec.components?.securitySchemes ?? {}
  for (const component in securitySchemes) {
    const key = component
    const value = securitySchemes[key] as OpenAPIV3.SecuritySchemeObject
    if (value.type == 'apiKey') {
      result.set(key, value as OpenAPIV3.SecuritySchemeObject)
    } else if (key == 'auth' && value.type == 'http') {
      result.set(key, value as OpenAPIV3.SecuritySchemeObject)
    }
  }
  return Array.from(result.keys())
}
