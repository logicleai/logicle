import { UpdateAccountPanel } from '@/components/app/UserDialog';
import { UserPreferences } from '@/components/app/UserPreferences';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Password',
};

export default async function UserProfilePage() {
  return <UpdateAccountPanel/>
}