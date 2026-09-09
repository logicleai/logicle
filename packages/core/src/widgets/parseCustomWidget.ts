import { parse, YAMLParseError } from 'yaml'
import { widgetSpecSchema, type WidgetSpec } from './customWidget'

export type ParseCustomWidgetResult = { ok: true; spec: WidgetSpec } | { ok: false; error: string }

/**
 * Parses a ```custom_widget fence body into a validated {@link WidgetSpec}.
 *
 * YAML is parsed with the `failsafe` schema so every scalar stays a string:
 * `label: No` stays `"No"` and does not become `false` (the "Norway problem"),
 * `alt: 3.0` stays `"3.0"`. Every field of the DSL is a string, so nothing is
 * lost. Structure is then validated by Zod; unknown keys are stripped, a bad
 * `type` or a malformed shape produces an error string for an isolated fallback.
 */
export function parseCustomWidget(source: string): ParseCustomWidgetResult {
  let data: unknown
  try {
    data = parse(source, { schema: 'failsafe' })
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof YAMLParseError
          ? `Unable to display widget: invalid YAML (${err.message.split('\n')[0]})`
          : 'Unable to display widget: could not parse',
    }
  }

  const parsed = widgetSpecSchema.safeParse(data)
  if (parsed.success) {
    return { ok: true, spec: parsed.data }
  }

  const typeHint =
    data &&
    typeof data === 'object' &&
    'type' in data &&
    typeof (data as { type?: unknown }).type === 'string'
      ? (data as { type: string }).type
      : 'widget'
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
    .join('; ')
  return { ok: false, error: `Unable to display ${typeHint}: ${detail}` }
}
