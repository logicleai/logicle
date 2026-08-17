'use client'
import Login from './LoginPanel'
import * as dto from '@/types/dto'
import { get } from '@/lib/fetch'
import { useEffect, useState } from 'react'

interface LoginConfig {
  identityProviders: dto.PublicIdpConnection[]
  enableSignup: boolean
}

export default function LoginPage() {
  const [config, setConfig] = useState<LoginConfig>()

  useEffect(() => {
    document.title = 'Login'
    void get<LoginConfig>('/api/auth/login').then((response) => {
      if (response.error) return
      setConfig(response.data)
    })
  }, [])

  if (!config) return null
  return <Login connections={config.identityProviders} enableSignup={config.enableSignup} />
}
