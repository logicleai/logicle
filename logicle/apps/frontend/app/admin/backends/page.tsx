import { BackendsPage } from './BackendsPage'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Backends',
}

export default async function Backend() {
  return <BackendsPage />
}
