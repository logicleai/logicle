interface languageMap {
  [key: string]: string | undefined
}

interface fenceWrapMap {
  [key: string]: boolean | undefined
}

export const fileExtensionsForLanguage: languageMap = {
  javascript: '.js',
  python: '.py',
  java: '.java',
  c: '.c',
  cpp: '.cpp',
  'c++': '.cpp',
  'c#': '.cs',
  ruby: '.rb',
  php: '.php',
  swift: '.swift',
  'objective-c': '.m',
  kotlin: '.kt',
  typescript: '.ts',
  go: '.go',
  perl: '.pl',
  rust: '.rs',
  scala: '.scala',
  haskell: '.hs',
  lua: '.lua',
  shell: '.sh',
  sql: '.sql',
  html: '.html',
  css: '.css',
  bash: '.sh',
  csv: '.csv',
  // add more file extensions here, make sure the key is same as language prop in CodeBlock.tsx component
}

// Centralized mapping so new fence types can be configured easily.
export const wrapByFenceType: fenceWrapMap = {
  markdown: true,
  md: true,
  text: true,
  txt: true,
}

export const shouldWrapFence = (language?: string) => {
  if (!language) {
    return false
  }

  const normalizedLanguage = language.toLowerCase()
  return wrapByFenceType[normalizedLanguage] ?? false
}

export const generateRandomString = (length: number, lowercase = false) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXY3456789' // excluding similar looking characters like Z, 2, I, 1, O, 0
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return lowercase ? result.toLowerCase() : result
}
