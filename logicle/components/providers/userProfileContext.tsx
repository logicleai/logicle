'use client'
import { useSWRJson } from '@/hooks/swr'
import { useContext, useEffect } from 'react'
import React from 'react'
import * as dto from '@/types/dto'
import { useTranslation } from 'react-i18next'

type Props = {
  children: React.ReactNode
}

type ContextType = dto.UserProfile | undefined

const UserProfileContext = React.createContext<ContextType>({} as ContextType)

const UserProfileProvider: React.FC<Props> = ({ children }) => {
  const { t, i18n } = useTranslation()
  const { data: user } = useSWRJson<ContextType>(`/api/user/profile`)
  useEffect(() => {
    ;(i18n as any).changeLanguage(user?.preferences.language)
  }, [user?.preferences.language])
  if (!user) return null
  return <UserProfileContext.Provider value={user}>{children}</UserProfileContext.Provider>
}

const useUserProfile = (): ContextType => useContext(UserProfileContext)

export { useUserProfile }

export default UserProfileProvider
