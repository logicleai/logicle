import BackendPage from './BackendPage'
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Backends',
};

export default async function Backend() {
  return <BackendPage />
}
