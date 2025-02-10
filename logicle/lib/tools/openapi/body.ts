import { OpenAPIV3 } from 'openapi-types'
import FormData from 'form-data'
import { PassThrough } from 'stream'
import { ToolFunctionSchemaParams } from './types'
import { JSONSchema7 } from 'json-schema'
import { getFileWithId } from '@/models/file'
import { storage } from '@/lib/storage'

interface BodyAndHeader {
  body?: BodyInit
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

function mergeRequestBodyDefIntoToolFunctionSchema(
  schema: ToolFunctionSchemaParams,
  openApiSchema: OpenAPIV3.SchemaObject
) {
  if (openApiSchema && openApiSchema.type == 'object' && openApiSchema.properties) {
    const properties = openApiSchema.properties
    for (const propName of Object.keys(properties)) {
      schema.properties[propName] = properties[propName] as JSONSchema7
    }
  }
  if (openApiSchema.additionalProperties) {
    schema.additionalProperties = openApiSchema.additionalProperties
  }
  if (openApiSchema.required) {
    schema.required = [...schema.required, ...openApiSchema.required]
  }
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
  const form = new FormData()
  if (schema.additionalProperties) {
    for (const param of Object.entries(invocationParams)) {
      form.append(param[0], param[1])
    }
  }
  if (schema.type != 'object') {
    throw new Error("Can't create form from a non object schema")
  }
  const bodyObjectProperties = schema.properties || {}
  for (const bodyPropName of Object.keys(bodyObjectProperties)) {
    const propInvocationValue = invocationParams[bodyPropName]
    const propSchema = bodyObjectProperties[bodyPropName] as OpenAPIV3.SchemaObject
    if (propSchema.format == 'binary') {
      const fileId = propInvocationValue
      if (!fileId) {
        throw new Error(`Tool invocation requires a body, but param ${bodyPropName} is missing`)
      }
      const fileEntry = await getFileWithId('' + propInvocationValue)
      if (!fileEntry) {
        throw new Error(`Tool invocation required non existing file: ${propInvocationValue}`)
      }
      const fileContent = await storage.readBuffer(
        fileEntry.path,
        fileEntry.encrypted ? true : false
      )
      form.append(bodyPropName, fileContent, {
        filename: fileEntry.name,
      })
    } else {
      const propValue = propInvocationValue ?? propSchema.default ?? ''
      form.append(bodyPropName, propValue)
    }
  }
  return {
    body: await formDataToBuffer(form),
    headers: form.getHeaders(),
  }
}

async function createJsonBody(
  invocationParams: Record<string, unknown>,
  schema: OpenAPIV3.SchemaObject
) {
  if (schema.type != 'object') {
    throw new Error("Can't create form from a non object schema")
  }
  const requestBodyObj = {}
  const properties = schema.properties || {}
  if (schema.additionalProperties) {
    for (const param of Object.entries(invocationParams)) {
      requestBodyObj[param[0]] = param[1]
    }
  }
  for (const propName of Object.keys(properties)) {
    requestBodyObj[propName] = invocationParams[propName]
  }
  return {
    body: JSON.stringify(requestBodyObj),
    headers: {
      'content-type': 'application/json',
    },
  }
}

async function createWwwFormUrlEncodedBody(
  invocationParams: Record<string, unknown>,
  schema: OpenAPIV3.SchemaObject
) {
  if (schema.type != 'object') {
    throw new Error("Can't create form from a non object schema")
  }
  const properties = schema.properties || {}
  const urlParams = new URLSearchParams()
  if (schema.additionalProperties) {
    for (const param of Object.entries(invocationParams)) {
      // Fixme: Some parameters will be duplicated
      urlParams.append(param[0], `${param[1]}`)
    }
  }
  for (const propName of Object.keys(properties)) {
    urlParams.append(propName, `${invocationParams[propName]}`)
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
