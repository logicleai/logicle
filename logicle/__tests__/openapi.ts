import * as jsYAML from 'js-yaml'
import { openapi } from '@apidevtools/openapi-schemas'
import AjvDraft4 from 'ajv-draft-04'
import Ajv from 'ajv/dist/2020'
import { parseDocument } from 'yaml'

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
function validateSchema(api) {
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

const goodSchema = `
openapi: 3.0.0
info:
  title: Simple API
  version: 1.0.0
paths:
  /hello:
    get:
      summary: Returns a simple greeting.
      responses:
        200:
          description: A successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: "Hello, World!"
`

const badYamlSchema = `
  a: x
     rr
rr
`

const badSchemaOpenApi = `
openapi: 3.0.0
info:
  title: Simple API
  version: 1.0.0
poths:
paths:
  /hello2:
  /hello:
    pippo:
    get:
      summary: Returns a simple greeting.
      responses:
        blabla:
          description: A successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: "Hello, World!"
`

test('TestGoodSchema', () => {
  const openApiSpec = jsYAML.load(goodSchema)
  const result = validateSchema(openApiSpec)
  console.log(openApiSpec)
})

test('TestGoodSchema_yaml', () => {
  const doc = parseDocument(goodSchema)
  const json = doc.toJSON()
  const result = validateSchema(json)
})

test('TestBadYamlSchema_jsYaml', () => {
  try {
    jsYAML.load(badYamlSchema)
  } catch (e) {
    expect(e).toBeInstanceOf(Error)
    return
  }
  fail('should have thrown')
})

test('TestBadYamlSchema_yaml', () => {
  const doc = parseDocument(badYamlSchema)
  const asJson = doc.toJSON()
  expect(doc.errors.length).toBe(1)
})

test('TestInvalidSchemaOpenApi', () => {
  const json = jsYAML.load(badSchemaOpenApi)
  const doc = parseDocument(badSchemaOpenApi)
  const result = validateSchema(json)
  expect(result.errors).not.toBeNull()
})
