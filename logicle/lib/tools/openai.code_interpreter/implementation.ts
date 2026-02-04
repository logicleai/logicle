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
import FormData from 'form-data'
import env from '@/lib/env'
import { logger } from '@/lib/logging'
import path from 'node:path'
import { mimeTypeOfFile } from '@/lib/mimeTypes'

type ContainerFile = {
  id: string
  path: string
  bytes: number
  created_at: number
}

type ContainerListResponse = {
  data: ContainerFile[]
  first_id?: string | null
  last_id?: string | null
  has_more?: boolean
}

type ContainerCreateResponse = {
  id: string
}

type ContainerFileCreateResponse = ContainerFile

type ResponsesCreateOutput = {
  id: string
  output?: Array<{
    type: string
    [key: string]: unknown
  }>
  output_text?: string
}

type ContainerFileCitation = {
  container_id?: string
  file_id?: string
  filename?: string
}

function extractContainerFileCitations(
  output: ResponsesCreateOutput['output']
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

  private getDefaultMemoryLimit(): string {
    return this.params.memoryLimit ?? '1g'
  }

  private async openaiFetch(path: string, init: RequestInit): Promise<Response> {
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      throw new Error('Missing OpenAI API key for openai.code_interpreter tool')
    }
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${apiKey}`)
    if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json')
    }
    return fetch(`${this.getApiBaseUrl()}${path}`, {
      ...init,
      headers,
    })
  }

  private async openaiJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.openaiFetch(path, init)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} ${text}`)
    }
    return (await response.json()) as T
  }

  private async createContainer({ params }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const name =
      typeof params.name === 'string' && params.name.length > 0
        ? params.name
        : `logicle-ci-${nanoid(6)}`
    const memoryLimit =
      typeof params.memory_limit === 'string' && params.memory_limit.length > 0
        ? params.memory_limit
        : this.getDefaultMemoryLimit()
    const expiresAfterMinutes = 20
    const body: Record<string, unknown> = {
      name,
      memory_limit: memoryLimit,
    }
    if (expiresAfterMinutes) {
      body.expires_after = { anchor: 'last_active_at', minutes: expiresAfterMinutes }
    }
    const created = await this.openaiJson<ContainerCreateResponse>('/containers', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return {
      type: 'json',
      value: {
        container_id: created.id,
        container: created,
      },
    }
  }

  private async uploadFiles({ params }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const containerId = `${params.container_id ?? ''}`
    if (!containerId) {
      return { type: 'error-text', value: 'container_id is required' }
    }
    const files =
      Array.isArray(params.files) && params.files.length > 0
        ? (params.files as Array<Record<string, unknown>>)
        : params.file_id
        ? [{ file_id: params.file_id, path: params.path }]
        : []
    if (files.length === 0) {
      return { type: 'error-text', value: 'files must be a non-empty array' }
    }
    const results: Array<Record<string, unknown>> = []
    for (const file of files) {
      const fileId = `${file.file_id ?? ''}`
      if (!fileId) {
        return { type: 'error-text', value: 'file_id is required for each file' }
      }
      const fileEntry = await getFileWithId(fileId)
      if (!fileEntry) {
        return { type: 'error-text', value: `File not found: ${fileId}` }
      }
      const content = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
      const form = new FormData()
      const desiredPath =
        typeof file.path === 'string' && file.path.length > 0 ? file.path : fileEntry.name
      form.append('file', content, {
        filename: desiredPath,
        contentType: fileEntry.type || undefined,
      })
      const response = await this.openaiFetch(`/containers/${containerId}/files`, {
        method: 'POST',
        body: form as any,
        headers: form.getHeaders(),
      })
      if (!response.ok) {
        const text = await response.text()
        return {
          type: 'error-text',
          value: `OpenAI API error: ${response.status} ${response.statusText} ${text}`,
        }
      }
      const created = (await response.json()) as ContainerFileCreateResponse
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
        container_id: containerId,
        files: results,
      },
    }
  }

  private async listContainerFiles(containerId: string) {
    const collected: ContainerFile[] = []
    let after: string | undefined
    for (;;) {
      const query = after ? `?after=${encodeURIComponent(after)}` : ''
      const response = await this.openaiJson<ContainerListResponse>(
        `/containers/${containerId}/files${query}`,
        {
          method: 'GET',
        }
      )
      collected.push(...(response.data ?? []))
      if (!response.has_more || !response.last_id) break
      after = response.last_id
    }
    return collected
  }

  private async executeCode({ params }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const containerId = `${params.container_id ?? ''}`
    const code = `${params.code ?? ''}`
    if (!containerId) {
      return { type: 'error-text', value: 'container_id is required' }
    }
    if (!code) {
      return { type: 'error-text', value: 'code is required' }
    }
    const model =
      typeof params.model === 'string' && params.model.length > 0
        ? params.model
        : this.getDefaultModel()
    const response = await this.openaiJson<ResponsesCreateOutput>('/responses', {
      method: 'POST',
      body: JSON.stringify({
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
      }),
    })
    let toolContainerId: string | undefined
    const fileCitations = extractContainerFileCitations(response.output)
    const containerFiles = await this.listContainerFiles(containerId)
    return {
      type: 'json',
      value: {
        container_id: toolContainerId ?? containerId,
        response_id: response.id,
        file_citations: fileCitations,
        containerFiles: containerFiles,
        raw_output: response.output ?? [],
      },
    }
  }

  private async downloadFiles({
    params,
    uiLink,
  }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const containerId = `${params.containerId ?? ''}`
    if (!containerId) {
      return { type: 'error-text', value: 'container_id is required' }
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
    for (const file of files) {
      const response = await this.openaiFetch(
        `/containers/${containerId}/files/${file.fileId}/content`,
        { method: 'GET' }
      )
      if (!response.ok) {
        const text = await response.text()
        return {
          type: 'error-text',
          value: `OpenAI API error: ${response.status} ${response.statusText} ${text}`,
        }
      }
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
            memory_limit: { type: 'string', description: 'Container memory limit (e.g., 1g)' },
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
            container_id: {
              type: 'string',
              description: 'Target container id',
            },
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  file_id: {
                    type: 'string',
                    description: 'Logicle file id to upload',
                  },
                  path: {
                    type: 'string',
                    description: 'Desired filename/path inside the container',
                  },
                },
                required: ['file_id'],
                additionalProperties: false,
              },
              minItems: 1,
            },
            file_id: {
              type: 'string',
              description: 'Single Logicle file id to upload',
            },
            path: {
              type: 'string',
              description: 'Desired filename/path inside the container (single upload)',
            },
          },
          required: ['container_id'],
          additionalProperties: false,
        },
        invoke: this.uploadFiles.bind(this),
      },
      execute: {
        description: 'Execute Python code inside a container.',
        parameters: {
          type: 'object',
          properties: {
            container_id: { type: 'string', description: 'Target container id' },
            code: { type: 'string', description: 'Python code to execute' },
            model: { type: 'string', description: 'Optional OpenAI model override' },
          },
          required: ['container_id', 'code'],
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
