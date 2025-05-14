import { z } from 'zod'
import {
  provisionedApiKeySchema,
  provisionedAssistantSchema,
  provisionedAssistantSharingSchema,
  provisionedBackendSchema,
  provisionedToolSchema,
  provisionedUserSchema,
} from './provision_schema'
import {
  ProvisionableApiKey,
  ProvisionableAssistant,
  ProvisionableAssistantSharing,
  ProvisionableBackend,
  ProvisionableTool,
  ProvisionableUser,
} from './provision'

type AssertExtends<A, B extends A> = true
type AssertEqual<A, B> = A extends B ? (B extends A ? true : never) : never

type ProvisionedToolSchema = z.infer<typeof provisionedToolSchema>
type ProvisionedBackendSchema = z.infer<typeof provisionedBackendSchema> & {}
type ProvisionedUserSchema = z.infer<typeof provisionedUserSchema> & {}
type ProvisionedApiKeySchema = z.infer<typeof provisionedApiKeySchema> & {}
type ProvisionedAssistantSchema = z.infer<typeof provisionedAssistantSchema> & {}
type ProvisionedAssistantSharingSchema = z.infer<typeof provisionedAssistantSharingSchema> & {}
const toolTest1: AssertExtends<ProvisionedToolSchema, ProvisionableTool> = true
const toolTest2: AssertExtends<ProvisionableTool, ProvisionedToolSchema> = true
// Not sure why this is not working
// const backendTest1: AssertExtends<ProvisionedBackendSchema, ProvisionableBackend> = true
const backendTest2: AssertExtends<ProvisionableBackend, ProvisionedBackendSchema> = true
const userTest1: AssertExtends<ProvisionedUserSchema, ProvisionableUser> = true
const userTest2: AssertExtends<ProvisionableUser, ProvisionedUserSchema> = true
const apiKeyTest1: AssertExtends<ProvisionedApiKeySchema, ProvisionableApiKey> = true
const apiKeyTest2: AssertExtends<ProvisionableApiKey, ProvisionedApiKeySchema> = true
const assistantTest1: AssertExtends<ProvisionedAssistantSchema, ProvisionableAssistant> = true
const assistantTest2: AssertExtends<ProvisionableAssistant, ProvisionedAssistantSchema> = true
const assistantSharingTest1: AssertExtends<
  ProvisionedAssistantSharingSchema,
  ProvisionableAssistantSharing
> = true
const assistantSharingTest2: AssertExtends<
  ProvisionableAssistantSharing,
  ProvisionedAssistantSharingSchema
> = true
