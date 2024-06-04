'use client'
import { useSWRJson } from '@/hooks/swr'
import { UserProfileDto } from '@/types/user'
import { useContext } from 'react'
import React from 'react'

type Props = {
  children: React.ReactNode
}

type ContextType =
  | (UserProfileDto & {
      avatarUrl: string | undefined
    })
  | undefined

const UserProfileContext = React.createContext<ContextType>({} as ContextType)

const UserProfileProvider: React.FC<Props> = ({ children }) => {
  let { data: user } = useSWRJson<ContextType>(`/api/user/profile`)
  if (user) {
    user = {
      ...user,
      avatarUrl: user.image ?? undefined,
    }
  }
  return <UserProfileContext.Provider value={user}>{children}</UserProfileContext.Provider>
}

const useUserProfile = (): ContextType => useContext(UserProfileContext)

export { useUserProfile }

export default UserProfileProvider
