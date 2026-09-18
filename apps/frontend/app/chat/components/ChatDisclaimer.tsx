import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  rightSlot?: ReactNode
}

export const ChatDisclaimer = ({ rightSlot }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-3 text-[12px] md:grid md:grid-cols-[1fr_auto_1fr] md:px-4 md:pt-3 md:pb-6">
      <div className="hidden md:block" />
      <div className="flex-1 text-center opacity-50 md:flex-none">{t('legal-disclaimer')}</div>
      <div className="flex shrink-0 justify-end">{rightSlot}</div>
    </div>
  )
}
