# `custom_widget` tool

## Purpose

`custom_widget` lets an assistant render a small set of vetted interactive
components inside a chat reply **without ever emitting HTML, CSS, JavaScript,
file URLs, `TENANT_URL` or `/api/files/...` references**.

The model only produces a declarative spec — a widget `type` plus its data, where
images are referenced by opaque conversation `fileId`s. The backend validates
that spec, authorizes every referenced file for the invoking user, and returns
the validated spec as a tool result. The frontend renders it with a trusted
React component chosen from a fixed registry.

This is the safe realization of
[logicleai/logicle-issues#298](https://github.com/logicleai/logicle-issues/issues/298):
the model-authored surface is a JSON payload constrained by a schema, not markup.

### Why a tool call and not a markdown fence

The issue proposed a ` ```custom_widget ` fence carrying a YAML payload inside the
assistant's free text. We use a **tool call** instead:

- **Provenance.** A tool call ties the widget (and its `fileId`s) to an
  invocation we control. Free text is just an assertion by the model; a prompt
  injection could emit a fence referencing another user's file id.
- **Streaming.** Tool-call arguments are already parsed incrementally by the chat
  run machine. Parsing YAML out of a token stream means handling partial fences,
  nested fences (the issue's own examples need four-backtick fences), and
  escaping.
- **No new syntax.** Reuses `ToolCall` / `ToolCallResult`, the confirmation flow
  (`requireConfirm`), and the existing tool-result rendering path.
- **No YAML.** Tool arguments are JSON; the YAML footguns (type coercion,
  anchors, `!!` tags) never enter the picture.

### Why the result is a validated spec, not an HTML string

Returning rendered HTML from the tool was considered and rejected:

- The chat markdown sanitizer (`apps/frontend/app/chat/components/Markdown.tsx`)
  strips `<style>`, so an HTML `image-compare` built on the CSS checkbox-hack
  would not survive it; keeping a second, laxer HTML pipeline just for widgets
  widens the XSS surface for no benefit.
- A React component is theme-aware (dark/light tokens), accessible (real
  `<button>`, `aria-pressed`, focus ring) and testable.
- The security property the issue wanted — "the model does not emit
  HTML/JS/CSS/URLs" — is fully preserved: the model emits a spec, our trusted
  code emits the DOM.

## Architecture

```
model calls render_widget(spec)
        ↓
widgetSpecSchema.safeParse           (packages/core/src/tools/customWidget.ts)
        ↓
canAccessFile(userId, fileId) per image   (apps/backend/lib/tools/customwidget)
        ↓
tool result  { type: 'json', value: { customWidget: <validated spec> } }
        ↓
ToolMessage.tsx  →  isCustomWidgetResultPayload
        ↓
<CustomWidget spec>  →  registry  →  <ImageCompare> | <ImageCarousel>
```

| Concern                                            | Owner                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Shared schema, types, JSON Schema, prompt fragment | `packages/core/src/tools/customWidget.ts`                                                              |
| Tool registration                                  | `packages/core/src/tools/schemas.ts`, `tools.ts`; `apps/backend/lib/tools/registry.ts`, `enumerate.ts` |
| Validation + file authorization                    | `apps/backend/lib/tools/customwidget/implementation.ts`                                                |
| Rendering                                          | `apps/frontend/app/chat/components/widgets/`                                                           |
| Result dispatch                                    | `apps/frontend/app/chat/components/ToolMessage.tsx`                                                    |

## The `render_widget` function

Single function exposed to the model. Parameters (JSON Schema in
`renderWidgetParametersJsonSchema`):

| Field      | Type                                  | Notes                                                                    |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `type`     | `"image-compare" \| "image-carousel"` | required                                                                 |
| `items`    | array of `{ fileId, label?, alt? }`   | required; **exactly two** for `image-compare`, 1–24 for `image-carousel` |
| `autoplay` | boolean                               | optional presentation hint, currently ignored by the renderer            |
| `duration` | number (ms, >= 0)                     | optional, currently ignored                                              |

`fileId` must reference an **image** file already present in the conversation
(uploaded by the user or produced by an earlier tool call).

### Result

- Success: `{ type: 'json', value: { customWidget: <validated spec> } }`
- Failure (invalid spec, unknown/unauthorized file, non-image file):
  `{ type: 'error-text', value: 'Unable to display <type>: <reason>' }`

On failure the frontend shows a small isolated fallback box; the rest of the
message is unaffected.

## Widgets

### `image-compare`

Two images in the same box; a click toggles between them (before/after). The
toggle is a trusted `useState`, never model JavaScript. `items[0]` is shown
first.

```json
{
  "type": "image-compare",
  "items": [
    { "fileId": "file_abc123", "label": "Edited", "alt": "Image after the edit" },
    { "fileId": "file_def456", "label": "Original" }
  ]
}
```

### `image-carousel`

Horizontally scrollable gallery, CSS scroll-snap, no scripted behaviour. Images
render in `items` order; not clickable.

```json
{
  "type": "image-carousel",
  "items": [
    { "fileId": "file_1", "label": "Front" },
    { "fileId": "file_2", "label": "Side" },
    { "fileId": "file_3", "label": "Back" }
  ]
}
```

## Adding a new widget

1. Add a spec schema to `packages/core/src/tools/customWidget.ts` and extend
   `widgetSpecSchema` and `renderWidgetParametersJsonSchema`.
2. Add a React component under
   `apps/frontend/app/chat/components/widgets/` that takes
   `{ spec, resolveFileUrl }`.
3. Register it in the `switch` in `widgets/CustomWidget.tsx`.

No new tool, route, or migration is involved.

## Keeping the prompt small ("dormant" capability)

The capability costs nothing until an admin attaches a `custom_widget` tool to an
assistant:

- **Not attached** → no prompt fragment, no tool definition. Zero cost.
- **Attached** → one short prompt fragment
  (`CUSTOM_WIDGET_DEFAULT_PROMPT_FRAGMENT`, ~4 lines) plus the compact
  `render_widget` JSON Schema. The per-widget detail lives in the schema
  `description` fields, not in prose.

Suggested `promptFragment` when creating the tool in
**Admin → Tools → Custom widget**:

```
When showing images you may render an interactive widget by calling render_widget.
Use "image-compare" to let the user toggle between exactly two images (e.g. before/after an edit),
and "image-carousel" for a scrollable gallery. Reference images by their conversation file id.
Do not emit HTML, image URLs or markdown image tags for this purpose; call the tool instead.
```

### Future: schema-injected skill

If the widget catalog grows, move the per-widget schemas out of the always-on
tool definition and expose a discovery step (`render_widget` with no `type`
returns the catalog, or inject the catalog as a skill only when the conversation
looks image-related). Not worth the indirection for two widgets.

## Security notes

- The model never sees or provides a URL. `resolveFileUrl` is frontend-only and
  builds `/api/files/{id}/content`, which is authorized by the existing
  same-origin cookie-auth path.
- Every `fileId` is checked with `canAccessFile({ userId }, fileId)` **and**
  verified to be an image, server-side, before the spec is returned. A spec
  referencing a file the user cannot read fails closed. (This is the same
  per-file authorization the image-generation tool applies to its inputs; a
  user can still reference their own image from another of their conversations.)
- No HTML/CSS/JS from the model is ever parsed or rendered. Widget markup is
  emitted entirely by trusted React components.
- `autoplay` / `duration` are accepted on any widget but not acted upon. The
  spec schemas **strip** unknown keys rather than rejecting them: models tend to
  attach stray presentation hints, and failing the whole call over an extra key
  is worse than ignoring it. Typos in known fields are still validation errors,
  and an unknown `type` still fails closed.
