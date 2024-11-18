import { mapErrors, validateSchema } from '@/lib/openapi'
import { parseDocument } from 'yaml'

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
  xxx:
    - eee
    - fffz
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

test('TestGoodSchema_yaml', () => {
  const doc = parseDocument(goodSchema)
  const json = doc.toJSON()
  const result = validateSchema(json)
  expect(result.isValid).toBe(true)
})

test('TestBadYamlSchema_yaml', () => {
  const doc = parseDocument(badYamlSchema)
  const asJson = doc.toJSON()
  expect(doc.errors.length).toBe(1)
})

test('TestInvalidSchemaOpenApi', () => {
  const doc = parseDocument(badSchemaOpenApi)
  const result = validateSchema(doc.toJSON())
  expect(result.errors).not.toBeNull()
  if (result.errors) {
    mapErrors(result.errors, doc)
  }
})
