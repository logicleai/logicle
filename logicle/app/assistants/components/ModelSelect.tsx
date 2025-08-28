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
import { IconEye } from '@tabler/icons-react'
import googleIcon from '../../../assets/google-color-icon.svg'
import anthropicIcon from '../../../assets/claude-ai-icon.svg'
import openaiIcon from '../../../assets/openai-icon.svg'
import perplexityIcon from '../../../assets/perplexity-icon.svg'
import Image from 'next/image'

// --- External model types (from your app) ----------------------------------
export interface Model {
  backendId: string
  backendName: string
  llmModel: LlmModel
}

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

function ownerIcon(model: Model) {
  if (model.llmModel.owned_by === 'anthropic') {
    return anthropicIcon
  } else if (model.llmModel.owned_by === 'google') {
    return googleIcon
  } else if (model.llmModel.owned_by === 'openai') {
    return openaiIcon
  } else if (model.llmModel.owned_by === 'perplexity') {
    return perplexityIcon
  } else {
    return null
  }
}

function capabilityIcons(cap?: LlmModelCapabilities) {
  if (!cap) return null
  const items: React.ReactNode[] = []
  if (cap.vision) items.push(<IconEye key="vision" className="h-6 w-6" aria-label="Vision" />)
  if (!items.length) return null
  return <div className="flex items-center gap-1 opacity-70">{items}</div>
}

const ModelRow: React.FC<{
  model: Model
  showBackend?: boolean
}> = ({ model, showBackend }) => (
  <div className="flex w-full items-center justify-between gap-2">
    <Image alt={model.llmModel.name} height="20" width="20" src={ownerIcon(model)} />
    <div className="flex items-center gap-2 flex-1">
      <span className="truncate">{model.llmModel.name}</span>
      {showBackend && (
        <span className="text-xs text-muted-foreground truncate max-w-[8rem] pt-[2px]">
          {model.backendName}
        </span>
      )}
    </div>
    {capabilityIcons(model.llmModel.capabilities)}
    <span className="w-12 overflow-hidden text-right">
      {formatContext(model.llmModel.context_length)}
    </span>
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
      const key = m.llmModel.owned_by
      if (!acc[key]) acc[key] = []
      acc[key].push(m)
      return acc
    }, {})
  }, [models])
  const showBackend = new Set(models.map((m) => m.backendId)).size > 1
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          className="py-2 px-3 flex w-full rounded-md border border-input bg-background justify-between items-center focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {value ? (
            <ModelRow showBackend={showBackend} model={value} />
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
                      key={`${m.backendId}:${m.llmModel.id}`}
                      onSelect={() => {
                        onChange(m)
                        setOpen(false)
                      }}
                      className="group aria-selected:bg-muted/60"
                    >
                      <ModelRow
                        showBackend={showBackend}
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
