import {
  deleteUserImage,
  getUserById,
  getUserWorkspaceMemberships,
  updateUser,
} from '@/models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { KeysEnum, sanitize } from '@/lib/sanitize'
import { requireSession } from '../../utils/auth'
import Assistants from '@/models/assistant'
import { WorkspaceRole } from '@/types/workspace'
import { Updateable } from 'kysely'
import * as schema from '@/db/schema'
import { createImageFromDataUriIfNotNull } from '@/models/images'
import * as dto from '@/types/dto'
import { FileBadge } from 'lucide-react'
import { db } from '@/db/database'

export const dynamic = 'force-dynamic'

export const PUT = requireSession(async (session, req) => {
  const preferences = (await req.json()) as dto.UserPreferences
  await db.updateTable('User').set('preferences', JSON.stringify(preferences)).execute()
  return ApiResponses.success()
})
