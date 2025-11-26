import { Metadata } from 'next'
import { ParametersPage } from '../components/ParametersPage'

export const metadata: Metadata = {
  title: 'Parameters',
}

export default async function UserParametersPage() {
  return <ParametersPage />
}
