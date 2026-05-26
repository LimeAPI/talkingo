import { AuthGuard } from '@/components/layout/AuthGuard'
import { ConversationPage } from '@/components/conversation/ConversationPage'

export default function Home() {
  return (
    <AuthGuard>
      <ConversationPage />
    </AuthGuard>
  )
}
