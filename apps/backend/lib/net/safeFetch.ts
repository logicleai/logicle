import { Agent, fetch as undiciFetch } from 'undici'
import dns from 'node:dns'
import net from 'node:net'

/**
 * Blocks fetches that resolve to loopback, private, link-local (including the
 * 169.254.169.254 cloud metadata address), or otherwise non-public IP ranges. The
 * check runs inside the connector's `lookup`, so it applies to every redirect hop and
 * to the actual TCP connection undici makes — not just to a DNS lookup done up front
 * that a DNS-rebinding attacker could bypass by resolving differently a moment later.
 */

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true // 169.254.0.0/16 (link-local incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 0 && parts[2] === 0) return true // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 88 && parts[2] === 99) return true // 192.88.99.0/24
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15
  if (a === 198 && b === 51 && parts[2] === 100) return true // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && parts[2] === 113) return true // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  return false
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '::') return true
  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
  if (v4Mapped) return isBlockedIPv4(v4Mapped[1])
  const firstGroup = normalized.split(':')[0]
  const firstHextet = parseInt(firstGroup || '0', 16) || 0
  if ((firstHextet & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((firstHextet & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((firstHextet & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (normalized.startsWith('2001:db8:')) return true // documentation range
  if (normalized.startsWith('100::')) return true // discard-only prefix
  return false
}

function isBlockedIp(address: string, family: number): boolean {
  return family === 6 ? isBlockedIPv6(address) : isBlockedIPv4(address)
}

export const __testing = { isBlockedIPv4, isBlockedIPv6 }

const safeLookup: typeof dns.lookup = ((hostname: string, options: unknown, callback: unknown) => {
  const cb = (typeof options === 'function' ? options : callback) as (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number
  ) => void
  const opts = typeof options === 'function' ? {} : ((options ?? {}) as dns.LookupOptions)

  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err, [] as never)
    const list = addresses as dns.LookupAddress[]
    const allowed = list.filter((a) => !isBlockedIp(a.address, a.family))
    if (allowed.length === 0) {
      cb(new Error(`Refusing to connect to a non-public address for host ${hostname}`), [] as never)
      return
    }
    if (opts.all) {
      cb(null, allowed as never)
    } else {
      cb(null, allowed[0].address, allowed[0].family)
    }
  })
}) as typeof dns.lookup

const safeAgent = new Agent({
  connect: { lookup: safeLookup },
})

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024

/**
 * Fetch that only follows http(s), pins DNS resolution (including every redirect
 * hop) to public IP addresses, times out, and caps the response body size. Use this
 * instead of the global `fetch` for any URL that isn't already known to be safe
 * (e.g. taken from user-controlled content) and whose response is read server-side.
 */
export async function safeFetch(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<ArrayBuffer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Refusing to fetch a non-http(s) URL: ${url}`)
  }
  if (net.isIP(parsed.hostname) && isBlockedIp(parsed.hostname, net.isIP(parsed.hostname))) {
    throw new Error(`Refusing to connect to a non-public address: ${parsed.hostname}`)
  }

  const response = await undiciFetch(parsed, {
    dispatcher: safeAgent,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  } as never)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    return new ArrayBuffer(0)
  }
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`Response for ${url} exceeded the maximum allowed size of ${maxBytes} bytes`)
    }
    chunks.push(value)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result.buffer
}
