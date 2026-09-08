import * as z from 'zod'

/**
 * `custom_widget` lets an assistant render a small set of vetted, interactive
 * visual components inside a chat message without ever emitting HTML, CSS,
 * JavaScript, file URLs or `/api/files/...` references itself.
 *
 * The model only produces a declarative spec (widget `type` + data, including
 * image references as opaque `fileId`s). The backend validates the spec against
 * the schemas below, authorizes every referenced file for the current user, and
 * returns the validated spec as a tool result. The frontend renders it with a
 * trusted React component picked from a fixed registry.
 *
 * This module is shared: the backend uses it to validate, the frontend uses it
 * to type and render.
 */

export const CUSTOM_WIDGET_TOOL_NAME = 'custom_widget'

/** Name of the single function the tool exposes to the model. */
export const RENDER_WIDGET_FUNCTION_NAME = 'render_widget'

export const imageItemSchema = z.object({
  fileId: z
    .string()
    .min(1)
    .describe('Opaque id of an image file already present in the conversation'),
  label: z.string().min(1).optional().describe('Short caption shown with the image'),
  alt: z.string().optional().describe('Accessibility description of the image'),
})
export type ImageItem = z.infer<typeof imageItemSchema>

// Widget schemas intentionally strip (not reject) unknown keys: models tend to
// pass presentation hints like `autoplay`/`duration` on every widget out of
// habit, and failing the whole call over an extra key is worse than ignoring
// it. Typos in known fields are still caught. `autoplay`/`duration` are
// accepted on any widget and currently ignored by the renderers.
const widgetCommon = {
  autoplay: z.boolean().optional(),
  duration: z.number().nonnegative().optional(),
}

export const imageCompareSpecSchema = z.object({
  type: z.literal('image-compare'),
  ...widgetCommon,
  items: z
    .tuple([imageItemSchema, imageItemSchema])
    .describe('Exactly two images: [0] is shown first, [1] on toggle'),
})
export type ImageCompareSpec = z.infer<typeof imageCompareSpecSchema>

export const imageCarouselSpecSchema = z.object({
  type: z.literal('image-carousel'),
  ...widgetCommon,
  items: z.array(imageItemSchema).min(1).max(24),
})
export type ImageCarouselSpec = z.infer<typeof imageCarouselSpecSchema>

export const widgetSpecSchema = z.discriminatedUnion('type', [
  imageCompareSpecSchema,
  imageCarouselSpecSchema,
])
export type WidgetSpec = z.infer<typeof widgetSpecSchema>
export type WidgetType = WidgetSpec['type']

/**
 * Shape of the `type: 'json'` tool result the frontend picks up. The marker key
 * keeps it unambiguous against any other JSON tool result.
 */
export interface CustomWidgetResultPayload {
  customWidget: WidgetSpec
}

export const isCustomWidgetResultPayload = (value: unknown): value is CustomWidgetResultPayload => {
  if (!value || typeof value !== 'object' || !('customWidget' in value)) return false
  return widgetSpecSchema.safeParse((value as CustomWidgetResultPayload).customWidget).success
}

/** Every `fileId` referenced by a spec, in document order (deduplicated). */
export const widgetFileIds = (spec: WidgetSpec): string[] => {
  const ids = spec.items.map((item) => item.fileId)
  return [...new Set(ids)]
}

/**
 * JSON Schema handed to the model as the `render_widget` parameters. Written by
 * hand (rather than derived from Zod) so the description text stays tuned for
 * the model and the payload stays compact.
 */
export const renderWidgetParametersJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'items'],
  properties: {
    type: {
      type: 'string',
      enum: ['image-compare', 'image-carousel'],
      description:
        "'image-compare' overlays exactly two images in the same box and toggles between them on click (before/after). 'image-carousel' is a horizontally scrollable gallery of one or more images.",
    },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 24,
      description:
        "For 'image-compare' provide exactly two items. Images must already exist in the conversation; reference them by their file id.",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fileId'],
        properties: {
          fileId: { type: 'string', description: 'Id of an image file in the conversation' },
          label: { type: 'string', description: 'Short caption shown with the image' },
          alt: { type: 'string', description: 'Accessibility description of the image' },
        },
      },
    },
    autoplay: {
      type: 'boolean',
      description: 'Optional presentation hint; currently ignored by the renderer',
    },
    duration: {
      type: 'number',
      description: 'Optional autoplay interval in ms (>= 0); currently ignored by the renderer',
    },
  },
} as const

/** Default prompt fragment suggested when the tool is attached to an assistant. */
export const CUSTOM_WIDGET_DEFAULT_PROMPT_FRAGMENT = `
When showing images you may render an interactive widget by calling ${RENDER_WIDGET_FUNCTION_NAME}.
Use "image-compare" to let the user toggle between exactly two images (e.g. before/after an edit),
and "image-carousel" for a scrollable gallery. Reference images by their conversation file id.
Do not emit HTML, image URLs or markdown image tags for this purpose; call the tool instead.
`.trim()
