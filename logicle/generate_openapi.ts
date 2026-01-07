#!/usr/bin/env tsx
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import YAML from 'yaml'
import { z, ZodFirstPartyTypeKind, type ZodTypeAny } from 'zod'
import type { OpenAPIV3 } from 'openapi-types'
import type { ResponseSpec } from './lib/routes'
import { errorResponseSchema } from './lib/routes'

process.env.DATABASE_URL ??= 'memory:'
process.env.FILE_STORAGE_LOCATION ??= '.'
process.env.APP_URL ??= 'http://localhost:3000'

type RouteSchema = {
  name: string
  description?: string
  authentication: 'admin' | 'public' | 'user'
  requestBodySchema?: ZodTypeAny
  responses: readonly ResponseSpec[]
}

type RouteSchemaExport = Record<string, RouteSchema>

type CliOptions = {
  output: string
  format: 'json' | 'yaml'
}

const projectRoot = process.cwd()
const apiRoot = path.join(projectRoot, 'app', 'api')
const componentsSchemas: Record<string, OpenAPIV3.SchemaObject> = {}
const componentsResponses: Record<string, OpenAPIV3.ResponseObject> = {}

function parseArgs(args: string[]): CliOptions {
  let output = 'openapi.generated.json'
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      output = args[i + 1]
      i++
    }
    if (args[i] === '--yaml') {
      output = output.endsWith('.json') ? output.replace(/\.json$/, '.yaml') : output
    }
  }
  const format: CliOptions['format'] =
    output.endsWith('.yml') || output.endsWith('.yaml') ? 'yaml' : 'json'
  return { output, format }
}

