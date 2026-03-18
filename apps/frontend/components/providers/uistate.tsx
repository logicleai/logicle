import { useState } from 'react'
import { useUserProfile } from './userProfileContext'

type UIProps = Record<string, unknown>

const parseUIState = (key: string): UIProps => {
  const data = localStorage.getItem(key)
  try {
    if (data) {
      return JSON.parse(data)
    }
  } catch {
    console.log('Failed parsing cache storage')
  }
  return {}
}

export function useUiState<T = string>(propName: string, defaultValue: T): [T, (input: T) => void] {
  const profile = useUserProfile()
  const key = `ui/${profile?.id || ''}`
  const [uiProps, setUiProps] = useState<UIProps>(() => parseUIState(key))
  const propValue = (uiProps[propName] ?? defaultValue) as T
  const setPropValue = (value: T) => {
    const uiState = parseUIState(key)
    uiState[propName] = value
    localStorage.setItem(key, JSON.stringify(uiState))
    setUiProps(uiState)
  }
  return [propValue, setPropValue]
}
