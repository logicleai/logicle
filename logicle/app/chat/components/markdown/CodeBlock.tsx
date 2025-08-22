import { IconCheck, IconClipboard, IconDownload } from '@tabler/icons-react'
import { FC, memo, useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism'

import { useTranslation } from 'react-i18next'

import { generateRandomString, fileExtensionsForLanguage } from '@/lib/codeblock'

interface Props {
  language?: string
  value: string
  forExport?: boolean
}

const computeExtensionForLanguage = (language?: string) => {
  if (language === undefined) {
    return '.file'
  } else if (fileExtensionsForLanguage[language]) {
    return fileExtensionsForLanguage[language]
  } else {
    return `.${language}`
  }
}

export const CodeBlock: FC<Props> = memo(({ language, value, forExport }) => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState<boolean>(false)

  const copyToClipboard = async () => {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      return
    }

    await navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true)

      setTimeout(() => {
        setIsCopied(false)
      }, 2000)
    })
  }

  const downloadAsFile = () => {
    const fileExtension = computeExtensionForLanguage(language)
    const suggestedFileName = `file-${generateRandomString(3, true)}${fileExtension}`
    const blob = new Blob([value], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = suggestedFileName
    link.href = url
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
  return (
    <div className="codeblock relative font-sans text-[16px]">
      {!(forExport ?? false) && (
        <div className="flex items-center justify-between py-1.5 px-4">
          <span className="text-xs lowercase text-white">{language}</span>

          <div className="flex items-center">
            <button
              type="button"
              title={t('copy_to_clipboard')}
              className="flex gap-1.5 items-center rounded bg-none p-1 text-xs text-white"
              onClick={copyToClipboard}
            >
              {isCopied ? <IconCheck size={18} /> : <IconClipboard size={18} />}
              {isCopied ? t('copied!') : t('copy_code')}
            </button>
            <button
              type="button"
              title={t('download')}
              className="flex items-center rounded bg-none p-1 text-xs text-white"
              onClick={downloadAsFile}
            >
              <IconDownload size={18} />
            </button>
          </div>
        </div>
      )}

      <SyntaxHighlighter language={language} style={oneDark} customStyle={{ margin: 0 }}>
        {value}
      </SyntaxHighlighter>
    </div>
  )
})
CodeBlock.displayName = 'CodeBlock'
