import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
  ToolInvokeParams,
} from '@/lib/chat/tools'
import { OpenAiCodeInterpreterInterface, OpenAiCodeInterpreterParams } from './interface'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import { expandEnv, resolveToolSecretReference } from 'templates'
import { getFileWithId, addFile } from '@/models/file'
import { storage } from '@/lib/storage'
import { nanoid } from 'nanoid'
import env from '@/lib/env'
import { logger } from '@/lib/logging'
import path from 'node:path'
import { mimeTypeOfFile } from '@/lib/mimeTypes'
import OpenAI, { toFile } from 'openai'

type ContainerFile = {
  id: string
  path: string
  bytes: number
  created_at: number
}

type UploadedFile = {
  fileId: string
  path: string
}

type ContainerFileCitation = {
  container_id?: string
  file_id?: string
  filename?: string
}

function extractContainerFileCitations(
  output: OpenAI.Responses.Response['output']
): ContainerFileCitation[] {
  if (!output) return []
  const citations: ContainerFileCitation[] = []
  for (const item of output) {
    if (item.type !== 'message') continue
    const content = (item as any).content as Array<any> | undefined
    if (!content) continue
    for (const part of content) {
      const annotations = part?.annotations as Array<any> | undefined
      if (!annotations) continue
      for (const ann of annotations) {
        if (ann?.type !== 'container_file_citation') continue
        citations.push({
          container_id: ann.container_id,
          file_id: ann.file_id,
          filename: ann.filename ?? ann.path,
        })
      }
    }
  }
  return citations
}

