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
  const { data: user } = useSWRJson<ContextType>(`/api/user/profile`)
  return <UserProfileContext.Provider value={user}>{children}</UserProfileContext.Provider>
}

const useUserProfile = (): ContextType => useContext(UserProfileContext)

export { useUserProfile }

export default UserProfileProvider
