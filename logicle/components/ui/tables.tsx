import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from './scroll-area'
import { string } from 'yaml/dist/schema/common/string'

export type RowRenderer<T> = (assistant: T) => React.JSX.Element | string

export type Column<T> = {
  name: string
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

export function column<T>(name: string, renderer: RowRenderer<T>, headerClass?: string) {
  return {
    name,
    headerClass,
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
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((entry) => {
            return (
              <TableHead key={entry.name} className={entry.headerClass}>
                {entry.name}
              </TableHead>
            )
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          return (
            <TableRow
              key={keygen(row)}
              onClick={() => {
                onRowClick?.(row)
              }}
            >
              {columns.map((entry) => {
                return <TableCell key={entry.name}>{entry.renderer(row)}</TableCell>
              })}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
