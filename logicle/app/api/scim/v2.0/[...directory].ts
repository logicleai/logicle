import { hashPassword } from '@/lib/auth'
import { createRandomString, extractAuthToken } from '@/lib/common'
import jackson from '@/lib/jackson'
import type { DirectorySyncEvent, DirectorySyncRequest } from '@boxyhq/saml-jackson'
import { db } from 'db/database'
import { deleteUserByEmail, deleteUserById, getUserByEmail } from '@/models/user'
import type { NextApiRequest } from 'next'
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'

export async function POST(req: NextApiRequest) {
  const { directorySync } = await jackson()

  const { method, query, body } = req

  const directory = query.directory as string[]
  const [directoryId, path, resourceId] = directory

  // Handle the SCIM API requests
  const request: DirectorySyncRequest = {
    method: method as string,
    body: body ? JSON.parse(body) : undefined,
    directoryId,
    resourceId,
    resourceType: path === 'Users' ? 'users' : 'groups',
    apiSecret: extractAuthToken(req),
    query: {
      count: req.query.count ? parseInt(req.query.count as string) : undefined,
      startIndex: req.query.startIndex ? parseInt(req.query.startIndex as string) : undefined,
      filter: req.query.filter as string,
    },
  }

  const { status, data } = await directorySync.requests.handle(request, handleEvents)

  return NextResponse.json(data, { status: status })
}

// Handle the SCIM events
const handleEvents = async (event: DirectorySyncEvent) => {
  const { event: action, data } = event

  // User has been created
  if (action === 'user.created' && 'email' in data) {
    await db
      .insertInto('User')
      .values({
        id: nanoid(),
        name: `${data.first_name} ${data.last_name}`,
        email: data.email,
        password: await hashPassword(createRandomString()),
        role: dto.UserRole.USER,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .onConflict((oc) =>
        oc.column('email').doUpdateSet({
          name: `${data.first_name} ${data.last_name}`,
        })
      )
      .execute()
  }

  // User has been updated
  if (action === 'user.updated' && 'email' in data) {
    if (data.active === true) {
      await db
        .insertInto('User')
        .values({
          id: nanoid(),
          name: `${data.first_name} ${data.last_name}`,
          email: data.email,
          password: await hashPassword(createRandomString()),
          role: dto.UserRole.USER,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .onConflict((oc) =>
          oc.column('email').doUpdateSet({
            name: `${data.first_name} ${data.last_name}`,
          })
        )
        .execute()
      return
    }

    const user = await getUserByEmail(data.email)

    if (!user) {
      return
    }

    if (data.active === false) {
      await deleteUserById(user.id)
    }
  }

  // User has been removed
  if (action === 'user.deleted' && 'email' in data) {
    await deleteUserByEmail(data.email)
  }
}
