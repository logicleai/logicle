import { describe, expect, test } from 'vitest'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunction, ToolParams } from '@/lib/chat/tools'
import {
  TranslateDeepl,
  normalizeSourceLang,
  normalizeTargetLang,
  translatedFileName,
} from '../implementation'

const model = { model: 'gpt-4o-mini' } as unknown as LlmModel

const toolParams: ToolParams = {
  id: 't1',
  name: 'translate.deepl',
  promptFragment: '',
  provisioned: false,
}

describe('TranslateDeepl tool', () => {
  test('builder parses the configuration and applies defaults', () => {
    const tool = TranslateDeepl.builder(
      toolParams,
      { apiKey: 'key' },
      model.model
    ) as TranslateDeepl
    expect(tool).toBeInstanceOf(TranslateDeepl)
    expect(tool.supportedMedia).toContain('application/pdf')
    expect(tool.supportedMedia).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  })

  test('exposes a document and a text translation function', async () => {
    const tool = TranslateDeepl.builder(
      toolParams,
      { apiKey: 'key' },
      model.model
    ) as TranslateDeepl
    const functions = await tool.functions(model, { userId: 'u1' })
    expect(Object.keys(functions).sort()).toEqual(['translate_document', 'translate_text'])
  })

  test('rejects a document translation without a file id', async () => {
    const tool = TranslateDeepl.builder(
      toolParams,
      { apiKey: 'key' },
      model.model
    ) as TranslateDeepl
    const functions = await tool.functions(model, { userId: 'u1' })
    const translateDocument = functions.translate_document as ToolFunction
    const result = await translateDocument.invoke({
      params: { targetLang: 'IT' },
      userId: 'u1',
    } as never)
    expect(result).toEqual({ type: 'error-text', value: 'fileId is required' })
  })

  test('rejects a text translation without a target language', async () => {
    const tool = TranslateDeepl.builder(
      toolParams,
      { apiKey: 'key' },
      model.model
    ) as TranslateDeepl
    const functions = await tool.functions(model, { userId: 'u1' })
    const translateText = functions.translate_text as ToolFunction
    const result = await translateText.invoke({
      params: { text: 'ciao' },
      userId: 'u1',
    } as never)
    expect(result).toEqual({ type: 'error-text', value: 'targetLang is required' })
  })
})

describe('language and file name normalization', () => {
  test('target languages keep their region, source languages drop it', () => {
    expect(normalizeTargetLang(' en-gb ')).toBe('EN-GB')
    expect(normalizeSourceLang(' en-gb ')).toBe('EN')
  })

  test('the target language is inserted before the extension', () => {
    expect(translatedFileName('report.docx', 'IT')).toBe('report_IT.docx')
    expect(translatedFileName('deck.final.pptx', 'EN-GB')).toBe('deck.final_EN-GB.pptx')
    expect(translatedFileName('README', 'DE')).toBe('README_DE')
  })
})
