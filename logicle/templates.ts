export function expandEnv(template: string) {
  return template.replace(/\${(\w*)}/g, (match, key) => {
    return process.env[key] || ''
  })
}
