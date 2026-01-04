import { z } from 'zod'
import {
  provisionedApiKeySchema,
  provisionedAssistantSchema,
  provisionedAssistantSharingSchema,
  provisionedToolSchema,
} from './provision_schema'
import {
  ProvisionableApiKey,
  ProvisionableAssistant,
  ProvisionableAssistantSharing,
  ProvisionableTool,
} from './provision'

type AssertExtends<A, _B extends A> = true

type ProvisionedToolSchema = z.infer<typeof provisionedToolSchema>
type ProvisionedApiKeySchema = z.infer<typeof provisionedApiKeySchema> & {}
type ProvisionedAssistantSchema = z.infer<typeof provisionedAssistantSchema> & {}
type ProvisionedAssistantSharingSchema = z.infer<typeof provisionedAssistantSharingSchema> & {}
const _toolTest1: AssertExtends<ProvisionedToolSchema, ProvisionableTool> = true
const _toolTest2: AssertExtends<ProvisionableTool, ProvisionedToolSchema> = true
// Not sure why this is not working
// const backendTest1: AssertExtends<ProvisionedBackendSchema, ProvisionableBackend> = true
const _apiKeyTest1: AssertExtends<ProvisionedApiKeySchema, ProvisionableApiKey> = true
const _apiKeyTest2: AssertExtends<ProvisionableApiKey, ProvisionedApiKeySchema> = true
const _assistantTest1: AssertExtends<ProvisionedAssistantSchema, ProvisionableAssistant> = true
const _assistantTest2: AssertExtends<ProvisionableAssistant, ProvisionedAssistantSchema> = true
const _assistantSharingTest1: AssertExtends<
  ProvisionedAssistantSharingSchema,
  ProvisionableAssistantSharing
> = true
const _assistantSharingTest2: AssertExtends<
  ProvisionableAssistantSharing,
  ProvisionedAssistantSharingSchema
> = true
