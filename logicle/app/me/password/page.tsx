import { UpdatePasswordForm } from '@/components/app/UpdatePassword';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Password',
};

export default async function UpdatePasswordPage() {
  return <UpdatePasswordForm/>
}