import AssistantsPage from './AssistantsPage'
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Assistants',
};

export default async function Assistants() {
  return <AssistantsPage />
}