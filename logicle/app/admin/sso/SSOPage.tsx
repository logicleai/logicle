'use client'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'next-i18next'
import { useState } from 'react'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { WithLoadingAndError } from '@/components/ui'
import { delete_ } from '@/lib/fetch'
import CreateSamlConnection from './CreateSamlConnection'
import { OIDCSSORecord, SAMLSSORecord } from '@foosoftsrl/saml-jackson'
import { useSWRJson } from '@/hooks/swr'
import CreateOidcConnection from './CreateOidcConnection'
import { IconPlus } from '@tabler/icons-react'
import DeleteButton from '../components/DeleteButton'
import { AdminPageTitle } from '../components/AdminPageTitle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEnvironment } from '@/app/context/environmentProvider'

export const dynamic = 'force-dynamic'

type SSOConnection = SAMLSSORecord | OIDCSSORecord

const getType = (connection: SSOConnection) => {
  if ((connection as SAMLSSORecord).idpMetadata) {
    return 'SAML'
  } else {
    return 'OIDC'
  }
}

const SSOPage = () => {
  const [showAddSaml, setShowAddSaml] = useState(false)
  const [showAddOidc, setShowAddOidc] = useState(false)
  const { t } = useTranslation('common')
  const { isLoading, error, data: data, mutate } = useSWRJson<SSOConnection[]>('/api/sso')
  const connections = data
  const modalContext = useConfirmationContext()
  const environment = useEnvironment()

  async function onDelete(ssoConnection: SSOConnection) {
    const result = await modalContext.askConfirmation({
      title: `${t('delete-sso-connection')} ${ssoConnection?.name}`,
      message: <p>{t('delete-sso-connection-confirmation')}</p>,
      confirmMsg: t('delete-sso-connection'),
    })
    if (!result) return

    const response = await delete_(
      `/api/saml?clientID=${ssoConnection.clientID}&clientSecret=${ssoConnection.clientSecret}`
    )
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate()
    toast.success(t('sso-connection-deleted'))
  }

  const columns: Column<SSOConnection>[] = [
    /*column(t('table-column-name'), (ssoConnection) => (
      <a href={`/admin/sso/${ssoConnection.clientID}`}>{ssoConnection.name ?? ''}</a>
    )),*/
    column(t('table-column-name'), (ssoConnection) => ssoConnection.name ?? ''),
    column(t('table-column-description'), (ssoConnection) => ssoConnection.description ?? ''),
    column(t('table-column-type'), (ssoConnection) => getType(ssoConnection)),
    column(t('table-column-redirect-url'), (ssoConnection) =>
      ''.concat(ssoConnection.redirectUrl[0])
    ),
    column(t('table-column-actions'), (ssoConnection) => (
      <DeleteButton
        disabled={environment.ssoConfigLock}
        onClick={() => {
          onDelete(ssoConnection)
        }}
      >
        {t('delete-sso-connection')}
      </DeleteButton>
    )),
  ]

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="h-full flex flex-col">
        <div className="flex gap-2 items-center mb-4">
          <AdminPageTitle title={t('all-samlconnections')}>
            {!environment.ssoConfigLock && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="px-2">
                    <IconPlus />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="" sideOffset={5}>
                  <DropdownMenuButton onClick={() => setShowAddSaml(!showAddSaml)}>
                    SAML
                  </DropdownMenuButton>
                  <DropdownMenuButton onClick={() => setShowAddOidc(!showAddSaml)}>
                    OIDC
                  </DropdownMenuButton>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </AdminPageTitle>
        </div>
        <ScrollableTable
          className="flex-1"
          columns={columns}
          rows={connections ?? []}
          keygen={(t) => t.clientID}
        />
      </div>
      {showAddSaml && <CreateSamlConnection visible={true} setVisible={setShowAddSaml} />}
      {showAddOidc && <CreateOidcConnection visible={true} setVisible={setShowAddOidc} />}
    </WithLoadingAndError>
  )
}

export default SSOPage