export class OpenaiCodeInterpreter
  extends OpenAiCodeInterpreterInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new OpenaiCodeInterpreter(toolParams, params as OpenAiCodeInterpreterParams)
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    private params: OpenAiCodeInterpreterParams
  ) {
    super()
  }

  private async getApiKey(): Promise<string | undefined> {
    if (this.params.apiKey) {
      return this.toolParams.provisioned
        ? expandEnv(this.params.apiKey)
        : await resolveToolSecretReference(this.toolParams.id, this.params.apiKey)
    }
    return process.env.OPENAI_API_KEY
  }

  private getApiBaseUrl(): string {
    return this.params.apiBaseUrl ?? 'https://api.openai.com/v1'
  }

  private getDefaultModel(): string {
    return this.params.model ?? 'gpt-4.1'
  }

  private async getClient(): Promise<OpenAI> {
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      throw new Error('Missing OpenAI API key for openai.code_interpreter tool')
    }
    return new OpenAI({ apiKey, baseURL: this.getApiBaseUrl() })
  }

  private async createContainer({ params }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const name =
      typeof params.name === 'string' && params.name.length > 0
        ? params.name
        : `logicle-ci-${nanoid(6)}`
    const expiresAfterMinutes = 20
    const body: OpenAI.Containers.ContainerCreateParams = {
      name,
      memory_limit: '1g',
    }
    if (expiresAfterMinutes) {
      body.expires_after = { anchor: 'last_active_at', minutes: expiresAfterMinutes }
    }
    const client = await this.getClient()
    const created = await client.containers.create(body)
    return {
      type: 'json',
      value: {
        containerId: created.id,
        container: {
          id: created.id,
          name: created.name,
          status: created.status,
          created_at: created.created_at,
          last_active_at: created.last_active_at ?? null,
          memory_limit: created.memory_limit ?? null,
          expires_after: created.expires_after
            ? {
                anchor: created.expires_after.anchor ?? null,
                minutes: created.expires_after.minutes ?? null,
              }
            : null,
        },
      },
    }
  }

  private async uploadFiles({ params }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const containerId = `${params.containerId ?? ''}`
    if (!containerId) {
      return { type: 'error-text', value: 'containerId is required' }
    }
    const files = Array.isArray(params.files) ? (params.files as Array<UploadedFile>) : []
    if (files.length === 0) {
      return { type: 'error-text', value: 'files must be a non-empty array' }
    }
    const client = await this.getClient()
    const results: Array<{
      file_id: string
      container_file_id: string
      path: string
      bytes: number
    }> = []
    for (const file of files) {
      const fileId = file.fileId
      if (!fileId) {
        return { type: 'error-text', value: 'file_id is required for each file' }
      }
      const fileEntry = await getFileWithId(fileId)
      if (!fileEntry) {
        return { type: 'error-text', value: `File not found: ${fileId}` }
      }
      const content = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
      const upload = await toFile(content, file.path, { type: fileEntry.type })
      const created = await client.containers.files.create(containerId, { file: upload })
      results.push({
        file_id: fileId,
        container_file_id: created.id,
        path: created.path,
        bytes: created.bytes,
      })
    }
    return {
      type: 'json',
      value: {
        containerId: containerId,
        files: results,
      },
    }
  }

  private async listContainerFiles(containerId: string) {
    const collected: ContainerFile[] = []
    const client = await this.getClient()
    const page = await client.containers.files.list(containerId)
    for await (const item of page) {
      collected.push(item as ContainerFile)
    }
    return collected
  }

  private async executeCode({ params }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const containerId = `${params.containerId ?? ''}`
    const code = `${params.code ?? ''}`
    if (!containerId) {
      return { type: 'error-text', value: 'containerId is required' }
    }
    if (!code) {
      return { type: 'error-text', value: 'code is required' }
    }
    const model =
      typeof params.model === 'string' && params.model.length > 0
        ? params.model
        : this.getDefaultModel()
    const client = await this.getClient()
    const response = (await client.responses.create({
      model,
      tools: [
        {
          type: 'code_interpreter',
          container: containerId,
        },
      ],
      tool_choice: 'required',
      instructions:
        'Use the python tool to run the provided code exactly as written. If the code writes files, ensure they are saved under /mnt/data and print their full paths in stdout. Return only raw stdout.',
      include: ['code_interpreter_call.outputs'],
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `Run the following Python code exactly as written. If it writes files, save them under /mnt/data and print their full paths. Return only raw stdout.\n\n${code}`,
            },
          ],
        },
      ],
      stream: false,
      store: false,
    })) as OpenAI.Responses.Response
    const fileCitations = extractContainerFileCitations(response.output)
    const containerFiles = (await this.listContainerFiles(containerId)).map((file) => ({
      id: file.id,
      path: file.path,
      bytes: file.bytes,
      created_at: file.created_at,
    }))
    return {
      type: 'json',
      value: {
        containerId: containerId,
        response_id: response.id,
        output_text: response.output_text,
        file_citations: fileCitations,
        containerFiles: containerFiles,
      },
    }
  }

  private async downloadFiles({
    params,
    uiLink,
  }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const containerId = `${params.containerId ?? ''}`
    if (!containerId) {
      return { type: 'error-text', value: 'containerId is required' }
    }
    const files = Array.isArray(params.files)
      ? (params.files as {
          fileId: string
          path: string
        }[])
      : []
    if (files.length === 0) {
      return { type: 'error-text', value: 'file_ids must be a non-empty array' }
    }
    logger.info('openai.code_interpreter download by file ids', {
      containerId,
      files: JSON.stringify(files),
    })
    const storedFiles: dto.ToolCallResultOutput = { type: 'content', value: [] }
    const storedMetadata: Array<{ file_id: string; stored_id: string }> = []
    const client = await this.getClient()
    for (const file of files) {
      const response = await client.containers.files.content.retrieve(file.fileId, {
        container_id: containerId,
      })
      const buffer = Buffer.from(await response.arrayBuffer())
      const fileName = path.basename(file.path)
      const storagePath = `${nanoid()}-${fileName}`
      await storage.writeBuffer(storagePath, buffer, env.fileStorage.encryptFiles)
      const dbFile = await addFile(
        {
          name: storagePath,
          type:
            response.headers.get('content-type') ??
            mimeTypeOfFile(fileName) ??
            'application/octet-stream',
          size: buffer.byteLength,
        },
        storagePath,
        env.fileStorage.encryptFiles
      )
      storedMetadata.push({ file_id: file.fileId, stored_id: dbFile.id })
      storedFiles.value.push({
        type: 'file',
        id: dbFile.id,
        mimetype: dbFile.type,
        name: dbFile.name,
        size: dbFile.size,
      })
    }
    if (storedMetadata.length > 0) {
      storedFiles.value.unshift({
        type: 'text',
        text: `Stored files: ${JSON.stringify(storedMetadata)}`,
      })
    }
    return storedFiles
  }

  async functions(_model: LlmModel, _context?: ToolFunctionContext): Promise<ToolFunctions> {
    return {
      create_container: {
        description: 'Create a code interpreter container and return its id.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Optional container name' },
          },
          additionalProperties: false,
          required: [],
        },
        invoke: this.createContainer.bind(this),
      },
      upload_files: {
        description: 'Upload files into a container.',
        parameters: {
          type: 'object',
          properties: {
            containerId: {
              type: 'string',
              description: 'Target container id',
            },
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fileId: {
                    type: 'string',
                    description: 'Id of the file to upload',
                  },
                  path: {
                    type: 'string',
                    description: 'Desired path inside the container',
                  },
                },
                required: ['fileId', 'path'],
                additionalProperties: false,
              },
              minItems: 1,
            },
          },
          required: ['containerId', 'files'],
          additionalProperties: false,
        },
        invoke: this.uploadFiles.bind(this),
      },
      execute: {
        description: 'Execute Python code inside a container.',
        parameters: {
          type: 'object',
          properties: {
            containerId: { type: 'string', description: 'Target container id' },
            code: { type: 'string', description: 'Python code to execute' },
            model: { type: 'string', description: 'Optional OpenAI model override' },
          },
          required: ['containerId', 'code'],
          additionalProperties: false,
        },
        invoke: this.executeCode.bind(this),
      },
      download_files: {
        description: 'Download files from a container and store them in Logicle storage.',
        parameters: {
          type: 'object',
          properties: {
            containerId: {
              type: 'string',
              description: 'The container id from which to download files',
            },
            files: {
              type: 'array',
              description: 'Files to download from container',
              items: {
                type: 'object',
                properties: {
                  fileId: {
                    type: 'string',
                    description: 'Id of the file to download',
                  },
                  path: {
                    type: 'string',
                    description: 'path of the file to download',
                  },
                },
              },
              minItems: 1,
            },
          },
          additionalProperties: false,
          required: ['containerId', 'files'],
        },
        invoke: this.downloadFiles.bind(this),
      },
    }
  }
}
