import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  rightSlot?: ReactNode
}

export const ChatDisclaimer = ({ rightSlot }: Props) => {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-2 pb-3 text-[12px] md:px-4 md:pt-3 md:pb-6">
      <div />
      <div className="text-center opacity-50">{t('legal-disclaimer')}</div>
      <div className="flex justify-end">{rightSlot}</div>
    </div>
  )
}
