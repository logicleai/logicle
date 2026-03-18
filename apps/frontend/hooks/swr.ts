import useSWR, { SWRConfiguration } from 'swr'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const json = await response.json()

  if (response.status === 401) {
    const url = new URL(window.location.href)
    if (!url.pathname.startsWith('/auth')) {
      const redirectUrl = new URL(url.href)
      redirectUrl.pathname = '/auth/login'
      url.searchParams.set('callbackUrl ', encodeURI(url.href))
      //window.open(url, '_self')
    }
  }

  if (!response.ok) {
    throw new Error(json.error.message || 'An error occurred while fetching the data')
  }

  return json
}

export function useSWRJson<T>(url: string | null, options?: SWRConfiguration) {
  return useSWR<T, Error>(url, fetcher, options)
}
