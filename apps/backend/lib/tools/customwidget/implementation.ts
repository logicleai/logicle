import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { CustomWidgetInterface } from '@/lib/tools/schemas'
import {
  RENDER_WIDGET_FUNCTION_NAME,
  renderWidgetParametersJsonSchema,
  widgetFileIds,
  widgetSpecSchema,
} from '@/lib/tools/customWidget'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { getFileWithId } from '@/models/file'
import type { JSONValue } from 'ai'
import type { JSONSchema7 } from 'json-schema'

/**
 * See `packages/core/src/tools/customWidget.ts` and
 * `docs/custom-widget-tool.md`. The model hands us a declarative widget spec;
 * we validate it, authorize every referenced file for the invoking user, and
 * echo the validated spec back as a `json` tool result for the frontend to
 * render with a trusted component. No HTML/CSS/JS or file URLs cross this
 * boundary.
 */
export class CustomWidget extends CustomWidgetInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams) => new CustomWidget(toolParams)

  supportedMedia = []

  constructor(public toolParams: ToolParams) {
    super()
  }

  functions = async (_model: LlmModel, _context: ToolFunctionContext): Promise<ToolFunctions> => ({
    [RENDER_WIDGET_FUNCTION_NAME]: {
      description:
        'Render an interactive image widget inline in the reply. Provide a declarative spec only; ' +
        'images are referenced by their conversation file id. Returns an error string if the spec ' +
        'is invalid or a referenced file is not accessible.',
      parameters: renderWidgetParametersJsonSchema as unknown as JSONSchema7,
      requireConfirm: false,
      invoke: this.invokeRenderWidget.bind(this),
    },
  })

  private async invokeRenderWidget({
    params,
    userId,
  }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const parsed = widgetSpecSchema.safeParse(params)
    if (!parsed.success) {
      const widgetType = typeof params?.type === 'string' ? params.type : 'widget'
      return {
        type: 'error-text',
        value: `Unable to display ${widgetType}: invalid spec (${parsed.error.issues
          .map((i) => `${i.path.join('.') || 'root'}: ${i.message}`)
          .join('; ')})`,
      }
    }
    const spec = parsed.data

    for (const fileId of widgetFileIds(spec)) {
      const file = await getFileWithId(fileId)
      if (!file || !(await canAccessFile({ userId }, fileId))) {
        return {
          type: 'error-text',
          value: `Unable to display ${spec.type}: file "${fileId}" is not accessible`,
        }
      }
      if (!file.type.startsWith('image/')) {
        return {
          type: 'error-text',
          value: `Unable to display ${spec.type}: file "${fileId}" is not an image`,
        }
      }
    }

    return {
      type: 'json',
      value: { customWidget: spec } as unknown as JSONValue,
    }
  }
}
