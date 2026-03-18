import { z } from 'zod'

export const userPreferencesSchema = z.object({
  language: z.string(),
  conversationEditing: z.boolean(),
  showIconsInChatbar: z.boolean(),
  advancedSystemPromptEditor: z.boolean(),
  advancedMessageEditor: z.boolean(),
})

export type UserPreferences = z.infer<typeof userPreferencesSchema>

export const userPreferencesDefaults: UserPreferences = {
  language: 'default',
  conversationEditing: true,
  showIconsInChatbar: true,
  advancedSystemPromptEditor: false,
  advancedMessageEditor: false,
}
