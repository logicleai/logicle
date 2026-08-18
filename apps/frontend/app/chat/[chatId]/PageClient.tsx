'use client'
import { ChatSection } from '@/app/chat/components/ChatSection'

// /chat/[chatId]'s static shell (see page.tsx: generateStaticParams only ever
// bakes the '_' placeholder) renders the exact same ChatSection as bare
// /chat — which chat, if any, it shows comes entirely from
// ChatPageContext's urlChatId, not from this route match. See
// ChatSection's own comment for why.
const ChatPage = () => {
  return <ChatSection />
}

export default ChatPage
