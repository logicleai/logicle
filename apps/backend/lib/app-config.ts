import type * as dto from '@/types/dto'
import { getParameters, getUserCount } from '@/models/user'
import { listIdpConnections } from '@/models/sso'
import type { LlmModel } from '@/lib/chat/models'
import { llmModels } from '@/lib/models'
import env from '@/lib/env'
import { appVersion } from '@/lib/version'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const getLoginPageConfig = async (): Promise<{
  userCount: number
  identityProviders: dto.PublicIdpConnection[]
}> => {
  const connections = await listIdpConnections()
  return {
    userCount: await getUserCount(),
    identityProviders: connections.map(({ id, name, description, type }) => ({ id, name, description, type })),
  }
}

export const getEnvironmentParameters = async (): Promise<dto.Parameter[]> => {
  return await getParameters()
}

export interface EnvironmentPayload {
  appUrl: string
  appVersion: string
  appDisplayName: string
  backendConfigLock: boolean
  ssoConfigLock: boolean
  enableSignup: boolean
  enableAutoSummary: boolean
  enableApiKeysUi: boolean
  enableSatellitesUi: boolean
  enableChatSharing: boolean
  enableChatFolders: boolean
  enableShowToolResult: boolean
  enableChatTreeNavigation: boolean
  enableAssistantInfo: boolean
  enableAssistantDuplicate: boolean
  maxImgAttachmentDimPx: number
  maxAttachmentSize: number
  sessionRefreshIntervalMinutes: number
  sessionRefreshThrottleMinutes: number
  softMessageLimit?: number
  hardMessageLimit?: number
  models: LlmModel[]
  parameters: dto.Parameter[]
  faviconPath?: string
  logoPath?: string
}

// Computes the bootstrap payload the frontend needs before it can render.
// Called both from the /api/environment route and directly (in-process) by
// server.ts, which injects it into the statically exported HTML shell.
export const getEnvironmentPayload = async (): Promise<EnvironmentPayload> => {
  return {
    appUrl: env.appUrl,
    appVersion,
    appDisplayName: env.appDisplayName,
    backendConfigLock: env.backends.locked,
    ssoConfigLock: env.sso.locked,
    enableSignup: env.signup.enable,
    enableAutoSummary: env.chat.autoSummary.enable,
    enableApiKeysUi: env.apiKeys.enableUi,
    enableSatellitesUi: env.satellites.enableUi,
    enableChatSharing: env.chat.enableSharing,
    enableChatFolders: env.chat.enableFolders,
    enableShowToolResult: env.chat.enableShowToolResult,
    enableChatTreeNavigation: env.chat.enableTreeNavigation,
    enableAssistantInfo: env.assistants.enableInfo,
    enableAssistantDuplicate: env.assistants.enableDuplicate,
    maxImgAttachmentDimPx: env.chat.attachments.maxImgDimPx,
    maxAttachmentSize: env.chat.attachments.maxSize,
    sessionRefreshIntervalMinutes: env.session.refreshIntervalMinutes,
    sessionRefreshThrottleMinutes: env.session.refreshThrottleMinutes,
    softMessageLimit: env.chat.softMessageLimit,
    hardMessageLimit: env.chat.hardMessageLimit,
    models: llmModels,
    parameters: await getEnvironmentParameters(),
    faviconPath: env.icons.favicon,
    logoPath: env.icons.logo,
  }
}

export interface ProvisionedBrandAssets {
  styles: { name: string; content: string }[]
  i18n: Record<string, string>
}

// Reads deployment-provisioned branding (custom CSS + translation overrides)
// off disk. Called directly (in-process) by server.ts, which injects the
// result into the statically exported HTML shell on each request.
export const getProvisionedBrandAssets = async (): Promise<ProvisionedBrandAssets> => {
  const dir = env.provision.brand
  if (!dir) {
    return { styles: [], i18n: {} }
  }

  const children = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((child) => child.isFile() && path.extname(child.name).toLowerCase() === '.css')
    .map((child) => child.name)
    .sort()
  const styles = await Promise.all(
    children.map(async (name) => {
      const childPath = path.resolve(dir, name)
      return { name, content: await fs.promises.readFile(childPath, 'utf-8') }
    })
  )

  const i18nPath = path.resolve(dir, 'brand.json')
  let i18n: Record<string, string> = {}
  try {
    await fs.promises.access(i18nPath)
    i18n = JSON.parse(await fs.promises.readFile(i18nPath, 'utf-8'))
  } catch {
    // No brand.json provisioned; fall back to defaults.
  }

  return { styles, i18n }
}
