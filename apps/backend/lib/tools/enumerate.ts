import {
  assistantVersionTools,
  assistantVersionSatellites,
  canUserAccessAssistant,
  getPublishedAssistantVersion,
} from '@/models/assistant'
import { ToolBuilder, ToolImplementation } from '@/lib/chat/tools'
import { TimeOfDay } from './timeofday/implementation'
import {
  getToolsFiltered,
  getBuildableTools,
  BuildableTool,
  filterVisibleToolIds,
  ToolAccessPrincipal,
} from '@/models/tool'
import { OpenApiPlugin } from './openapi/implementation'
import { ImageGeneratorPlugin } from './imagegenerator/implementation'
import {
  GoogleImageGeneratorPlugin,
  OpenAiImageGeneratorPlugin,
  ReplicateImageGeneratorPlugin,
  TogetherImageGeneratorPlugin,
} from './imagegenerator/direct-implementation'
import { McpPlugin } from './mcp/implementation'
import { WebSearch } from './websearch/implementation'
import { NativeTool } from './nativetool/implementation'
import { AnthropicWebSearch } from './anthropic.web_search/implementation'
import { LogicleCloudWebSearch } from './logicle.web_search/implementation'
import { GoogleAiStudioWebSearch } from './google_ai_studio.web_search/implementation'
import { OpenaiWebSearch } from './openai.web_search/implementation'
import { Router } from './router/implementation'
import { CodeInterpreter } from './code_interpreter/implementation'
import { OpenaiImageGeneration } from './openai.image_generation/implementation'
import { DummyTool } from './dummy/implementation'
import { KnowledgeBoxTool } from './knowledge_box/implementation'
import { SubAssistantTool } from './subassistant/implementation'
import { db } from 'db/database'
import { AudioTranscription } from './audio_transcription/implementation'
import { SatelliteTool } from './satellite/implementation'
import { TranslateDeepl } from './translate.deepl/implementation'
import { filterVisibleSatelliteIds, getSatellitesByIds } from '@/models/satellite'

const builders: Record<string, ToolBuilder> = {
  [AudioTranscription.toolName]: AudioTranscription.builder,
  [TranslateDeepl.toolName]: TranslateDeepl.builder,
  [ImageGeneratorPlugin.toolName]: ImageGeneratorPlugin.builder,
  [OpenAiImageGeneratorPlugin.toolName]: OpenAiImageGeneratorPlugin.builder,
  [GoogleImageGeneratorPlugin.toolName]: GoogleImageGeneratorPlugin.builder,
  [TogetherImageGeneratorPlugin.toolName]: TogetherImageGeneratorPlugin.builder,
  [ReplicateImageGeneratorPlugin.toolName]: ReplicateImageGeneratorPlugin.builder,
  [OpenApiPlugin.toolName]: OpenApiPlugin.builder,
  [McpPlugin.toolName]: McpPlugin.builder,
  [NativeTool.toolName]: NativeTool.builder,
  [Router.toolName]: Router.builder,
  [TimeOfDay.toolName]: TimeOfDay.builder,
  [WebSearch.toolName]: WebSearch.builder,
  [DummyTool.toolName]: DummyTool.builder,
  [KnowledgeBoxTool.toolName]: KnowledgeBoxTool.builder,

  // Provider specific tools
  [AnthropicWebSearch.toolName]: AnthropicWebSearch.builder,
  [OpenaiWebSearch.toolName]: OpenaiWebSearch.builder,
  [LogicleCloudWebSearch.toolName]: LogicleCloudWebSearch.builder,
  [GoogleAiStudioWebSearch.toolName]: GoogleAiStudioWebSearch.builder,
  [CodeInterpreter.toolName]: CodeInterpreter.builder,
  [OpenaiImageGeneration.toolName]: OpenaiImageGeneration.builder,
}

export const buildTool = async (
  tool: BuildableTool,
  model: string
): Promise<ToolImplementation | undefined> => {
  const builder = builders[tool.type]
  return await builder?.(tool, tool.configuration, model)
}

export const availableTools = async (model: string) => {
  const tools = await getBuildableTools()
  return (
    await Promise.all(
      tools.map((t) => {
        return buildTool(t, model)
      })
    )
  ).filter((t) => !(t === undefined)) as ToolImplementation[]
}

