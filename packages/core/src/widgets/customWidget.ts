import * as z from 'zod'

/**
 * `custom_widget` is a Markdown fence, on the same footing as ```mermaid: the
 * assistant emits it inline in its reply, and Logicle's Markdown renderer
 * delegates it to a trusted React component. The fence body is a small YAML DSL
 * whose `type` selects the widget.
 *
 * The model produces only declarative data — widget `type`, and image
 * references as opaque `fileId`s. It never emits HTML, CSS, JavaScript, image
 * URLs or `/api/files/...` paths; the renderer builds those from the `fileId`,
 * and `/api/files/{id}/content` already authorizes per user.
 *
 * This module is schema-only (Zod). The YAML parse lives in
 * `parseCustomWidget.ts` so the `yaml` dependency stays out of any eager bundle.
 */

/** Fenced-code language that marks a custom widget: ```custom_widget */
export const CUSTOM_WIDGET_FENCE_LANG = 'custom_widget'

export const imageItemSchema = z.object({
  fileId: z
    .string()
    .min(1)
    .describe('Opaque id of an image file already present in the conversation'),
  label: z.string().min(1).optional().describe('Short caption shown with the image'),
  alt: z.string().optional().describe('Accessibility description of the image'),
})
export type ImageItem = z.infer<typeof imageItemSchema>

export const imageCompareSpecSchema = z.object({
  type: z.literal('image-compare'),
  items: z
    .tuple([imageItemSchema, imageItemSchema])
    .describe('Exactly two images: [0] is shown first, [1] on toggle'),
})
export type ImageCompareSpec = z.infer<typeof imageCompareSpecSchema>

export const imageCarouselSpecSchema = z.object({
  type: z.literal('image-carousel'),
  items: z.array(imageItemSchema).min(1).max(24),
})
export type ImageCarouselSpec = z.infer<typeof imageCarouselSpecSchema>

export const widgetSpecSchema = z.discriminatedUnion('type', [
  imageCompareSpecSchema,
  imageCarouselSpecSchema,
])
export type WidgetSpec = z.infer<typeof widgetSpecSchema>
export type WidgetType = WidgetSpec['type']
