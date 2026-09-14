import { expect, test } from '@playwright/test'

const conversationCount = 5_000
const pageSize = 50

function conversationsForPage(pageIndex: number) {
  const start = pageIndex * pageSize
  return Array.from({ length: Math.min(pageSize, conversationCount - start) }, (_, offset) => {
    const index = start + offset
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, 0, conversationCount - index)).toISOString()
    return {
      id: `performance-conversation-${index}`,
      name: `Performance conversation ${index} with a deliberately long title for discoverability`,
      ownerId: 'playwright-user',
      assistantId: 'playwright-assistant',
      createdAt: timestamp,
      lastMsgSentAt: timestamp,
      folderId: null,
      assistant: {
        id: 'playwright-assistant',
        name: 'Playwright assistant',
        iconUri: null,
      },
    }
  })
}

test('loads a large conversation sidebar with infinite scroll and no virtualization', async ({
  page,
}) => {
  let conversationRequests = 0
  const conversationRequestCounts = new Map<string, number>()

  await page.route('**/api/conversations**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    const url = new URL(route.request().url())
    const cursor = url.searchParams.get('cursor')
    const pageIndex = cursor ? Number(cursor.replace('page-', '')) : 0
    conversationRequests += 1
    conversationRequestCounts.set(
      String(pageIndex),
      (conversationRequestCounts.get(String(pageIndex)) ?? 0) + 1
    )
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        conversations: conversationsForPage(pageIndex),
        nextCursor: (pageIndex + 1) * pageSize < conversationCount ? `page-${pageIndex + 1}` : null,
      }),
    })
  })
  await page.route('**/api/me/folders', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: '[]' })
  })

  const email = `playwright-${Date.now()}@example.com`
  const signupResponse = await page.request.post('/api/auth/join', {
    headers: { 'sec-fetch-site': 'same-origin' },
    data: {
      name: 'Playwright Test User',
      email,
      password: 'playwright-password',
    },
  })
  if (!signupResponse.ok()) {
    throw new Error(`Signup failed: ${signupResponse.status()} ${await signupResponse.text()}`)
  }
  const loginResponse = await page.request.post('/api/auth/login', {
    headers: { 'sec-fetch-site': 'same-origin' },
    data: { email, password: 'playwright-password' },
  })
  if (!loginResponse.ok()) {
    throw new Error(`Login failed: ${loginResponse.status()} ${await loginResponse.text()}`)
  }
  await page.goto('/images')
  await page.waitForURL('**/images')

  const viewport = page
    .getByTestId('conversation-scroll-area')
    .locator('[data-radix-scroll-area-viewport]')
  const conversationItems = page.locator('[data-testid="conversation-item"]')
  await expect(conversationItems).toHaveCount(pageSize)
  await expect(conversationItems.first()).toHaveAttribute(
    'data-conversation-id',
    'performance-conversation-0'
  )
  await expect(conversationItems.first().locator('a span[title]')).toHaveAttribute(
    'title',
    'Performance conversation 0 with a deliberately long title for discoverability'
  )

  const initialDomNodeCount = await page.evaluate(() => document.querySelectorAll('*').length)
  expect(initialDomNodeCount).toBeLessThan(5_000)

  for (let pageIndex = 1; pageIndex < conversationCount / pageSize; pageIndex += 1) {
    const expectedCount = (pageIndex + 1) * pageSize
    await viewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      element.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await expect
      .poll(() => conversationItems.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(expectedCount)
  }

  await expect(conversationItems).toHaveCount(conversationCount)
  await expect(conversationItems.first()).toBeAttached()
  await expect(conversationItems.last()).toHaveAttribute(
    'data-conversation-id',
    `performance-conversation-${conversationCount - 1}`
  )
  expect(conversationRequests, JSON.stringify(Object.fromEntries(conversationRequestCounts))).toBe(
    conversationCount / pageSize
  )
})
