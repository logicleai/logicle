'use client'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'

export function initi18n() {
  i18next
    .use(initReactI18next)
    .use(
      resourcesToBackend((language, namespace) =>
        import(`../../locales/${language}/${namespace}.json`)
      )
    )
    .init({
      lng: 'en', // let detect the language on client side
      detection: {
        order: ['path', 'htmlTag', 'cookie', 'navigator'],
      },
      preload: [],
    })
}
