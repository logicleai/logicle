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
import { Button } from '@/components/ui/button'
import { Check, ChevronDown, Plus, Search, Sparkles, Zap } from 'lucide-react'
import { LlmModel, LlmModelCapabilities } from '@/lib/chat/models'
import { LetterAvatar } from '@/components/ui'

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

// --- Small UI bits ----------------------------------------------------------
const ContextChip = ({ text }) => {
  return <div></div>
}

function formatContext(n?: number) {
  if (!n && n !== 0) return ''
  if (n >= 1000) {
    const k = Math.round(n / 100) / 10 // one decimal
    return `${k}K`
  }
  return `${n}`
}

function capabilityIcons(cap?: LlmModelCapabilities) {
  if (!cap) return null
  const items: React.ReactNode[] = []
  if (cap.vision) items.push(<Sparkles key="vision" className="h-3.5 w-3.5" aria-label="Vision" />)
  if (!items.length) return null
  return <div className="flex items-center gap-1 opacity-70">{items}</div>
}

const ModelRow: React.FC<{
  model: Model
  selected: boolean
  onPick: () => void
}> = ({ model, selected, onPick }) => (
  <CommandItem onSelect={onPick} className="group aria-selected:bg-muted/60">
    <div className="flex w-full items-center justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {/* Provider avatar placeholder */}
        <LetterAvatar className="shrink-0" name={model.backendName}></LetterAvatar>
        <div className="flex items-center gap-2 flex-1">
          <span className="truncate font-medium">{model.llmModel.name}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[8rem]">
            {String(model.llmModel.owned_by)}
          </span>
        </div>
        {capabilityIcons(model.llmModel.capabilities)}
      </div>
      <span className="">{formatContext(model.llmModel.context_length)}</span>
    </div>
  </CommandItem>
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

  // Group rows by provider for headers
  const groups = React.useMemo(() => {
    return models.reduce<Record<string, Model[]>>((acc, m) => {
      const key = String(m.llmModel.provider || 'Other')
      ;(acc[key] ||= []).push(m)
      return acc
    }, {})
  }, [models])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          role="combobox"
          className="py-2 px-3 flex w-full rounded-md border border-input bg-background justify-between items-center focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex items-center gap-2 truncate text-body1">
            <span className={`truncate ${value ? '' : 'text-gray'}`}>
              {value ? value.llmModel.name : placeholder}
            </span>
            {value && <ContextChip text={formatContext(value.llmModel.context_length)} />}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-96">
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
                    <ModelRow
                      key={`${m.backendId}:${m.llmModel.id}`}
                      model={m}
                      selected={value?.llmModel.id === m.llmModel.id}
                      onPick={() => {
                        onChange(m)
                        setOpen(false)
                      }}
                    />
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
