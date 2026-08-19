import { useEffect } from 'react'
import { useEnvironment } from '@/app/context/environmentProvider'

// Real app/layout.tsx set title/favicon via Next's static `metadata` export
// — resolved once at `next build` time from `@/lib/env` (build-time
// process.env), not per-deployment. This does the same job at runtime
// instead, from the same environment payload every other branding bit
// (brand CSS, i18n strings) already comes from — see
// staticFrontendVite.ts's injectBootstrapData — which self-hosted
// deployments can actually vary without a rebuild.
export function BrandMetadata() {
  const environment = useEnvironment()

  useEffect(() => {
    if (environment.appDisplayName) {
      document.title = environment.appDisplayName
    }
  }, [environment.appDisplayName])

  useEffect(() => {
    if (!environment.faviconPath) return
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = environment.faviconPath
  }, [environment.faviconPath])

  return null
}
