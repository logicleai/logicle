import { FC } from 'react'
import { useTranslation } from 'react-i18next'

export const Reasoning: FC<{ text: string }> = ({ text }) => {
  const { t } = useTranslation()
  return (
    <div className="text-sm whitespace-pre-wrap">{text.length === 0 ? t('reasoning') : text}</div>
  )
}