async function findRouteFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findRouteFiles(fullPath)))
    } else if (entry.isFile() && /^route\.tsx?$/.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function segmentToOpenApiParam(segment: string): { isParam: boolean; value: string } {
  const isDynamic = segment.startsWith('[') && segment.endsWith(']')
  if (!isDynamic) return { isParam: false, value: segment }

  let inner = segment
  while (inner.startsWith('[') && inner.endsWith(']')) {
    inner = inner.slice(1, -1)
  }
  inner = inner.replace(/^\.\.\./, '')
  return { isParam: true, value: `{${inner}}` }
}

function pathFromRouteFile(filePath: string): { path: string; params: string[] } {
  const relativeDir = path.relative(apiRoot, path.dirname(filePath))
  const segments = relativeDir.split(path.sep).filter(Boolean)
  const params: string[] = []
  const converted = segments.map((segment) => {
    const { isParam, value } = segmentToOpenApiParam(segment)
    if (isParam) {
      params.push(value.slice(1, -1))
    }
    return value
  })
  const routePath = ['/api', ...converted].join('/')
  return { path: routePath, params }
}

function isOptionalSchema(schema: ZodTypeAny) {
  const t = schema._def.typeName
  return t === ZodFirstPartyTypeKind.ZodOptional || t === ZodFirstPartyTypeKind.ZodDefault
}

function zodToOpenApi(schema: ZodTypeAny): OpenAPIV3.SchemaObject {
  const typeName = schema._def.typeName
  switch (typeName) {
    case ZodFirstPartyTypeKind.ZodString:
      return { type: 'string' }
    case ZodFirstPartyTypeKind.ZodNumber:
      return { type: 'number' }
    case ZodFirstPartyTypeKind.ZodBoolean:
      return { type: 'boolean' }
    case ZodFirstPartyTypeKind.ZodNull:
      return { type: 'null' as any }
    case ZodFirstPartyTypeKind.ZodDate:
      return { type: 'string', format: 'date-time' }
    case ZodFirstPartyTypeKind.ZodLiteral: {
      const value = (schema as z.ZodLiteral<any>)._def.value
      const base: OpenAPIV3.SchemaObject = {}
      if (typeof value === 'string') base.type = 'string'
      if (typeof value === 'number') base.type = 'number'
      if (typeof value === 'boolean') base.type = 'boolean'
      return { ...base, enum: [value] }
    }
    case ZodFirstPartyTypeKind.ZodEnum:
      return { type: 'string', enum: (schema as z.ZodEnum<[string, ...string[]]>)._def.values }
    case ZodFirstPartyTypeKind.ZodNativeEnum: {
      const values = Object.values(
        (schema as z.ZodNativeEnum<any>)._def.values as Record<string, string>
      ).filter((v) => typeof v === 'string')
      return { type: 'string', enum: values }
    }
    case ZodFirstPartyTypeKind.ZodArray:
      return {
        type: 'array',
        items: zodToOpenApi((schema as z.ZodArray<any>)._def.type),
      }
    case ZodFirstPartyTypeKind.ZodUnion:
      return {
        oneOf: (schema as z.ZodUnion<[ZodTypeAny, ...ZodTypeAny[]]>)._def.options.map((option) =>
          zodToOpenApi(option)
        ),
      }
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion: {
      const du = schema as z.ZodDiscriminatedUnion<string, any>
      const options = Array.from(du._def.options.values()) as ZodTypeAny[]
      return {
        oneOf: options.map((opt) => zodToOpenApi(opt)),
        discriminator: { propertyName: du._def.discriminator },
      }
    }
    case ZodFirstPartyTypeKind.ZodObject: {
      const objSchema = schema as z.ZodObject<any>
      const shape = objSchema.shape
      const properties: Record<string, OpenAPIV3.SchemaObject> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries<ZodTypeAny>(shape)) {
        if (!isOptionalSchema(value)) {
          required.push(key)
        }
        properties[key] = zodToOpenApi(value)
      }
      const base: OpenAPIV3.SchemaObject = { type: 'object', properties }
      if (required.length) {
        base.required = required
      }
      return base
    }
    case ZodFirstPartyTypeKind.ZodRecord:
      return {
        type: 'object',
        additionalProperties: zodToOpenApi((schema as z.ZodRecord).valueSchema),
      }
    case ZodFirstPartyTypeKind.ZodOptional:
    case ZodFirstPartyTypeKind.ZodDefault:
      return zodToOpenApi((schema as z.ZodOptional<ZodTypeAny>)._def.innerType)
    case ZodFirstPartyTypeKind.ZodNullable: {
      const inner = zodToOpenApi((schema as z.ZodNullable<ZodTypeAny>)._def.innerType)
      return { ...inner, nullable: true }
    }
    case ZodFirstPartyTypeKind.ZodAny:
    case ZodFirstPartyTypeKind.ZodUnknown:
      return {}
    case ZodFirstPartyTypeKind.ZodEffects:
      return zodToOpenApi((schema as z.ZodEffects<ZodTypeAny>)._def.schema)
    case ZodFirstPartyTypeKind.ZodLazy:
      return {}
    case ZodFirstPartyTypeKind.ZodTuple: {
      const tuple = schema as z.ZodTuple<any>
      return {
        type: 'array',
        prefixItems: tuple._def.items.map((item) => zodToOpenApi(item)),
      } as any
    }
    case ZodFirstPartyTypeKind.ZodIntersection: {
      const intersection = schema as z.ZodIntersection<ZodTypeAny, ZodTypeAny>
      return {
        allOf: [zodToOpenApi(intersection._def.left), zodToOpenApi(intersection._def.right)],
      }
    }
    default:
      return {}
  }
}

function schemaToOpenApiOrRef(
  schema: ZodTypeAny
): OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject {
  if (schema === errorResponseSchema) {
    if (!componentsSchemas.ErrorResponse) {
      componentsSchemas.ErrorResponse = zodToOpenApi(errorResponseSchema)
    }
    return { $ref: '#/components/schemas/ErrorResponse' }
  }
  return zodToOpenApi(schema)
}

function ensureErrorResponseRef(): OpenAPIV3.ReferenceObject {
  if (!componentsSchemas.ErrorResponse) {
    componentsSchemas.ErrorResponse = zodToOpenApi(errorResponseSchema)
  }
  const key = 'Error'
  if (!componentsResponses[key]) {
    componentsResponses[key] = {
      description: 'Error response',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ErrorResponse' },
        },
      },
    }
  }
  return { $ref: `#/components/responses/${key}` }
}

