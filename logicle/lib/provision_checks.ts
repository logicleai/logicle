import { z } from 'zod'
import {
  provisionedApiKeySchema,
  provisionedAssistantSchema,
  provisionedAssistantSharingSchema,
} from './provision_schema'
import {
  ProvisionableApiKey,
  ProvisionableAssistant,
  ProvisionableAssistantSharing,
} from './provision'

type AssertExtends<A, _B extends A> = true

type ProvisionedApiKeySchema = z.infer<typeof provisionedApiKeySchema> & {}
type ProvisionedAssistantSchema = z.infer<typeof provisionedAssistantSchema> & {}
type ProvisionedAssistantSharingSchema = z.infer<typeof provisionedAssistantSharingSchema> & {}
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
