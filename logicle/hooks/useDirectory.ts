import { Directory } from '@foosoftsrl/saml-jackson'
import { mutate } from 'swr'
import { useSWRJson } from './swr'

const useDirectory = () => {
  const url = `/api/directory-sync`

  const { data, error, isLoading } = useSWRJson<Directory[]>(url)

  const mutateDirectory = async () => {
    mutate(url)
  }

  return {
    isLoading,
    isError: error,
    directories: data || [],
    mutateDirectory,
  }
}

export default useDirectory
