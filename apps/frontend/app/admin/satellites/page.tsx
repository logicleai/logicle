'use client'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import { Button } from '@/components/ui/button'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { AdminPage } from '../components/AdminPage'
import toast from 'react-hot-toast'
import { useSatellites } from '@/hooks/satellites'
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'

const AdminSatellitesPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: satellites } = useSatellites()
  const [searchTerm, setSearchTerm] = useState<string>('')

  const filteredSatellites = (satellites ?? []).filter((satellite) => {
    if (searchTerm.trim().length === 0) return true
    if (satellite.name.toUpperCase().includes(searchTerm.toUpperCase())) return true
    if (satellite.id.toUpperCase().includes(searchTerm.toUpperCase())) return true
    return false
  })

  const registeredSatellites = filteredSatellites.filter(
    (s) => !s.id.startsWith('ephemeral_')
  )
  const ephemeralSatellites = filteredSatellites.filter((s) =>
    s.id.startsWith('ephemeral_')
  )

  const columns: Column<dto.Satellite>[] = [
    column(t('name'), (satellite) => (
      <Link variant="ghost" href={`/satellites/${satellite.id}`}>
        {satellite.name}
      </Link>
    )),
    column('Type', (satellite) => (
      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
        {satellite.id.startsWith('ephemeral_') ? 'Personal Bridge' : 'Registered'}
      </span>
    )),
    column(t('created'), (satellite) => (
      <span>{new Date(satellite.createdAt).toLocaleDateString()}</span>
    )),
  ]

  return (
    <AdminPage
      isLoading={isLoading}
      error={error}
      title="Satellites Overview"
      topBar={
        <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        </SearchBarWithButtonsOnRight>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-600">Total Satellites</div>
            <div className="text-3xl font-bold mt-2">{filteredSatellites.length}</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-600">Registered</div>
            <div className="text-3xl font-bold mt-2">{registeredSatellites.length}</div>
          </div>
          <div className="border rounded-lg p-4">
            <div className="text-sm text-gray-600">Personal Bridges</div>
            <div className="text-3xl font-bold mt-2">{ephemeralSatellites.length}</div>
          </div>
        </div>

        {registeredSatellites.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Registered Satellites</h2>
            <SimpleTable
              columns={columns}
              rows={registeredSatellites}
              keygen={(s) => s.id}
            />
          </div>
        )}

        {ephemeralSatellites.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3">Personal Bridges</h2>
            <SimpleTable
              columns={columns}
              rows={ephemeralSatellites}
              keygen={(s) => s.id}
            />
          </div>
        )}

        {!isLoading && filteredSatellites.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No satellites found</p>
          </div>
        )}
      </div>
    </AdminPage>
  )
}

export default AdminSatellitesPage
