const path = require('node:path')

// Explicit `config:` path, not a bare `tailwindcss: {}` — otherwise the
// Tailwind plugin's own zero-config search (from process.cwd(), not from
// this file's directory) can resolve relative `content` globs against the
// wrong directory and silently produce an empty stylesheet. See
// tailwind.config.cjs's own comment for the matching reason `content` here
// uses absolute paths too.
module.exports = {
  plugins: {
    tailwindcss: { config: path.join(__dirname, 'tailwind.config.cjs') },
    autoprefixer: {},
  },
}
