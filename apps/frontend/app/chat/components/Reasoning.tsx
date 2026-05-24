import { FC } from 'react'
import { useTranslation } from 'react-i18next'

const BOLD_HEADER = /^\*\*(.+?)\*\*$/

interface Section {
  title?: string
  body: string
}

function splitIntoSections(text: string): Section[] {
  const lines = text.split(/\r?\n/)
  const sections: Section[] = []
  let currentTitle: string | undefined
  let currentLines: string[] = []

  for (const line of lines) {
    const m = line.trim().match(BOLD_HEADER)
    if (m) {
      const body = currentLines.join('\n').trim()
      if (body || currentTitle !== undefined) {
        sections.push({ title: currentTitle, body })
      }
      currentTitle = m[1].trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  const body = currentLines.join('\n').trim()
  if (body || currentTitle !== undefined) {
    sections.push({ title: currentTitle, body })
  }

  return sections
}

export const Reasoning: FC<{ text: string }> = ({ text }) => {
  const { t } = useTranslation()
  if (text.length === 0) {
    return <div className="text-sm">{t('reasoning')}</div>
  }

  const sections = splitIntoSections(text)

  // No bold headers — plain text fallback
  if (sections.length === 1 && sections[0].title === undefined) {
    return <div className="text-sm whitespace-pre-wrap">{text}</div>
  }

  return (
    <div className="flex flex-col gap-2">
      {sections.map((section, i) => (
        <div key={i}>
          {section.title && <div className="text-sm font-semibold">{section.title}</div>}
          {section.body && (
            <div className="text-sm whitespace-pre-wrap text-muted-foreground">{section.body}</div>
          )}
        </div>
      ))}
    </div>
  )
}
