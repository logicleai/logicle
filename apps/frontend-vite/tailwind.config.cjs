const path = require('node:path')

// Reuses apps/frontend's real theme/plugins config verbatim (colors, radius,
// keyframes, the table-striped/tailwindcss-animate/forms/typography plugins
// — all of it) — only `content` is overridden, since Tailwind resolves those
// globs relative to the current working directory, not the config file's
// location, and needs to scan the real component tree under apps/frontend
// (imported unmodified by the Vite app) rather than apps/frontend-vite's own
// (mostly-empty) source tree.
const base = require('../frontend/tailwind.config.cjs')

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...base,
  content: [
    path.join(__dirname, '../frontend/pages/**/*.{js,ts,jsx,tsx}'),
    path.join(__dirname, '../frontend/components/**/*.{js,ts,jsx,tsx}'),
    path.join(__dirname, '../frontend/app/**/*.{ts,tsx}'),
    path.join(__dirname, './src/**/*.{ts,tsx}'),
  ],
}
