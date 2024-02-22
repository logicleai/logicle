import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from './scroll-area'

export type RowRenderer<T> = (assistant: T) => React.JSX.Element | string

export type Column<T> = {
  name: string
  renderer: RowRenderer<T>
}

interface Props<T> {
  columns: { name: string; renderer: (assistant: T) => React.JSX.Element | string }[]
  rows: T[]
  className?: string
  keygen: (arg: T) => string
}

export function column<T>(name: string, renderer: RowRenderer<T>) {
  return {
    name: name,
    renderer: renderer,
  }
}

export function ScrollableTable<T>({ columns, rows, keygen, className }: Props<T>) {
  return (
    <ScrollArea className={className}>
      <SimpleTable columns={columns} rows={rows} keygen={keygen}></SimpleTable>
    </ScrollArea>
  )
}

export function SimpleTable<T>({ columns, rows, keygen, className }: Props<T>) {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((entry) => {
            return <TableHead key={entry.name}>{entry.name}</TableHead>
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          return (
            <TableRow key={keygen(row)}>
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
