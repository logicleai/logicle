import useSWR, { SWRConfiguration } from 'swr'
import useSWRInfinite, { SWRInfiniteConfiguration } from 'swr/infinite'
import { handleUnauthenticated } from '@/lib/authRedirect'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const json = await response.json()

  if (response.status === 401) {
    handleUnauthenticated()
  }

  if (!response.ok) {
    throw new Error(json.error.message || 'An error occurred while fetching the data')
  }

  return json
}

export function useSWRJson<T>(url: string | null, options?: SWRConfiguration) {
  return useSWR<T, Error>(url, fetcher, options)
}

export function useSWRInfiniteJson<T>(
  getKey: (pageIndex: number, previousPageData: T | null) => string | null,
  options?: SWRInfiniteConfiguration<T, Error>
) {
  return useSWRInfinite<T, Error>(getKey, fetcher, options)
}