export const availableToolsForAssistantVersion = async (
  assistantVersionId: string,
  model: string,
  principal: ToolAccessPrincipal
) => {
  const tools = await assistantVersionTools(assistantVersionId)
  const visibleToolIds = await filterVisibleToolIds(principal, tools.map((t) => t.id))
  const implementations = (
    await Promise.all(
      tools
        .filter((t) => visibleToolIds.has(t.id))
        .map((t) => {
          return buildTool(t, model)
        })
    )
  ).filter((t) => !(t === undefined)) as ToolImplementation[]

  // Build virtual sub-assistant tools from subAssistants field
  const assistantVersionRow = await db
    .selectFrom('AssistantVersion')
    .select('subAssistants')
    .where('id', '=', assistantVersionId)
    .executeTakeFirst()

  if (assistantVersionRow?.subAssistants) {
    const subAssistantIds: string[] = JSON.parse(assistantVersionRow.subAssistants)
    const subTool = await buildSubAssistantTool(subAssistantIds, principal)
    if (subTool) implementations.push(subTool)
  }

  const satelliteIds = await assistantVersionSatellites(assistantVersionId)
  implementations.push(...(await buildSatelliteTools(satelliteIds, principal)))

  return implementations
}

/** Builds one ToolImplementation per satellite directly attached to this
 * assistant version, with no backing Tool row: a satellite id that no longer
 * exists or is no longer visible to the principal is silently dropped, the
 * same way buildSubAssistantTool drops sub-assistants the principal can't
 * reach. The satellite's actual functions are resolved live from the hub
 * connection when the tool runs (see SatelliteTool.functions), not here. */
export const buildSatelliteTools = async (
  satelliteIds: string[],
  principal: ToolAccessPrincipal
): Promise<SatelliteTool[]> => {
  if (satelliteIds.length === 0) return []
  const visibleIds = await filterVisibleSatelliteIds(principal, satelliteIds)
  const satellites = await getSatellitesByIds([...visibleIds])
  return satellites.map((satellite) => SatelliteTool.fromSatellite(satellite))
}

export const buildSubAssistantTool = async (
  subAssistantIds: string[],
  principal: ToolAccessPrincipal
): Promise<SubAssistantTool | undefined> => {
  const entries = (
    await Promise.all(
      subAssistantIds.map(async (id) => {
        if (!(await canUserAccessAssistant(principal.userId, id))) return undefined
        const version = await getPublishedAssistantVersion(id)
        if (!version) return undefined
        return { id, name: version.name, description: version.description ?? '' }
      })
    )
  ).filter((e) => e !== undefined)

  if (entries.length === 0) return undefined

  const assistantList = entries
    .map(
      (e) =>
        `- id: ${e.id}, name: ${e.name}${e.description ? `, description: ${e.description}` : ''}`
    )
    .join('\n')
  const promptFragment = `\nYou have access to the following sub-assistants that you can invoke as tools:\n${assistantList}\nWhen the user references an assistant by name (e.g. @name), map it to the corresponding id.\n`
  const toolParams = {
    id: 'subassistant',
    provisioned: false,
    promptFragment,
    name: 'invoke_assistant',
  }
  return new SubAssistantTool(toolParams, entries)
}

export const availableToolsFiltered = async (
  ids: string[],
  model: string,
  principal: ToolAccessPrincipal,
  subAssistantIds?: string[],
  satelliteIds?: string[]
) => {
  const visibleToolIds = await filterVisibleToolIds(principal, ids)
  const tools = await getToolsFiltered([...visibleToolIds])
  const implementations = (await Promise.all(tools.map((t) => buildTool(t, model)))).filter(
    (t) => t !== undefined
  ) as ToolImplementation[]

  if (subAssistantIds && subAssistantIds.length > 0) {
    const subTool = await buildSubAssistantTool(subAssistantIds, principal)
    if (subTool) implementations.push(subTool)
  }

  if (satelliteIds && satelliteIds.length > 0) {
    implementations.push(...(await buildSatelliteTools(satelliteIds, principal)))
  }

  return implementations
}
