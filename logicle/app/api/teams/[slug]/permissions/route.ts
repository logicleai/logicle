import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'

// Get permissions for a team for the current user
// Probably I want to move this API to user dir
export const GET = requireAdmin(async () => {
  return ApiResponses.json([])
})
