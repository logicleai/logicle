import { OpenAPIV3 } from 'openapi-types'
import FormData from 'form-data'
import { PassThrough } from 'stream'
import { ToolFunctionSchemaParams } from './types'
import { JSONSchema7 } from 'json-schema'
import { getFileWithId } from '@/models/file'
import { storage } from '@/lib/storage'
import { object } from 'zod'
import { SchemaObjCxt, SchemaObject } from 'ajv'
import { PropertySource } from '@/lib/properties'

export type Body = string | Buffer | undefined

interface BodyAndHeader {
  body: Body
  headers: Record<string, any>
}

type BodyCreator = (
  invocationParams: Record<string, unknown>,
  schema: OpenAPIV3.SchemaObject
) => Promise<BodyAndHeader>

export interface BodyHandler {
  createBody: (invocationParams: Record<string, unknown>) => Promise<BodyAndHeader>
  mergeParamsIntoToolFunctionSchema: (toolParams: ToolFunctionSchemaParams) => void
}

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

function makeSchemaOpenAiCompatible(openApiSchema: OpenAPIV3.SchemaObject) {
  const result: OpenAPIV3.SchemaObject = structuredClone(openApiSchema)
  makeSchemaOpenAiCompatibleInPlace(result)
  return result
}

function mergeRequestBodyDefIntoToolFunctionSchema(
  schema: ToolFunctionSchemaParams,
  openApiSchema: OpenAPIV3.SchemaObject
) {
  schema.properties['body'] = makeSchemaOpenAiCompatible(openApiSchema)
  schema.required = [...schema.required, 'body']
}

async function formDataToBuffer(form: FormData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Collect chunks as they stream in
    const chunks: Uint8Array[] = []

    // Create a PassThrough stream to read form data
    const pass = new PassThrough()

    // Handle form-data pipe to stream
    form.pipe(pass)

    // Listen for 'data' event to collect the chunks
    pass.on('data', (chunk: Uint8Array) => {
      chunks.push(chunk)
    })

    // Listen for 'end' event to resolve the buffer
    pass.on('end', () => {
      // Concatenate the collected chunks into a Buffer
      const buffer = Buffer.concat(chunks)
      resolve(buffer)
    })

    // Handle errors
    pass.on('error', (err) => {
      reject(err)
    })
  })
}

async function createFormBody(
  invocationParams: Record<string, unknown>,
  schema: OpenAPIV3.SchemaObject
): Promise<BodyAndHeader> {
  const bodyParamInstances = invocationParams['body'] as Record<string, any>
  const form = new FormData()
  if (schema.type != 'object') {
    throw new Error("Can't create form from a non object schema")
  }

  const bodyObjectProperties = schema.properties || {}
  const namesOfDefinedProperties = Object.keys(bodyObjectProperties)

  for (const definedPropertyName of namesOfDefinedProperties) {
    const propInvocationValue = bodyParamInstances[definedPropertyName]
    const propSchema = bodyObjectProperties[definedPropertyName] as OpenAPIV3.SchemaObject
    if (propSchema.format == 'binary') {
      const fileId = propInvocationValue
      if (!fileId) {
        throw new Error(
          `Tool invocation requires a body, but param ${definedPropertyName} is missing`
        )
      }
      const fileEntry = await getFileWithId('' + propInvocationValue)
      if (!fileEntry) {
        throw new Error(`Tool invocation required non existing file: ${propInvocationValue}`)
      }
      const fileContent = await storage.readBuffer(
        fileEntry.path,
        fileEntry.encrypted ? true : false
      )
      form.append(definedPropertyName, fileContent, {
        filename: fileEntry.name,
      })
    } else {
      const propValue = propInvocationValue ?? propSchema.default ?? ''
      form.append(definedPropertyName, propValue)
    }
  }
  // Add properties which are not defined in the schema
  if (schema.additionalProperties) {
    for (const param of Object.entries(bodyParamInstances)) {
      const name = param[0]
      const value = param[1]
      if (!namesOfDefinedProperties.includes(param[0])) {
        form.append(name, value)
      }
    }
  } else {
    // TODO: Here we could verify if some unexpected properties are sent
  }
  return {
    body: await formDataToBuffer(form),
    headers: form.getHeaders(),
  }
}

async function createJsonBody(invocationParams: Record<string, unknown>) {
  // No validation whatsoever here
  // We pass all parameters provided from LLM
  return {
    body: JSON.stringify(invocationParams['body']),
    headers: {
      'content-type': 'application/json',
    },
  }
}

async function createWwwFormUrlEncodedBody(
  invocationParams: Record<string, unknown>,
  schema: OpenAPIV3.SchemaObject
) {
  const bodyParams = invocationParams['body'] as Record<string, any>
  const properties = schema.properties || {}
  const urlParams = new URLSearchParams()
  if (schema.additionalProperties) {
    for (const param of Object.entries(bodyParams)) {
      // Fixme: Some parameters will be duplicated
      urlParams.append(param[0], `${param[1]}`)
    }
  }
  for (const propName of Object.keys(properties)) {
    urlParams.append(propName, `${bodyParams[propName]}`)
  }
  return {
    body: urlParams.toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
  }
}

const bodyHandlers: Record<string, BodyCreator> = {
  'multipart/form-data': createFormBody,
  'application/json': createJsonBody,
  'application/x-www-form-urlencoded': createWwwFormUrlEncodedBody,
}

export function findBodyHandler(spec: OpenAPIV3.RequestBodyObject): BodyHandler | undefined {
  if (spec) {
    for (const bodyHandler of Object.entries(bodyHandlers)) {
      {
        const format = bodyHandler[0]
        const mediaObject = spec.content[format]
        if (mediaObject && mediaObject.schema) {
          const schema = mediaObject.schema as OpenAPIV3.SchemaObject
          return {
            createBody: (invocationParams: Record<string, unknown>) => {
              return bodyHandler[1](invocationParams, schema)
            },
            mergeParamsIntoToolFunctionSchema: (toolParams: ToolFunctionSchemaParams) => {
              mergeRequestBodyDefIntoToolFunctionSchema(toolParams, schema)
            },
          }
        }
      }
    }
  }
  return undefined
}
