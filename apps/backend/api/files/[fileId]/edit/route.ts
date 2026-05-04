import { db } from '@/db/database'
import { canAccessFile } from '@/backend/lib/files/authorization'
import {
  error,
  forbidden,
  notFound,
  ok,
  operation,
  responseSpec,
  errorSpec,
} from '@/lib/routes'
import { storage } from '@/lib/storage'
import { ensureABView } from '@/backend/lib/utils'
import { editWithGemini } from '@/backend/lib/imagegen/providers/gemini'
import { editWithOpenAI } from '@/backend/lib/imagegen/providers/openai'
import { editWithTogether } from '@/backend/lib/imagegen/providers/together'
import { expandToolParameter } from '@/backend/lib/tools/configSecrets'
import {
  isGeminiImageModel,
  isImageEditingSupportedModel,
  isOpenAiImageModel,
  isTogetherImageModel,
} from '@/backend/lib/imagegen/models'
import { materializeFile } from '@/backend/lib/files/materialize'
import {
  generatedImageExtensionForMimeType,
  normalizeGeneratedImageMimeType,
} from '@/backend/lib/imagegen/files'
import { nanoid } from 'nanoid'
import sharp from 'sharp'
import { z } from 'zod'

const editResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimetype: z.string(),
  size: z.number(),
})

const buildWholeImageEditPrompt = (userPrompt: string): string => {
  return [
    "Edit the provided image according to the user's request.",
    `User request: "${userPrompt}"`,
    'Important constraints:',
    '- Treat this as an edit of the existing image, not a full regeneration.',
    '- Preserve all unrelated parts of the image.',
    '- Keep the same subject identity, composition, pose, perspective, and style unless explicitly requested.',
    '- Do not add or remove unrelated objects.',
  ].join('\n')
}

const buildMaskedEditPrompt = (userPrompt: string): string => {
  return [
    'Edit only the masked region of the provided image.',
    `User request: "${userPrompt}"`,
    'Important constraints:',
    '- Only change the masked area.',
    '- Preserve everything outside the mask.',
    '- Blend the edited region naturally with surrounding pixels.',
    '- Do not alter unrelated objects, faces, text, layout, lighting, or background.',
  ].join('\n')
}

const buildFollowUpEditPrompt = (userPrompt: string): string => {
  return [
    'Apply this follow-up edit to the latest image in this editing flow.',
    `User request: "${userPrompt}"`,
    'Important constraints:',
    '- Continue from the current image.',
    '- Do not revert to an older version.',
    '- Preserve unrelated details.',
    '- Do not reinterpret the entire image unless explicitly requested.',
  ].join('\n')
}

const toTogetherDimension = (value: number): number => {
  const clamped = Math.max(256, Math.min(1536, value))
  const snapped = Math.round(clamped / 64) * 64
  return Math.max(256, Math.min(1536, snapped))
}

