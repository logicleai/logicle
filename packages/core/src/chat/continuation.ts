import type * as dto from '@/types/dto'

/** Continuation controls belong to the originating turn, not a new model-facing turn. */
export const isToolStepLimitResponse = (
  message: dto.Message,
  parent: dto.Message | undefined
): message is dto.UserResponseMessage =>
  message.role === 'user-response' &&
  parent?.role === 'user-request' &&
  parent.request.type === 'tool-step-limit'
