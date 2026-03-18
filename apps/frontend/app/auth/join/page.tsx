import Signup from './SignUpPanel'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign up',
  robots: {
    index: false,
    follow: false,
  },
}

export default async function SignUpPage() {
  return <Signup />
}
