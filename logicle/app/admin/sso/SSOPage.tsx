'use client'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import CreateSamlConnection from './CreateSamlConnection'
import { OIDCSSORecord, SAMLSSORecord } from '@boxyhq/saml-jackson'
import { useSWRJson } from '@/hooks/swr'
import CreateOidcConnection from './CreateOidcConnection'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEnvironment } from '@/app/context/environmentProvider'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { AdminPage } from '../components/AdminPage'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash } from '@tabler/icons-react'
import { Link } from '@/components/ui/link'

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
  const { t } = useTranslation()
  const { isLoading, error, data: data, mutate } = useSWRJson<SSOConnection[]>('/api/sso')
  const connections = data
  const modalContext = useConfirmationContext()
  const environment = useEnvironment()
  const [searchTerm, setSearchTerm] = useState<string>('')

  async function onDelete(ssoConnection: SSOConnection) {
    const result = await modalContext.askConfirmation({
      title: `${t('delete-sso-connection')} ${ssoConnection?.name}`,
      message: t('delete-sso-connection-confirmation'),
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
    await mutate()
    toast.success(t('sso-connection-deleted'))
  }

  const columns: Column<SSOConnection>[] = [
    column(t('table-column-name'), (ssoConnection) => (
      <Link variant="ghost" href={`/admin/sso/${ssoConnection.clientID}`}>
        {ssoConnection.name ?? ''}
      </Link>
    )),
    column(t('table-column-description'), (ssoConnection) => ssoConnection.description ?? ''),
    column(t('table-column-type'), (ssoConnection) => getType(ssoConnection)),
    column(t('table-column-redirect-url'), (ssoConnection) =>
      ''.concat(ssoConnection.redirectUrl[0])
    ),
  ]
  if (!environment.ssoConfigLock) {
    columns.push(
      column(t('table-column-actions'), (ssoConnection) => (
        <ActionList>
          <Action
            icon={IconTrash}
            onClick={async () => {
              await onDelete(ssoConnection)
            }}
            text={t('delete-sso-connection')}
            disabled={environment.ssoConfigLock}
            destructive={true}
          />
        </ActionList>
      ))
    )
  }
  return (
    <AdminPage isLoading={isLoading} error={error} title={t('all-samlconnections')}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        {!environment.ssoConfigLock && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>{t('create_connection')}</Button>
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
      </SearchBarWithButtonsOnRight>
      <ScrollableTable
        className="flex-1"
        columns={columns}
        rows={(connections ?? []).filter(
          (u) =>
            searchTerm.trim().length == 0 ||
            ((u.name ?? '') + (u.description ?? ''))
              .toUpperCase()
              .includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.clientID}
      />
      {showAddSaml && <CreateSamlConnection onClose={() => setShowAddSaml(false)} />}
      {showAddOidc && <CreateOidcConnection onClose={() => setShowAddOidc(false)} />}
    </AdminPage>
  )
}

export default SSOPage
