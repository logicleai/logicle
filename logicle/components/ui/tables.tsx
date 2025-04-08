import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from './scroll-area'

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  ColumnDef,
  getSortedRowModel,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'

export type RowRenderer<T> = (assistant: T) => React.JSX.Element | string

export type Column<T> = {
  name: string
  accessorFn?: (row: T) => any
  renderer: RowRenderer<T>
  headerClass?: string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  className?: string
  keygen: (arg: T) => string
  onRowClick?: (arg: T) => void
}

export function column<T>(name: string, renderer: RowRenderer<T>) {
  return {
    name,
    renderer,
  }
}

export function ScrollableTable<T>({ columns, rows, keygen, className, onRowClick }: Props<T>) {
  return (
    <ScrollArea className={className}>
      <SimpleTable
        columns={columns}
        rows={rows}
        keygen={keygen}
        onRowClick={onRowClick}
      ></SimpleTable>
    </ScrollArea>
  )
}

export function SimpleTable<T>({ columns, rows, keygen, className, onRowClick }: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const tableColumns = useMemo<ColumnDef<T, any>[]>(
    () =>
      columns.map((col) => ({
        id: col.name,
        accessorFn: col.accessorFn,
        header: ({ column }) => (
          <div
            className="flex"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={(evt) => {
              column.getToggleSortingHandler()?.(evt)
            }}
          >
            <span className={`flex-1 ${col.headerClass ?? ''}`}>{col.name}</span>
            {col.accessorFn && (
              <span style={{ visibility: column.getIsSorted() ? 'visible' : 'hidden' }}>
                {{
                  asc: '🔼',
                  desc: '🔽',
                }[column.getIsSorted() as string] || '🔼'}
              </span>
            )}
          </div>
        ),
        // The cell uses your provided renderer; we pass in the full row original data.
        cell: ({ row }) => col.renderer(row.original),
      })),
    [columns]
  )

  // Create the table instance
  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: (blabla) => {
      setSorting(blabla)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Table className={className}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={keygen(row.original)}
            onClick={() => {
              onRowClick?.(row.original)
            }}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
