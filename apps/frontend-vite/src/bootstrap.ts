import {
  BRAND_CSS_ELEMENT_ID,
  BRAND_I18N_ELEMENT_ID,
  ENVIRONMENT_ELEMENT_ID,
  readBootstrapJson,
} from '../../../packages/core/src/bootstrapPlaceholders'

// Mirrors apps/frontend/app/context/environmentProvider.tsx's read side —
// staticFrontendVite.ts (the backend-side spike counterpart to
// staticFrontend.ts) splices the same script/style tags into this app's
// index.html at request time, using the exact same
// injectBootstrapData/getEnvironmentPayload/getProvisionedBrandAssets as the
// Next version. Nothing about that mechanism needed to change for the router
// swap — it's app-agnostic string splicing into whatever HTML shell gets
// served.

export interface BootstrapEnvironment {
  appDisplayName: string
  [key: string]: unknown
}

export function readEnvironment(): BootstrapEnvironment | undefined {
  return readBootstrapJson<BootstrapEnvironment>(ENVIRONMENT_ELEMENT_ID)
}

export function readBrandI18n(): unknown {
  return readBootstrapJson(BRAND_I18N_ELEMENT_ID)
}

export { BRAND_CSS_ELEMENT_ID }
