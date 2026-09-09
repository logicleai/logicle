# `custom_widget` Markdown fence

## Purpose

`custom_widget` lets an assistant render a small set of vetted interactive
visual components **inline in its reply**, by writing a fenced code block —
exactly like ` ```mermaid `. Logicle's Markdown renderer recognizes the
`custom_widget` language and delegates the fence body to a trusted React
component.

````markdown
```custom_widget
type: image-compare
items:
  - fileId: "file_abc123"
    label: "Nuova"
    alt: "Versione nuova dell'immagine"
  - fileId: "file_def456"
    label: "Originale"
```
````

The model produces only declarative data. It never emits HTML, CSS, JavaScript,
image URLs, `TENANT_URL` or `/api/files/...` paths — the renderer builds the
image URL from the `fileId`, and `/api/files/{id}/content` already authorizes
per user.

Implements [logicleai/logicle-issues#298](https://github.com/logicleai/logicle-issues/issues/298).

## Why a fence (not a function call)

The rule, from the issue discussion:

- **Document content → Markdown fence.** The widget is part of the response: the
  model decides that it exists, where it appears among the paragraphs, in what
  order, and with what data. The Markdown is the complete source of truth — save
  it, copy it, edit it, re-render it elsewhere and everything needed is there.
- **Conversation-flow control → function call.** A blocking question, a required
  multiple choice, a confirmation that pauses execution — those belong to the
  interaction protocol, and a function call is right for them. `custom_widget` is
  not that; it is passive visual content.

Consequences of the fence choice:

- The response stays self-sufficient — no widget state living outside the
  document in the tool-call protocol.
- The model controls placement inline (`paragraph → widget → paragraph → widget`).
- The user keeps agency: editing the response edits the widget (swap an image,
  add an item, fix a label, move or duplicate it).
- One output language: extended Markdown, not a second parallel channel.
- Consistent with the existing ` ```mermaid ` fence.
- Export keeps working (see below).

## The DSL

YAML, parsed with the **`failsafe` schema** so every scalar stays a string:
`label: No` stays `"No"` (not `false` — the "Norway problem"), `alt: 3.0` stays
`"3.0"`. Structure is then validated with Zod
(`packages/core/src/widgets/customWidget.ts`); unknown keys are stripped.

| Field      | Where     | Notes                                                                                            |
| ---------- | --------- | ------------------------------------------------------------------------------------------------ |
| `type`     | top level | `image-compare` \| `image-carousel`, required                                                    |
| `items`    | top level | list of `{ fileId, label?, alt? }`; **exactly 2** for `image-compare`, 1–24 for `image-carousel` |
| `autoplay` | top level | `image-compare` only, optional boolean, **reserved for a future autoplay, currently ignored**    |
| `duration` | top level | `image-compare` only, optional ms (`>= 0`), reserved with `autoplay`, currently ignored          |
| `fileId`   | item      | id of an image already in the conversation, required                                             |
| `label`    | item      | short caption, optional                                                                          |
| `alt`      | item      | accessibility text, optional                                                                     |

`autoplay` / `duration` are coerced from their YAML string form (`autoplay: false`
→ `false`, `duration: 1000` → `1000`) and never fail the widget: a bad value is
simply dropped.

### `image-compare`

Two images in the same box; a click toggles between them (before/after). The
toggle is a trusted `useState`. `items[0]` is shown first.

### `image-carousel`

Horizontally scrollable gallery, CSS scroll-snap, no scripted behaviour, images
in `items` order.

## Rendering path

```
custom_widget fence in assistant Markdown
        |  Markdown.tsx  (code renderer, next to the mermaid branch)
CustomWidgetFence  (lazy)
        |  parseCustomWidget(source)   packages/core/src/widgets/parseCustomWidget.ts
YAML failsafe parse  ->  widgetSpecSchema (Zod)
        |  ok                              |  error
<CustomWidget spec>                   <CustomWidgetFallback message>
        |  switch(spec.type)
<ImageCompare> | <ImageCarousel>      (apps/frontend/app/chat/components/widgets/)
```