function buildOperation(params: string[], schema: RouteSchema): OpenAPIV3.OperationObject {
  const operation: OpenAPIV3.OperationObject = {
    summary: schema.name,
    description: schema.description ?? schema.name,
    responses: {},
  }

  if (params.length) {
    operation.parameters = params.map<OpenAPIV3.ParameterObject>((param) => ({
      name: param,
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }))
  }

  if (schema.authentication !== 'public') {
    operation.security = [{ bearerAuth: [] }]
  }

  if (schema.requestBodySchema) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: schemaToOpenApiOrRef(schema.requestBodySchema),
        },
      },
    }
  }

  operation.responses = {}

  for (const resp of schema.responses) {
    const schemaForResponse =
      resp.schema ?? (typeof resp.status === 'number' && resp.status >= 400
        ? errorResponseSchema
        : undefined)
    if (schemaForResponse === errorResponseSchema) {
      ;(operation.responses as any)[resp.status] = ensureErrorResponseRef()
      continue
    }
    const response: OpenAPIV3.ResponseObject = {
      description: 'Response',
    }
    if (schemaForResponse) {
      response.content = {
        'application/json': {
          schema: schemaToOpenApiOrRef(schemaForResponse),
        },
      }
    }
    ;(operation.responses as any)[resp.status] = response
  }

  return operation
}

async function loadRouteSchema(filePath: string): Promise<RouteSchemaExport | undefined> {
  const candidates = [
    filePath,
    path.join(path.dirname(filePath), 'schema.ts'),
    path.join(path.dirname(filePath), 'schema.js'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (candidate !== filePath && !(await fileExists(candidate))) {
      continue
    }
    try {
      const mod = await import(pathToFileURL(candidate).href)
      if (mod.schema && typeof mod.schema === 'object') {
        return mod.schema as RouteSchemaExport
      }
      const op =
        mod.GET?.__operation ??
        mod.POST?.__operation ??
        mod.DELETE?.__operation ??
        mod.PATCH?.__operation ??
        mod.GET?.__routeSchema ??
        mod.POST?.__routeSchema ??
        mod.DELETE?.__routeSchema ??
        mod.PATCH?.__routeSchema
      if (op) {
        if (!mod.schema) {
          const record: Record<string, any> = {}
          if (mod.GET?.__operation) record.GET = mod.GET.__operation
          if (mod.POST?.__operation) record.POST = mod.POST.__operation
          if (mod.DELETE?.__operation) record.DELETE = mod.DELETE.__operation
          if (mod.PATCH?.__operation) record.PATCH = mod.PATCH.__operation
          if (Object.keys(record).length) {
            return record as RouteSchemaExport
          }
        }
        return op as RouteSchemaExport
      }
    } catch (err) {
      if (candidate === candidates[candidates.length - 1]) {
        console.warn(`Skipping ${filePath} due to import error:`, err)
      }
    }
  }
  return undefined
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf-8'))

  const routeFiles = await findRouteFiles(apiRoot)
  const paths: OpenAPIV3.PathsObject = {}
  let usesAdminAuth = false

  for (const file of routeFiles) {
    const schema = await loadRouteSchema(file)
    if (!schema) continue

    const { path: routePath, params } = pathFromRouteFile(file)

    for (const [method, definition] of Object.entries(schema)) {
      const httpMethod = method.toLowerCase() as OpenAPIV3.HttpMethods
      if (!paths[routePath]) paths[routePath] = {}
      ;(paths[routePath] as any)[httpMethod] = buildOperation(params, definition)
      if (definition.authentication === 'admin') {
        usesAdminAuth = true
      }
    }
  }

  const doc: OpenAPIV3.Document = {
    openapi: '3.0.3',
    info: {
      title: pkg.name ?? 'API',
      version: pkg.version ?? '0.0.0',
    },
    paths,
    components: {},
  }

  if (usesAdminAuth) {
    doc.components = {
      ...doc.components,
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    }
  }

  if (Object.keys(componentsSchemas).length) {
    doc.components = {
      ...doc.components,
      schemas: {
        ...(doc.components?.schemas ?? {}),
        ...componentsSchemas,
      },
    }
  }

  if (Object.keys(componentsResponses).length) {
    doc.components = {
      ...doc.components,
      responses: {
        ...(doc.components?.responses ?? {}),
        ...componentsResponses,
      },
    }
  }

  const outputPath = path.isAbsolute(options.output)
    ? options.output
    : path.join(projectRoot, options.output)

  const serialized =
    options.format === 'json' ? JSON.stringify(doc, null, 2) : YAML.stringify(doc, { indent: 2 })

  await fs.writeFile(outputPath, serialized, 'utf-8')
  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec written to ${outputPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
