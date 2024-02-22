import jackson from '@/lib/jackson'
import ApiResponses from '@/api/utils/ApiResponses'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { directorySync } = await jackson()
  return ApiResponses.json(directorySync.providers())
}
