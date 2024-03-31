import AnalyticsPage from './AnalyticsPage'
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Analytics',
};

export default async function Analytics() {
  return <AnalyticsPage />
}