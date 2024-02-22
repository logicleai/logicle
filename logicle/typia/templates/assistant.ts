import { InsertableAssistant } from '@/types/db'
import typia from 'typia'

export const validateInsertableAssistant = typia.createValidate<InsertableAssistant>()
