import { Label } from '@radix-ui/react-label'
import { useSession } from 'next-auth/react'
import { Link } from '@/components/ui/link'
import * as dto from '@/types/dto'

export const BackendConfigurationNeeded = () => {
  const session = useSession()
  return (
    <div className="mx-auto flex flex-1 flex-col justify-center space-y-6">
      <h1 className="text-center">Welcome to Logicle</h1>
      <div className="text-center text-body1">
        <h2 className="mb-8">{`Logicle is an enterprise ChatGPT UI.`}</h2>
        <div className="mb-2">Important: Logicle is 100% unaffiliated with OpenAI.</div>
      </div>
      <div className="text-center opacity-50">
        {session?.data?.user.role == dto.UserRoleName.ADMIN ? (
          <div className="mb-2">
            <Label>
              {'As you are the administrator, you may want to '}
              <Link href="/admin/backends" size="inline">
                Configure
              </Link>
              {' the system'}
            </Label>
          </div>
        ) : (
          <div className="mb-2">
            You are not entitled to use Logicle. Please contact administrator
          </div>
        )}
      </div>
    </div>
  )
}
