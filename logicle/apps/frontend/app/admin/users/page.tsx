import UsersPage from './UsersPage'
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Users',
};

export default async function Users() {
  return <UsersPage />
}