An incomplete fence (still streaming, no closing ` ``` `) does not render until
it closes — same as mermaid. On a parse or validation failure the fence renders
a small isolated fallback box (`Unable to display <type>: <reason>`); the rest of
the message is unaffected.

| Concern               | Owner                                                             |
| --------------------- | ----------------------------------------------------------------- |
| DSL schema + types    | `packages/core/src/widgets/customWidget.ts`                       |
| YAML parse + validate | `packages/core/src/widgets/parseCustomWidget.ts`                  |
| Fence wiring          | `apps/frontend/app/chat/components/Markdown.tsx`                  |
| Fence component       | `apps/frontend/app/chat/components/widgets/CustomWidgetFence.tsx` |
| Widget renderers      | `apps/frontend/app/chat/components/widgets/`                      |

## Adding a widget

1. Add a spec schema to `packages/core/src/widgets/customWidget.ts` and extend
   `widgetSpecSchema`.
2. Add a component under `apps/frontend/app/chat/components/widgets/` taking
   `{ spec, resolveFileUrl }`.
3. Add a `case` to the `switch` in `widgets/CustomWidget.tsx`.

No new route, migration, tool registration or admin UI.

## Teaching the model the DSL

There is no auto-injected schema (that was the function-call design). The DSL
description is a prompt fragment, and the reusable way to ship it is a
**prompt-only tool** — a `dummy`-type tool (Admin → Tools → "Prompt only")
whose `promptFragment` carries the instructions below:

- An admin attaches it to whichever assistants should be able to render widgets.
- It is dormant otherwise — not attached, nothing is injected, no cost.
- No code: `dummy` already exists, is admin-creatable, and can be provisioned
  (`ansible/base/logicle/provisioning/20-standard-tools.yaml.j2` in
  `logicle-infra-deploy` ships one named "Widget grafici" to every tenant).

Suggested `promptFragment` (indented so the nested fence reads literally):

    Puoi mostrare widget grafici scrivendo un fenced code block con linguaggio
    custom_widget, posizionato inline dove il widget deve apparire nella risposta.

    - type: image-compare  -> esattamente due immagini, click per alternarle (prima/dopo)
    - type: image-carousel -> 1-24 immagini, scroll orizzontale

    Ogni item ha: fileId (l'id del file nella conversazione), label (opzionale),
    alt (opzionale). Referenzia le immagini solo per fileId. Non usare HTML ne
    sintassi immagine Markdown per questo scopo.

    Esempio:

    ```custom_widget
    type: image-compare
    items:
      - fileId: <id>
        label: Originale
      - fileId: <id>
        label: Modificata
    ```

## Export

Logicle can export the last response (Markdown / HTML — see
`AssistantMessageGroup`).

- **Markdown export**: the ` ```custom_widget ` fence and its DSL are preserved
  as-is (the response text passes through untouched). A consumer that knows the
  extension can re-render it.
- **HTML export**: the response is rendered through the same `Markdown`
  component (`forExport`), so the fence renders to the widget markup —
  `<img>` elements plus captions — in the exported document.

Either way the response source keeps everything needed; nothing is reconstructed
from outside the document.

## Security notes

- No HTML/CSS/JS from the model is ever parsed or rendered. Widget markup is
  emitted entirely by trusted React components from a fixed registry.
- The model provides no URLs. `resolveFileUrl` is frontend-only and builds
  `/api/files/{id}/content`, which authorizes per user (`canAccessFile`). A
  `fileId` a prompt injection slipped into a fence either fails to load (403) or
  loads an image the viewer may already see — no new boundary is crossed.
- YAML is parsed with the `failsafe` schema (no type coercion) and the default
  `maxAliasCount` (billion-laughs protection). No anchors/tags reach application
  code.
- An unknown `type` or a malformed spec fails closed to the fallback box.
