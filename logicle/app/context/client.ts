'use client'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'

export function initi18n(brand?: Record<string, string>) {
  void i18next
    .use(initReactI18next)
    .use(
      resourcesToBackend(async (language: string, namespace: string) => {
        if (namespace == 'all') {
          const logicle = (await import(`../../locales/${language}/logicle.json`))
            .default as Record<string, string>
          const tools = (await import(`../../locales/${language}/tools.json`)).default as Record<
            string,
            string
          >
          return {
            ...logicle,
            ...tools,
            ...(brand || {}),
          }
        } else {
          return import(`../../locales/${language}/${namespace}.json`)
        }
      })
    )
    .init({
      lng: 'en', // let detect the language on client side
      detection: {
        order: ['path', 'htmlTag', 'cookie', 'navigator'],
      },
      preload: [],
      defaultNS: 'all',
    })
}