export const POST = operation({
  name: 'Edit image',
  description: 'Edit an image file using an AI model with an optional brush mask.',
  authentication: 'user',
  responses: [
    responseSpec(200, editResultSchema),
    errorSpec(400),
    errorSpec(403),
    errorSpec(404),
    errorSpec(500),
  ] as const,
  implementation: async ({ params, request, session }) => {
    const file = await db
      .selectFrom('File')
      .selectAll()
      .where('id', '=', params.fileId)
      .executeTakeFirst()
    if (!file) return notFound()
    if (!(await canAccessFile(session, params.fileId))) return forbidden()

    const formData = await request.formData()
    const prompt = formData.get('prompt')
    const conversationId = formData.get('conversationId')
    const maskEntry = formData.get('mask')

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return error(400, 'prompt is required')
    }

    // Find image-editing capable tool for this conversation's assistant
    const tools = await db
      .selectFrom('Tool')
      .innerJoin(
        'AssistantVersionToolAssociation as AVTA',
        'AVTA.toolId',
        'Tool.id'
      )
      .innerJoin('AssistantVersion as AV', 'AV.id', 'AVTA.assistantVersionId')
      .innerJoin('Assistant as A', (join) =>
        join.on((eb) =>
          eb.or([
            eb('A.publishedVersionId', '=', eb.ref('AV.id')),
            eb('A.draftVersionId', '=', eb.ref('AV.id')),
          ])
        )
      )
      .innerJoin('Conversation as C', 'C.assistantId', 'A.id')
      .where('C.id', '=', typeof conversationId === 'string' ? conversationId : '')
      .selectAll('Tool')
      .execute()

    const editingTool = tools.find((tool) => {
      try {
        const config = JSON.parse(tool.configuration) as { model?: string }
        return config.model && isImageEditingSupportedModel(config.model)
      } catch {
        return false
      }
    })

    if (!editingTool) {
      return error(400, 'No image editing tool configured for this conversation')
    }

    const toolConfig = JSON.parse(editingTool.configuration) as {
      apiKey: string
      model: string
    }
    const toolParams = {
      id: editingTool.id,
      name: editingTool.name,
      provisioned: !!editingTool.provisioned,
      promptFragment: editingTool.promptFragment,
    }
    const apiKey = await expandToolParameter(toolParams, toolConfig.apiKey)
    const model = toolConfig.model

    const fileContent = await storage.readBuffer(file.path, !!file.encrypted)
    const imageData = Buffer.from(ensureABView(fileContent))

    let maskData: Buffer | undefined
    if (maskEntry instanceof Blob) {
      maskData = Buffer.from(await maskEntry.arrayBuffer())
    }

    const metadata = await sharp(imageData).metadata()
    const width = metadata.width ?? 1024
    const height = metadata.height ?? 1024

    if (maskData && !isOpenAiImageModel(model)) {
      return error(400, 'Masked edits are currently supported only with OpenAI image editing models')
    }

    const internalPrompt = [
      buildFollowUpEditPrompt(prompt),
      maskData ? buildMaskedEditPrompt(prompt) : buildWholeImageEditPrompt(prompt),
    ].join('\n\n')

    const editRequest = {
      apiKey,
      model,
      prompt: internalPrompt,
      images: [{ data: imageData, fileName: file.name, mimeType: file.type }],
      ...(maskData
        ? { mask: { data: maskData, fileName: 'mask.png', mimeType: 'image/png' } }
        : {}),
      n: 1,
      size: isOpenAiImageModel(model) ? 'auto' : `${toTogetherDimension(width)}x${toTogetherDimension(height)}`,
    }

    let editResult
    if (isOpenAiImageModel(model)) {
      editResult = await editWithOpenAI(editRequest)
    } else if (isGeminiImageModel(model)) {
      editResult = await editWithGemini(editRequest)
    } else if (isTogetherImageModel(model)) {
      editResult = await editWithTogether(editRequest)
    } else {
      return error(400, 'Model does not support image editing')
    }

    const imgData = editResult.data[0]
    if (!imgData?.b64_json) {
      return error(500, 'Image provider returned no result')
    }

    const imgBinaryData = Buffer.from(imgData.b64_json, 'base64')
    const mimeType = normalizeGeneratedImageMimeType(imgData.mimeType)
    const ext = generatedImageExtensionForMimeType(mimeType)
    const name = `${nanoid()}.${ext}`

    const owner =
      typeof conversationId === 'string' && conversationId
        ? { ownerType: 'CHAT' as const, ownerId: conversationId }
        : { ownerType: 'USER' as const, ownerId: session.userId }

    const dbFile = await materializeFile({
      content: imgBinaryData,
      name,
      mimeType,
      owner,
    })

    return ok({
      id: dbFile.id,
      name: dbFile.name,
      mimetype: mimeType,
      size: imgBinaryData.byteLength,
    })
  },
})
