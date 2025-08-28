import * as React from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandSeparator,
} from '@/components/ui/command'
import { ChevronDown } from 'lucide-react'
import { LlmModel, LlmModelCapabilities } from '@/lib/chat/models'
import { LetterAvatar } from '@/components/ui'
import { IconEye } from '@tabler/icons-react'

// --- External model types (from your app) ----------------------------------
export interface Model {
  backendId: string
  backendName: string
  llmModel: LlmModel
}
// If these are already declared in your codebase, remove the stubs below and
// import them instead.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ProviderType {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EngineOwner {}

function formatContext(n?: number): string {
  if (n == null) return ''

  if (n < 1000) return `${n}`

  if (n < 1_000_000) {
    const k = n / 1000
    // decide whether to keep one decimal (e.g. 1.2K) or round (e.g. 12K, 123K)
    return k < 10 ? `${k.toFixed(1)}K` : `${Math.round(k)}K`
  }
  const m = n / 1_000_000
  return m < 10 ? `${m.toFixed(1)}M` : `${Math.round(m)}M`
}

function capabilityIcons(cap?: LlmModelCapabilities) {
  if (!cap) return null
  const items: React.ReactNode[] = []
  if (cap.vision) items.push(<IconEye key="vision" className="h-3.5 w-3.5" aria-label="Vision" />)
  if (!items.length) return null
  return <div className="flex items-center gap-1 opacity-70">{items}</div>
}

const ModelRow: React.FC<{
  model: Model
  showBackendIcons?: boolean
}> = ({ model, showBackendIcons }) => (
  <div className="flex w-full items-center justify-between">
    <div className="flex min-w-0 items-center gap-3">
      {showBackendIcons && (
        <LetterAvatar className="shrink-0" name={model.backendName}></LetterAvatar>
      )}
      <div className="flex items-center gap-2 flex-1">
        <span className="truncate">{model.llmModel.name}</span>
        <span className="text-xs text-muted-foreground truncate max-w-[8rem]">
          {String(model.llmModel.owned_by)}
        </span>
      </div>
      {capabilityIcons(model.llmModel.capabilities)}
    </div>
    <span className="">{formatContext(model.llmModel.context_length)}</span>
  </div>
)

// --- The main component -----------------------------------------------------
// Controlled component that receives external models and value.
export default function ModelSelect({
  models,
  value,
  onChange,
  disabled,
  placeholder = 'Select a model',
}: {
  models: Model[]
  value: Model | null
  onChange: (m: Model) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = React.useState(false)

  // Group rows by backend for headers
  const groups = React.useMemo(() => {
    return models.reduce<Record<string, Model[]>>((acc, m) => {
      const key = m.backendName
      ;(acc[key] ||= []).push(m)
      return acc
    }, {})
  }, [models])
  const showBackendIcons = Object.keys(groups).length > 1
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          role="combobox"
          className="py-2 px-3 flex w-full rounded-md border border-input bg-background justify-between items-center focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {value ? (
            <ModelRow showBackendIcons={showBackendIcons} model={value} />
          ) : (
            <span className="truncate text-gray">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[--radix-popover-trigger-width]">
        <Command>
          <div className="p-2">
            <CommandInput placeholder="Search models" className="h-9" />
          </div>
          <CommandList className="max-h-80">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              No models found.
            </CommandEmpty>

            {Object.entries(groups).map(([group, rows]) => (
              <React.Fragment key={group}>
                <CommandGroup heading={group}>
                  {rows.map((m) => (
                    <CommandItem
                      onSelect={() => {
                        onChange(m)
                        setOpen(false)
                      }}
                      className="group aria-selected:bg-muted/60"
                    >
                      <ModelRow
                        showBackendIcons={showBackendIcons}
                        key={`${m.backendId}:${m.llmModel.id}`}
                        model={m}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
