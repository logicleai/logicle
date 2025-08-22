import * as dto from '@/types/dto'

function convertMathToKatexSyntax(text: string) {
  const pattern = /(```[\s\S]*?```|`.*?`)|\\\[([\s\S]*?[^\\])\\\]|\\\((.*?)\\\)/g
  const res = text.replace(pattern, (match, codeBlock, squareBracket, roundBracket) => {
    if (codeBlock) {
      return codeBlock
    } else if (squareBracket) {
      return `$$${squareBracket}$$`
    } else if (roundBracket) {
      return `$${roundBracket}$`
    }
    return match
  })
  return res
}

function expandCitations(text: string, citations: dto.Citation[]): string {
  return text.replace(/\[(\d+)\]/g, (_match, numStr) => {
    const num = parseInt(numStr, 10)
    if (num > 0 && num <= citations.length) {
      const citation = citations[num - 1]
      let url: string
      if (typeof citation === 'string') {
        url = citation
      } else {
        url = citation.url
      }
      return `[${numStr}](${url})`
    } else {
      return `[${numStr}]`
    }
  })
}

export function computeMarkdown(markdown: string, citations?: dto.Citation[]) {
  let expanded = convertMathToKatexSyntax(markdown)
  if (citations) {
    expanded = expandCitations(expanded, citations)
  }
  return expanded
}
