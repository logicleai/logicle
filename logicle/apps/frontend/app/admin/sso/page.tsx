import SSOPage from './SSOPage'
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SSO',
};

export default async function SSO() {
  return <SSOPage />
}
