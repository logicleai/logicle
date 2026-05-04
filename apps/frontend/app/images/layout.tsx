import { MainLayout } from '../layouts/MainLayout'
import { Chatbar } from '../chat/components/Chatbar'

export default function ImagesLayout({ children }) {
  return (
    <MainLayout leftBar={<Chatbar />} leftBarCollapsible={true}>
      {children}
    </MainLayout>
  )
}
