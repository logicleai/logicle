// Element ids server.ts uses when it splices bootstrap data into the static
// HTML shell as it serves it (see attachBootstrapInjection in
// apps/backend/server.ts). The tags themselves are appended to the raw HTML
// string right before `</head>`/`</body>` — never rendered by React — so
// there's no hydration mismatch between the statically built placeholder-free
// HTML and the per-request data server.ts adds on top.

export const BRAND_CSS_ELEMENT_ID = '__logicle_brand_css__'
export const ENVIRONMENT_ELEMENT_ID = '__logicle_env__'
export const BRAND_I18N_ELEMENT_ID = '__logicle_brand_i18n__'

export function readBootstrapJson<T>(elementId: string): T | undefined {
  if (typeof document === 'undefined') return undefined
  const el = document.getElementById(elementId)
  if (!el?.textContent) return undefined
  try {
    return JSON.parse(el.textContent) as T
  } catch {
    return undefined
  }
}
