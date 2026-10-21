import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import type * as dto from '@/types/dto'

export function useDuplicateAssistant() {
  const router = useRouter()
  const pathname = usePathname()
  const pending = useRef<{ destination: string } | null>(null)
  const [duplicatingAssistantId, setDuplicatingAssistantId] = useState<string | null>(null)

  useEffect(() => {
    if (pending.current?.destination !== pathname) return
    pending.current = null
    setDuplicatingAssistantId(null)
  }, [pathname])

  const duplicateAssistant = useCallback(
    async (assistantId: string) => {
      // State alone cannot prevent two activations before React renders again.
      if (pending.current) return
      const operation = { destination: '' }
      pending.current = operation
      setDuplicatingAssistantId(assistantId)
      try {
        const response = await post<dto.AssistantWithOwner>(`/api/assistants/${assistantId}/clone`)
        if (response.error) {
          throw new Error(response.error.message)
        }
        // A cache refresh failure must not invite another clone of an already-created copy.
        await Promise.allSettled([mutate('/api/assistants'), mutate('/api/me/profile')])
        operation.destination = `/assistants/${response.data.id}`
        router.push(operation.destination)
        // Keep the action locked until navigation changes the pathname or unmounts us.
      } catch (error) {
        if (!operation.destination) {
          pending.current = null
          setDuplicatingAssistantId(null)
        }
        toast.error(error instanceof Error ? error.message : String(error))
      }
    },
    [router]
  )

  return { duplicateAssistant, duplicatingAssistantId }
}
