'use client'

import { initi18n } from './client'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useUserProfile } from '@/components/providers/userProfileContext'

let inited = false

export default function ClientI18nProvider({
  children,
  brand,
}: {
  children: React.ReactNode
  brand: Record<string, string>
}): React.ReactNode {
  if (!inited) {
    initi18n(brand)
    inited = true
  }

  const userProfile = useUserProfile()
  const { i18n } = useTranslation()

  // We don't want to wait for language load (i.e. show nothing) when
  // the user has changed the language
  const [waitForLanguageLoad, setWaitForLanguageLoad] = useState<boolean>(true)
  const [loadedLanguage, setLoadedLanguage] = useState<string>('')
  const i18any = i18n as any
  const browserLanguages = navigator.languages // Array of languages
  const defaultLanguage = browserLanguages[0] // First preferred language
  const preferredLanguage = userProfile?.preferences.language ?? 'default'
  const targetLanguage = preferredLanguage === 'default' ? defaultLanguage : preferredLanguage
  const currentUserId = userProfile?.id
  useEffect(() => {
    const changeLanguage = async () => {
      await i18any.changeLanguage(targetLanguage)
      setLoadedLanguage(targetLanguage)
      setWaitForLanguageLoad(false)
    }
    void changeLanguage()
  }, [targetLanguage])

  // When we switch user... we want to enforce that the user's language is loaded
  useEffect(() => {
    setWaitForLanguageLoad(true)
  }, [currentUserId])

  if (loadedLanguage !== targetLanguage) {
    if (waitForLanguageLoad) {
      return null
    }
  }
  return <>{children}</>
}
