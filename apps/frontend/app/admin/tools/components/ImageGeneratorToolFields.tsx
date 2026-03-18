'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { FormField, FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ChevronDown } from 'lucide-react'
import { ImageGeneratorPluginParams } from '@/lib/tools/imagegenerator/interface'
import { ToolFormWithConfig } from './toolFormTypes'
import { SecretEditor } from './SecretEditor'

const ImageGeneratorModels = [
  'dall-e-2',
  'dall-e-3',
  'gpt-image-1',
  'gemini-2.5-flash-image',
  'FLUX.1-kontext-max',
] as const

type ImageGeneratorFormConfig = Omit<ImageGeneratorPluginParams, 'model'> & {
  model: string | null
}

interface Props {
  form: UseFormReturn<ToolFormWithConfig<ImageGeneratorFormConfig>>
}

const ImageGeneratorToolFields = ({ form }: Props) => {
  const { t } = useTranslation()
  const [imageModelMenuOpen, setImageModelMenuOpen] = useState(false)
  const imageModelMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!imageModelMenuRef.current) return
      if (!imageModelMenuRef.current.contains(event.target as Node)) {
        setImageModelMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  return (
    <>
      <FormField
        control={form.control}
        name="configuration.model"
        render={({ field }) => (
          <FormItem label={t('model')}>
            <div ref={imageModelMenuRef} className="relative">
              <Input
                placeholder={t('image_generator_model_placeholder')}
                value={typeof field.value === 'string' ? field.value : ''}
                onClick={() => setImageModelMenuOpen(true)}
                onFocus={() => setImageModelMenuOpen(true)}
                onKeyDown={(evt) => {
                  if (evt.key === 'Escape') {
                    setImageModelMenuOpen(false)
                  }
                }}
                onChange={(evt) => {
                  const nextValue = evt.currentTarget.value.trim()
                  field.onChange(nextValue.length === 0 ? null : nextValue)
                  setImageModelMenuOpen(true)
                }}
              />
              <button
                type="button"
                onClick={() => setImageModelMenuOpen((open) => !open)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t('model')}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              {imageModelMenuOpen && (
                <div className="absolute z-50 mt-1 w-max min-w-[12rem] rounded-md border bg-popover p-1 shadow-md">
                  {(() => {
                    const currentValue = typeof field.value === 'string' ? field.value.trim() : ''
                    if (currentValue.length === 0) return null
                    if (ImageGeneratorModels.some((m) => m === currentValue)) return null
                    return (
                      <div className="px-2 py-1 text-sm text-muted-foreground">{t('custom')}</div>
                    )
                  })()}
                  {ImageGeneratorModels.filter(
                    (m) => m !== (typeof field.value === 'string' ? field.value : null)
                  ).map((m) => {
                    return (
                      <button
                        key={m}
                        type="button"
                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-body1 hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                          field.onChange(m)
                          setImageModelMenuOpen(false)
                        }}
                      >
                        {t(m)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.supportsEditing"
        render={({ field }) => (
          <FormItem
            label={t('image_generator_supports_editing_label')}
            className="flex flex-row items-center space-y-0"
          >
            <Switch
              className="mt-0 ml-auto"
              checked={!!field.value}
              onCheckedChange={(value) => field.onChange(value)}
              disabled={field.disabled}
            ></Switch>
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="configuration.apiKey"
        render={({ field }) => (
          <FormItem label={t('api_key')}>
            <SecretEditor placeholder={t('insert_apikey_placeholder')} {...field} />
          </FormItem>
        )}
      />
    </>
  )
}

export default ImageGeneratorToolFields
