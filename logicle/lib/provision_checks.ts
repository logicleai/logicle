import { z } from 'zod'
import { provisionedAssistantSharingSchema } from './provision_schema'
import { ProvisionableAssistantSharing } from './provision'

type AssertExtends<A, _B extends A> = true

type ProvisionedAssistantSharingSchema = z.infer<typeof provisionedAssistantSharingSchema> & {}
const _assistantSharingTest1: AssertExtends<
  ProvisionedAssistantSharingSchema,
  ProvisionableAssistantSharing
> = true
const _assistantSharingTest2: AssertExtends<
  ProvisionableAssistantSharing,
  ProvisionedAssistantSharingSchema
> = true
