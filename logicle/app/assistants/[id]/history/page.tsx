'use client'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSWRJson } from '@/hooks/swr'
import { AssistantVersion } from '@/db/schema'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssistantForm } from '../../components/AssistantForm'

const AssistantHistory = () => {
  const { id } = useParams() as { id: string }
  const url = `/api/assistants/${id}/history`
  const { data } = useSWRJson<AssistantVersion[]>(url)
  const assistantVersions = data ?? []
  return (
    <div className="flex">
      <ScrollArea className="scroll-workaround h-full p-2 w-200">
        <ul>
          {assistantVersions.map((assistantVersion) => (
            <li
              key={assistantVersion.id ?? ''}
              className={`flex items-center py-1 gap-2 rounded hover:bg-gray-100 truncate`}
            >
              <Button variant="ghost" size="link" className="w-100 overflow-hidden p-2">
                <span className="flex-1 first-letter:capitalize truncate">
                  {assistantVersion.updatedAt}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </ScrollArea>
      <div>{'Here the form'}</div>
    </div>
  )
}

export default AssistantHistory
