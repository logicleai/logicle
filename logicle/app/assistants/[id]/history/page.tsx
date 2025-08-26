'use client'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSWRJson } from '@/hooks/swr'
import { AssistantVersion } from '@/db/schema'
import { ScrollArea } from '@/components/ui/scroll-area'
import * as dto from '@/types/dto'
import { AssistantForm } from '../../components/AssistantForm'
import { useEffect, useState } from 'react'
import { get } from '@/lib/fetch'

const AssistantHistory = () => {
  const { id } = useParams() as { id: string }
  const url = `/api/assistants/${id}/history`
  const { data } = useSWRJson<AssistantVersion[]>(url)
  const [assistantVersionId, setAssistantVersionId] = useState<string | undefined>()
  const [assistantVersion, setAssistantVersion] = useState<dto.AssistantDraft | undefined>()
  const assistantVersions = data ?? []

  useEffect(() => {
    const doLoad = async () => {
      if (assistantVersionId) {
        const assistantUrl = `/api/assistants/drafts/${assistantVersionId}`
        const response = await get<dto.AssistantDraft>(assistantUrl)
        if (response.error) {
          setAssistantVersion(undefined)
        } else {
          setAssistantVersion(response.data)
        }
      }
    }
    void doLoad()
  }, [assistantVersionId])
  return (
    <div className="flex">
      <ScrollArea className="scroll-workaround h-full p-2 w-200">
        <ul>
          {assistantVersions.map((assistantVersion) => (
            <li
              key={assistantVersion.id ?? ''}
              className={`flex items-center py-1 gap-2 rounded hover:bg-gray-100 truncate`}
            >
              <Button
                variant="ghost"
                size="link"
                className="w-100 overflow-hidden p-2"
                onClick={() => setAssistantVersionId(assistantVersion.id)}
              >
                <span className="flex-1 first-letter:capitalize truncate">
                  {assistantVersion.updatedAt}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <div className="flex-1">
        {assistantVersion && (
          <AssistantForm assistant={assistantVersion} onSubmit={() => {}}></AssistantForm>
        )}
      </div>
    </div>
  )
}

export default AssistantHistory
