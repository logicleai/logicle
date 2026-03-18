export type JsonPrimitive = string | number | boolean | null
export type JSONValue = JsonPrimitive | JSONValue[] | { [key: string]: JSONValue }
