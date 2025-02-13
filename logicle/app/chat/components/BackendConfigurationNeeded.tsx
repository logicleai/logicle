import { Label } from '@radix-ui/react-label'
import { useSession } from 'next-auth/react'
import { Link } from '@/components/ui/link'
import * as dto from '@/types/dto'
import { t } from 'i18next'

export const BackendConfigurationNeeded = () => {
  const session = useSession()
  return (
    <div className="mx-auto flex flex-1 flex-col justify-center space-y-6">
      <h1 className="text-center">{t('welcome_to_logicle')}</h1>
      <div className="text-center text-body1">
        <h2 className="mb-8">{`Logicle is an enterprise ChatGPT UI.`}</h2>
        <div className="mb-2">{t('important_logicle_is_100%_unaffiliated_with_openai')}</div>
      </div>
      <div className="text-center opacity-50">
        {session?.data?.user.role == dto.UserRole.ADMIN ? (
          <div className="mb-2">
            <Label>
              {t('as_you_are_the_administrator_you_may_want_to')}{' '}
              <Link href="/admin/backends" size="inline">
                {t('configure')}
              </Link>{' '}
              {t('the_system')}
            </Label>
          </div>
        ) : (
          <div className="mb-2">
            {t('you_are_not_entitled_to_use_logicle_please_contact_the_administrator')}
          </div>
        )}
      </div>
    </div>
  )
}
