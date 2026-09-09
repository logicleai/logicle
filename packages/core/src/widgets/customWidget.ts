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
 * The fence language (`custom_widget`) is wired in `Markdown.tsx`.
 */

const imageItemSchema = z.object({
  fileId: z.string().min(1),
  label: z.string().min(1).optional(),
  alt: z.string().optional(),
})

const imageCompareSpecSchema = z.object({
  type: z.literal('image-compare'),
  items: z.tuple([imageItemSchema, imageItemSchema]),
})
export type ImageCompareSpec = z.infer<typeof imageCompareSpecSchema>

const imageCarouselSpecSchema = z.object({
  type: z.literal('image-carousel'),
  items: z.array(imageItemSchema).min(1).max(24),
})
export type ImageCarouselSpec = z.infer<typeof imageCarouselSpecSchema>

export const widgetSpecSchema = z.discriminatedUnion('type', [
  imageCompareSpecSchema,
  imageCarouselSpecSchema,
])
export type WidgetSpec = z.infer<typeof widgetSpecSchema>
