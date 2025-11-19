import { UpdatePasswordForm } from '@/components/app/UpdatePassword';
import { UserPreferences } from '@/components/app/UserPreferences';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Password',
};

export default async function UserPreferencesPage() {
  return <UserPreferences/>
}