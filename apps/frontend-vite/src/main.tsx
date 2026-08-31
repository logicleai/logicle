import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { installChunkErrorReload } from './reloadOnChunkError'
// Real global stylesheet (Tailwind base/components/utilities + CSS custom
// properties every component's className relies on) — apps/frontend/app/
// layout.tsx used to import this the same way. Processed through Vite's
// built-in PostCSS support via tailwind.config.cjs/postcss.config.cjs
// alongside this file.
import '../../frontend/styles/globals.css'

installChunkErrorReload()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
