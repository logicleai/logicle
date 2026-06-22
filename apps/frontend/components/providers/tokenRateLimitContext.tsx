'use client'
import { useSWRJson } from '@/hooks/swr'
import { useContext } from 'react'
import React from 'react'
import * as dto from '@/types/dto'

const TokenRateLimitContext = React.createContext<dto.TokenRateLimit | undefined>(undefined)

const TokenRateLimitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useSWRJson<dto.TokenRateLimit>('/api/me/token-rate-limit')
  return <TokenRateLimitContext.Provider value={data}>{children}</TokenRateLimitContext.Provider>
}

export const useTokenRateLimit = () => useContext(TokenRateLimitContext)

export default TokenRateLimitProvider
