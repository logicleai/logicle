import { useTranslation } from 'react-i18next'

export const ChatDisclaimer = () => {
  const { t } = useTranslation()
  return (
    <div className="pt-2 pb-3 text-center text-[12px] opacity-50 md:px-4 md:pt-3 md:pb-6">
      {t('legal-disclaimer')}
    </div>
  )
}
