'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent } from '@/components/ui/tabs'
//import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Overview } from './overview'
import { MostActiveUsers } from './most-active-users'
import { useTranslation } from 'react-i18next'
import { useSWRJson } from '@/hooks/swr'
import { AnalyticsPeriod, User } from '@/types/dto'
import React from 'react'
import { CalendarIcon, ChevronDown } from 'lucide-react'
import {
  DateRangePicker,
  Range,
  RangeKeyDict,
  createStaticRanges,
  defaultStaticRanges,
} from 'react-date-range'

interface Activity {
  users: number
  messages: number
  conversations: number
}

const AnalyticsPage = () => {
  const { t } = useTranslation()
  const formatDateInput = (date: Date) => {
    const year = date.getFullYear()
    let month = `${date.getMonth() + 1}`
    let day = `${date.getDate()}`
    if (month.length < 2) month = `0${month}`
    if (day.length < 2) day = `0${day}`
    return `${year}-${month}-${day}`
  }

  const formatDateTimeInput = (date: Date) => {
    const year = date.getFullYear()
    let month = `${date.getMonth() + 1}`
    let day = `${date.getDate()}`
    let hours = `${date.getHours()}`
    let minutes = `${date.getMinutes()}`
    if (month.length < 2) month = `0${month}`
    if (day.length < 2) day = `0${day}`
    if (hours.length < 2) hours = `0${hours}`
    if (minutes.length < 2) minutes = `0${minutes}`
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const addDays = (date: Date, days: number) => {
    const next = new Date(date)
    next.setDate(next.getDate() + days)
    return next
  }

  const startOfDay = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
  }

  const startOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }

  const endOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0)
  }

  const isSameDay = (a?: Date, b?: Date) => {
    if (!a || !b) return false
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    )
  }

  const endExclusiveToInclusive = (date: Date) => {
    const end = new Date(date)
    end.setDate(end.getDate() - 1)
    return end
  }

  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/

  const parseInputDate = (value: string) => {
    if (dateOnlyRegex.test(value)) {
      const [year, month, day] = value.split('-').map(Number)
      return new Date(year, month - 1, day)
    }
    return new Date(value)
  }

  const getRangeForPeriod = (value: AnalyticsPeriod) => {
    const now = new Date()
    const end = startOfDay(addDays(now, 1))
    if (value === 'last_week') {
      return { from: addDays(end, -7), to: end }
    }
    if (value === 'last_month') {
      const from = new Date(end)
      from.setMonth(from.getMonth() - 1)
      return { from, to: end }
    }
    if (value === 'last_year') {
      const from = new Date(end)
      from.setFullYear(from.getFullYear() - 1)
      return { from, to: end }
    }
    return {
      from: customFrom ? parseInputDate(customFrom) : undefined,
      to: customTo ? parseInputDate(customTo) : undefined,
    }
  }

  const getLast30DaysRange = () => {
    const endDate = startOfDay(new Date())
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - 29)
    return { startDate, endDate }
  }

  const getLast12MonthsRange = () => {
    const now = new Date()
    const endDate = endOfMonth(now)
    const startDate = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 11, 1))
    return { startDate, endDate }
  }

  const getDisplayRangeForPeriod = (value: AnalyticsPeriod) => {
    const range = getRangeForPeriod(value)
    if (!range.from || !range.to) {
      return range
    }
    if (value === 'last_week' || value === 'last_month' || value === 'last_year') {
      return { from: range.from, to: endExclusiveToInclusive(range.to) }
    }
    return range
  }

  const today = new Date()
  const initialTo = formatDateInput(today)
  const initialFrom = formatDateInput(addDays(today, -7))

  const [period, setPeriod] = React.useState<AnalyticsPeriod>('last_month')
  const [customFrom, setCustomFrom] = React.useState(initialFrom)
  const [customTo, setCustomTo] = React.useState(initialTo)
  const [customDraftRange, setCustomDraftRange] = React.useState<Range>({
    startDate: parseInputDate(initialFrom),
    endDate: parseInputDate(initialTo),
    key: 'selection',
  })
  const [customOpen, setCustomOpen] = React.useState(false)
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null)
  const [userFilter, setUserFilter] = React.useState('')
  const [userOpen, setUserOpen] = React.useState(false)

  const formatRangeLabel = (from?: Date, to?: Date) => {
    if (!from && !to) return t('custom')
    const formatOptions: Intl.DateTimeFormatOptions = {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }
    const fromLabel = from ? from.toLocaleDateString(undefined, formatOptions) : ''
    const toLabel = to ? to.toLocaleDateString(undefined, formatOptions) : ''
    if (!fromLabel) return t('custom')
    if (!toLabel) return `${fromLabel} - ...`
    return `${fromLabel} - ${toLabel}`
  }

  const handleZoomRange = (from: Date, to: Date) => {
    if (to <= from) return
    setPeriod('custom')
    setCustomFrom(formatDateTimeInput(from))
    setCustomTo(formatDateTimeInput(to))
    setCustomDraftRange({
      startDate: from,
      endDate: to,
      key: 'selection',
    })
  }

  const periodQuery = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set('period', period)
    if (selectedUserId) {
      params.set('userIds', selectedUserId)
    }
    if (period === 'custom') {
      params.set('from', customFrom)
      params.set('to', customTo)
    }
    return `?${params.toString()}`
  }, [period, customFrom, customTo, selectedUserId])

  const { data: activity } = useSWRJson<Activity>(`/api/analytics/activity${periodQuery}`)
  const { data: users } = useSWRJson<User[]>('/api/users')
  const userOptions = React.useMemo(() => {
    return (users ?? []).slice().sort((a, b) => {
      const aLabel = (a.name ?? a.email ?? a.id).toLowerCase()
      const bLabel = (b.name ?? b.email ?? b.id).toLowerCase()
      return aLabel.localeCompare(bLabel)
    })
  }, [users])

  const filteredUsers = React.useMemo(() => {
    const filter = userFilter.trim().toLowerCase()
    if (!filter) return userOptions
    return userOptions.filter((user) => {
      const name = user.name?.toLowerCase() ?? ''
      const email = user.email?.toLowerCase() ?? ''
      return name.includes(filter) || email.includes(filter)
    })
  }, [userOptions, userFilter])

  const usersLabel = React.useMemo(() => {
    if (!selectedUserId) return t('all-users')
    const user = userOptions.find((item) => item.id === selectedUserId)
    return user?.name ?? user?.email ?? user?.id ?? t('one-user-selected')
  }, [selectedUserId, userOptions, t])

  const currentPeriodLabel = React.useMemo(() => {
    const range = getDisplayRangeForPeriod(period)
    return formatRangeLabel(range.from, range.to)
  }, [period, customFrom, customTo, t])

  const staticRanges = React.useMemo(() => {
    return createStaticRanges([
      ...defaultStaticRanges,
      {
        label: t('last-30-days'),
        range: getLast30DaysRange,
      },
      {
        label: t('last-12-months'),
        range: getLast12MonthsRange,
      },
    ])
  }, [t])

  return (
    <div className="h-full lg:flex flex-col space-y-4 p-8 pt-6 overflow-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">{t('dashboard')}</h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Popover
            open={customOpen}
            onOpenChange={(open) => {
              if (open) {
                const range = getDisplayRangeForPeriod(period)
                setCustomDraftRange({
                  startDate: range.from,
                  endDate: range.to,
                  key: 'selection',
                })
              }
              setCustomOpen(open)
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="body1"
                className="justify-between gap-3 min-w-[260px]"
              >
                <span className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {currentPeriodLabel}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0"
              align="end"
              onInteractOutside={(event) => event.preventDefault()}
            >
              <div className="p-3">
                <DateRangePicker
                  onChange={(ranges: RangeKeyDict) => {
                    const next = ranges.selection
                    setCustomDraftRange({
                      startDate: next.startDate,
                      endDate: next.endDate,
                      key: 'selection',
                    })

                    if (next.startDate && next.endDate) {
                      const matchedPreset = staticRanges.some((preset) => {
                        const range = preset.range()
                        return (
                          isSameDay(range.startDate, next.startDate) &&
                          isSameDay(range.endDate, next.endDate)
                        )
                      })
                      if (matchedPreset) {
                        setCustomFrom(formatDateInput(next.startDate))
                        setCustomTo(formatDateInput(next.endDate))
                        setPeriod('custom')
                        setCustomOpen(false)
                      }
                    }
                  }}
                  ranges={[customDraftRange]}
                  months={2}
                  direction="horizontal"
                  showDateDisplay={false}
                  rangeColors={['#4260ff']}
                  weekdayDisplayFormat="EE"
                  monthDisplayFormat="MMMM yyyy"
                  staticRanges={staticRanges}
                  inputRanges={[]}
                />
              </div>
              <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
                <div className="text-muted-foreground">
                  {customDraftRange.startDate ? formatDateInput(customDraftRange.startDate) : ''}{' '}
                  {customDraftRange.endDate ? `- ${formatDateInput(customDraftRange.endDate)}` : ''}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="body1"
                    onClick={() => {
                      setCustomDraftRange({
                        startDate: customFrom ? parseInputDate(customFrom) : undefined,
                        endDate: customTo ? parseInputDate(customTo) : undefined,
                        key: 'selection',
                      })
                      setCustomOpen(false)
                    }}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    variant="primary"
                    size="body1"
                    disabled={!customDraftRange.startDate}
                    onClick={() => {
                      if (!customDraftRange.startDate) {
                        setCustomOpen(false)
                        return
                      }
                      setCustomFrom(formatDateInput(customDraftRange.startDate))
                      setCustomTo(
                        formatDateInput(customDraftRange.endDate ?? customDraftRange.startDate)
                      )
                      setPeriod('custom')
                      setCustomOpen(false)
                    }}
                  >
                    {t('apply')}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Popover open={userOpen} onOpenChange={setUserOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="body1"
                className="justify-between gap-3 min-w-[220px]"
              >
                <span>{usersLabel}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <Command>
                <CommandInput
                  placeholder={t('search-users')}
                  value={userFilter}
                  onValueChange={setUserFilter}
                />
                <CommandList className="max-h-72">
                  <CommandEmpty>{t('no_users_found')}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setSelectedUserId(null)
                        setUserOpen(false)
                      }}
                    >
                      {t('all-users')}
                    </CommandItem>
                    {filteredUsers.map((user) => {
                      const selected = selectedUserId === user.id
                      return (
                        <CommandItem
                          key={user.id}
                          onSelect={() => {
                            setSelectedUserId(user.id)
                            setUserOpen(false)
                          }}
                        >
                          <span
                            className={`mr-2 inline-flex h-4 w-4 items-center justify-center rounded border ${
                              selected ? 'border-primary bg-primary text-primary-foreground' : ''
                            }`}
                          >
                            {selected ? '✓' : ''}
                          </span>
                          <span className="truncate">{user.name ?? user.email ?? user.id}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <Tabs defaultValue="overview" className="min-h-0 flex-1 space-y-4">
        <TabsContent value="overview" className="h-full lg:flex flex-col space-y-4">
          <div className="flex flex-col lg:grid gap-4 grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('users')}</CardTitle>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  className="h-4 w-4 text-muted-foreground"
                >
                  <title>{t('users')}</title>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity?.users ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('conversations')}</CardTitle>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>{t('conversations')}</title>
                  <path
                    d="M1.20308 1.04312C1.00481 0.954998 0.772341 1.0048 0.627577 1.16641C0.482813 1.32802 0.458794 1.56455 0.568117 1.75196L3.92115 7.50002L0.568117 13.2481C0.458794 13.4355 0.482813 13.672 0.627577 13.8336C0.772341 13.9952 1.00481 14.045 1.20308 13.9569L14.7031 7.95693C14.8836 7.87668 15 7.69762 15 7.50002C15 7.30243 14.8836 7.12337 14.7031 7.04312L1.20308 1.04312ZM4.84553 7.10002L2.21234 2.586L13.2689 7.50002L2.21234 12.414L4.84552 7.90002H9C9.22092 7.90002 9.4 7.72094 9.4 7.50002C9.4 7.27911 9.22092 7.10002 9 7.10002H4.84553Z"
                    fill="currentColor"
                    fillRule="evenodd"
                    clipRule="evenodd"
                  />
                </svg>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity?.conversations ?? 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('messages')}</CardTitle>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <title>{t('messages')}</title>
                  <path
                    d="M12.5 3L2.5 3.00002C1.67157 3.00002 1 3.6716 1 4.50002V9.50003C1 10.3285 1.67157 11 2.5 11H7.50003C7.63264 11 7.75982 11.0527 7.85358 11.1465L10 13.2929V11.5C10 11.2239 10.2239 11 10.5 11H12.5C13.3284 11 14 10.3285 14 9.50003V4.5C14 3.67157 13.3284 3 12.5 3ZM2.49999 2.00002L12.5 2C13.8807 2 15 3.11929 15 4.5V9.50003C15 10.8807 13.8807 12 12.5 12H11V14.5C11 14.7022 10.8782 14.8845 10.6913 14.9619C10.5045 15.0393 10.2894 14.9965 10.1464 14.8536L7.29292 12H2.5C1.11929 12 0 10.8807 0 9.50003V4.50002C0 3.11931 1.11928 2.00003 2.49999 2.00002Z"
                    fill="currentColor"
                    fillRule="evenodd"
                    clipRule="evenodd"
                  />
                </svg>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activity?.messages ?? 0}</div>
              </CardContent>
            </Card>
          </div>
          <div className="flex-1 min-h-0 flex flex-col lg:grid gap-4 grid-cols-7">
            <Card className="h-full min-h-0 flex flex-col col-span-4">
              <CardHeader>
                <CardTitle>{t('usage')}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 pl-2">
                <Overview query={periodQuery} onRangeSelect={handleZoomRange} />
              </CardContent>
            </Card>
            <Card className="h-full min-h-0 flex flex-col col-span-3">
              <CardHeader>
                <CardTitle>{t('most-active-users')}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 min-h-0">
                <MostActiveUsers className="h-full min-h-0" query={periodQuery} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default AnalyticsPage
