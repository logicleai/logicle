'use client'
import { useSWRJson } from '@/hooks/swr'
import { useContext } from 'react'
import React from 'react'
import * as dto from '@/types/dto'

type Props = {
  children: React.ReactNode
}

type ContextType = dto.UserProfile | undefined

const UserProfileContext = React.createContext<ContextType>({} as ContextType)

const UserProfileProvider: React.FC<Props> = ({ children }) => {
  const { data: user, error } = useSWRJson<ContextType>(`/api/user/profile`)
  // We render nothing until we get either a profile or an error (reasonably... a 401)
  if (!user && !error) {
    return
  }
  return <UserProfileContext.Provider value={user}>{children}</UserProfileContext.Provider>
}

const useUserProfile = (): ContextType => useContext(UserProfileContext)

export { useUserProfile }

export default UserProfileProvider
