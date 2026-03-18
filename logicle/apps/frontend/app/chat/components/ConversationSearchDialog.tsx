import { useTranslation } from 'react-i18next'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Dialog } from '@radix-ui/react-dialog'
import { post } from '@/lib/fetch'
import React from 'react'
import toast from 'react-hot-toast'
import { Form, FormField, FormItem } from '@/components/ui/form'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import * as dto from '@/types/dto'
import Link from 'next/link'

interface Params {
  onClose: () => void
}

const schema = z.object({
  query: z.string().optional(),
})

type FormFields = z.infer<typeof schema>

type Hit = dto.ConversationWithMessages & {
  snippet?: string
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function makeSnippet(text: string, term: string): string {
  if (!text) return ''

  const lowerText = text.toLowerCase()
  const lowerTerm = term.toLowerCase()

  const index = lowerText.indexOf(lowerTerm)
  if (index === -1) return ''

  const CONTEXT = 40
  const start = Math.max(0, index - CONTEXT)
  const end = Math.min(text.length, index + term.length + CONTEXT)

  const windowText = text.slice(start, end)

  // Highlight ALL occurrences of term (case-insensitive) in the window,
  // while escaping all content.
  const escapedTerm = escapeRegExp(term)
  const regex = new RegExp(escapedTerm, 'ig')

  let result = ''
  let lastIndex = 0

  for (const match of windowText.matchAll(regex)) {
    const matchIndex = match.index ?? 0
    const matchText = match[0]

    // plain chunk before the match
    result += escapeHtml(windowText.slice(lastIndex, matchIndex))
    // highlighted match
    result += `<b>${escapeHtml(matchText)}</b>`

    lastIndex = matchIndex + matchText.length
  }

  // trailing chunk after the last match
  result += escapeHtml(windowText.slice(lastIndex))

  if (start > 0) {
    result = `…${result}`
  }
  if (end < text.length) {
    result = `${result}…`
  }

  return result
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractSnippet(conversation: dto.ConversationWithMessages, searchTerm: string): string {
  const term = searchTerm.trim()
  if (!term) return ''

  for (const msg of conversation.messages) {
    if (msg.role === 'assistant') {
      for (const part of msg.parts) {
        if (part.type === 'text' && part.text) {
          const snippet = makeSnippet(part.text, term)
          if (snippet) return snippet
        }
      }
    } else if (msg.role === 'user') {
      const text = msg.content ?? ''
      const snippet = makeSnippet(text, term)
      if (snippet) return snippet
    }
  }

  return ''
}
export const ConversationSearchDialog: React.FC<Params> = ({ onClose }) => {
  const { t } = useTranslation()

  const form = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      query: '',
    },
  })

  const [results, setResults] = React.useState<Hit[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const performSearch = React.useCallback(
    async (query: string) => {
      const trimmed = query.trim()

      // you can decide whether to clear or keep last results when empty
      if (!trimmed) {
        setResults([])
        setError(null)
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const url = `/api/conversations/search?query=${encodeURIComponent(trimmed)}`
        const response = await post<dto.ConversationWithMessages[]>(url, { query: trimmed })

        if (response.error) {
          setError(response.error.message)
          return
        }
        setResults(
          response.data.map((c) => {
            return {
              ...c,
              snippet: extractSnippet(c, query),
            }
          })
        )
      } catch (err) {
        console.error(err)
        setError(t('generic-error'))
        toast.error(t('generic-error'))
      } finally {
        setIsLoading(false)
      }
    },
    [t]
  )

  // debounce search when query changes
  const queryValue = form.watch('query')

  React.useEffect(() => {
    if (queryValue === undefined) return

    const handle = setTimeout(() => {
      void performSearch(queryValue || '')
    }, 500)

    return () => clearTimeout(handle)
  }, [queryValue, performSearch])

  // optional: search on Enter as well
  async function handleSubmit(values: FormFields) {
    await performSearch(values.query || '')
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-[48rem] h-3/4 min-h-0 flex flex-col overflow-hidden">
        <DialogHeader className="font-bold">
          <DialogTitle>{t('search_chats')}</DialogTitle>
        </DialogHeader>

        <Form
          {...form}
          className="space-y-6 flex-1 min-h-0 flex flex-col"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <FormField
            control={form.control}
            name="query"
            render={({ field }) => (
              <FormItem>
                <Input placeholder={t('search_placeholder')} autoFocus {...field} />
              </FormItem>
            )}
          />

          {/* Results area */}
          <div className="border rounded-md p-3 min-h-0 overflow-auto space-y-2 flex-1">
            {isLoading && <p className="text-sm text-muted-foreground">{t('searching')}...</p>}

            {!isLoading && error && <p className="text-sm text-destructive">{error}</p>}

            {!isLoading &&
              !error &&
              results.length === 0 &&
              (queryValue?.trim()?.length ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground">{t('no-results')}</p>
              )}

            {!isLoading && !error && results.length > 0 && (
              <ul className="space-y-1">
                {results.map((c) => (
                  <Link
                    key={c.conversation.id}
                    href={`/chat/${c.conversation.id}`}
                    onClick={onClose}
                  >
                    <li className="flex items-start gap-3 rounded-xl px-3 py-2 cursor-pointer hover:bg-accent/60 transition-colors">
                      <div className="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-muted-foreground/20">
                        <span className="text-xs text-muted-foreground">💬</span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {c.conversation.name || t('untitled-conversation')}
                          </div>

                          {c.conversation.lastMsgSentAt && (
                            <div className="ml-auto text-[0.7rem] text-muted-foreground whitespace-nowrap">
                              {new Date(c.conversation.lastMsgSentAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        {c.snippet && (
                          // biome-ignore-start lint/security/noDangerouslySetInnerHtml: not dangerous (I hope)
                          <div
                            className="mt-0.5 text-xs text-muted-foreground truncate"
                            dangerouslySetInnerHTML={{ __html: c.snippet }}
                          />
                          // biome-ignore-end lint/security/noDangerouslySetInnerHtml: not dangerous (I hope)
                        )}{' '}
                      </div>
                    </li>
                  </Link>
                ))}
              </ul>
            )}
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
