import { MainLayout } from '../layouts/MainLayout'
import { Chatbar } from './components/Chatbar'

export default function ChatLayout({ children }) {
  return (
    <MainLayout leftBar={<Chatbar />} leftBarCollapsible={true}>
      {children}
    </MainLayout>
  )
}
