import OpenAPIParser from '@readme/openapi-parser'
import { OpenAPIV3 } from 'openapi-types'
import YAML from 'yaml'
import { openapi } from '@apidevtools/openapi-schemas'
import AjvDraft4, { ErrorObject } from 'ajv-draft-04'
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

type Range = {
  from: number
  to: number
}

type NodeRanges = {
  keyRange?: Range
  valueRange: Range
}

// Helper function to build an XPath-like path
function buildPath(base: string, key: string | number): string {
  if (typeof key === 'number') {
    return `${base}[${key}]` // Array index
  }
  if (typeof key == 'string') {
    key = key.split('/').join('~1') // replace all '/' with '~1'
  }
  return base ? `${base}/${key}` : key // Nested key
}

// Recursive function to traverse and collect ranges
function traverseWithPath(
  key: YAML.ParsedNode | undefined,
  node: YAML.ParsedNode | null,
  currentPath: string = ''
): Record<string, NodeRanges> {
  let ranges: Record<string, NodeRanges> = {}

  // If the node has a range, add it to the result
  if (node?.range) {
    ranges[`/${currentPath}`] = {
      keyRange: key?.range ? { from: key?.range[0], to: key?.range[1] } : undefined,
      valueRange: {
        from: node.range[0],
        to: node.range[1],
      },
    }
  }

  // Handle mappings (objects)
  if (YAML.isMap(node)) {
    node.items.forEach((item) => {
      const key = item.key as YAML.Scalar<string | number>
      const value = item.value
      const newPath = buildPath(currentPath, key.value)
      ranges = { ...ranges, ...traverseWithPath(item.key, value, newPath) }
    })
  }

  // Handle sequences (arrays)
  if (YAML.isSeq(node)) {
    node.items.forEach((item: YAML.ParsedNode, index: number) => {
      const newPath = buildPath(currentPath, index)
      ranges = { ...ranges, ...traverseWithPath(undefined, item, newPath) }
    })
  }

  // Return collected ranges
  return ranges
}

export function mapErrors(errors: ErrorObject[], doc: YAML.Document.Parsed) {
  if (doc.contents) {
    const rangeMap = traverseWithPath(undefined, doc.contents)
    return errors.map((error) => {
      let path = error.instancePath
      if (error.keyword == 'additionalProperties') {
        path = `${path}/${error.params['additionalProperty']}`
      }
      if (path in rangeMap) {
        let range = rangeMap[path].valueRange
        if (error.keyword == 'additionalProperties' && rangeMap[path].keyRange) {
          range = rangeMap[path].keyRange!
        }
        if (error.keyword == 'type' && rangeMap[path].keyRange) {
          range = rangeMap[path].keyRange!
        }
        if (error.keyword == 'required' && rangeMap[path].keyRange) {
          range = rangeMap[path].keyRange!
        }
        return {
          error,
          range,
        }
      } else {
        return {
          error,
        }
      }
    })
  }
  return []
}
/**
 * Validates the given Swagger API against the Swagger 2.0 or OpenAPI 3.0 and 3.1 schemas.
 *
 * @param {SwaggerObject} api
 */

export function validateSchema(api: any) {
  let ajv: Ajv | AjvDraft4

  // Choose the appropriate schema (Swagger or OpenAPI)
  let schema: any
  if (!api) {
    return { isValid: false, errors: undefined }
  } else if (api.swagger) {
    schema = openapi.v2
    ajv = initializeAjv()
  } else if (api.openapi) {
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
  } else {
    return { isValid: false, errors: undefined }
  }

  // Validate against the schema
  const isValid = ajv.validate(schema, api)
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
    } else if (value.type == 'http') {
      result.set(key, value as OpenAPIV3.SecuritySchemeObject)
    }
  }
  return Array.from(result.keys())
}
