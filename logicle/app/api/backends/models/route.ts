import { requireSession } from '@/api/utils/auth'
import { getBackendsWithModels } from '@/models/backend'
import { NextResponse } from 'next/server'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async () => {
  const response: dto.BackendModels[] = await getBackendsWithModels()
  return NextResponse.json(response)
})
