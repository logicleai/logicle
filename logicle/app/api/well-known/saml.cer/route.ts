import jackson from '@/lib/jackson'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { spConfig } = await jackson()
  const config = await spConfig.get()

  return new NextResponse(config.publicKey, {
    headers: { 'Content-Type': 'application/x-x509-ca-cert' },
  })
}
