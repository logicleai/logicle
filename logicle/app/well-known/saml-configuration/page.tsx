import jackson from '@/lib/jackson'
import SPConfig from './SPConfig'

const Page = async () => {
  const { spConfig } = await jackson()
  const config = await spConfig.get()
  return <SPConfig config={config} />
}

export default Page
