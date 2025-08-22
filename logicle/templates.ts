export function expandEnv(template: string) {
  return template.replace(/\${(\w*)}/g, (_match, key) => {
    return process.env[key] || ''
  })
}
