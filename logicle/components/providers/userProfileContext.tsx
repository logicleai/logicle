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

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

const UserProfileContext = React.createContext<ContextType>({} as ContextType)

const UserProfileProvider: React.FC<Props> = ({ children }) => {
  let { data: user } = useSWRJson<ContextType>(`/api/user/profile`)
  if (user) {
    const avatarUrl = user.image ? URL.createObjectURL(dataURLtoBlob(user.image)) : undefined
    user = {
      ...user,
      avatarUrl: avatarUrl ?? undefined,
    }
  }
  return <UserProfileContext.Provider value={user}>{children}</UserProfileContext.Provider>
}

const useUserProfile = (): ContextType => useContext(UserProfileContext)

export { useUserProfile }

export default UserProfileProvider
