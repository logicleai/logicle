'use client'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'

export function initi18n() {
  void i18next
    .use(initReactI18next)
    .use(
      resourcesToBackend((language: string, namespace: string) => {
        if (namespace == 'all') {
          return Promise.all([
            import(`../../locales/${language}/logicle.json`),
            import(`../../locales/${language}/tools.json`),
          ]).then(([logicleModule, toolsModule]) => ({
            ...logicleModule.default,
            ...toolsModule.default,
          }))
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
