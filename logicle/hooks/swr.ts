import useSWR from 'swr'

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const json = await response.json()

  if (!response.ok) {
    throw new Error(json.error.message || 'An error occurred while fetching the data')
  }

  return json
}

export function useSWRJson<T>(url: string | null) {
  return useSWR<T>(url, fetcher)
}
