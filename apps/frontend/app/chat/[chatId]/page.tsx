// Thin server wrapper: output:'export' requires generateStaticParams on any
// file in the dynamic-segment path, and that export can't live in a 'use
// client' module. The actual id is read client-side (useParams(), against
// the live URL) in PageClient — this placeholder value is never used.
import PageClient from './PageClient'

export const generateStaticParams = () => [{ chatId: '_' }]

export default function Page() {
  return <PageClient />
}
