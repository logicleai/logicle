import { ReactNode, useRef } from 'react'
import ExcelJS from 'exceljs'

interface Props {
  children: ReactNode
}
import { Button } from '@/components/ui/button'
import { IconClipboard, IconDownload } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { IconDownloadWithType } from './icons'

const htmlTableToXlsx = async (table: HTMLTableElement) => {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Worksheet')
  const rows = table.querySelectorAll('tr')

  // First pass: Create all rows and cells with basic values
  rows.forEach((row) => {
    const newRow = worksheet.addRow([])
    const htmlCells = row.querySelectorAll('th, td')
    htmlCells.forEach((htmlCell, index) => {
      const value = htmlCell.textContent?.trim() || ''
      const excelCell = newRow.getCell(index + 1)
      excelCell.value = value
    })
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

const htmlTableToCsv = (table: HTMLTableElement) => {
  const rows = table.querySelectorAll('tr')
  const csvRows: string[] = []

  rows.forEach((row) => {
    const cells = row.querySelectorAll('th, td')
    const rowValues: string[] = []
    cells.forEach((cell) => {
      // Escape double quotes by doubling them
      let value = cell.textContent?.trim() || ''
      value = `"${value.replace(/"/g, '""')}"`
      rowValues.push(value)
    })
    csvRows.push(rowValues.join(','))
  })

  // Combine rows into a single CSV string
  const csvString = csvRows.join('\r\n')
  return new Blob([csvString], { type: 'text/csv' })
}

const downloadBlob = async (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = fileName
  link.href = url
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const Table = ({ children }: Props) => {
  const { t } = useTranslation()
  // Todo: maybe I'd like to... get data from the markdown node?
  const tableRef = useRef<HTMLTableElement | null>(null)
  const downloadXlsx = async () => {
    if (tableRef.current) {
      const table = tableRef.current!
      const blob = await htmlTableToXlsx(table)
      downloadBlob(blob, 'table.xlsx')
    }
  }
  const downloadCsv = async () => {
    if (tableRef.current) {
      const table = tableRef.current!
      const blob = await htmlTableToCsv(table)
      downloadBlob(blob, 'table.csv')
    }
  }
  const copy = async () => {
    if (!navigator.clipboard) return
    if (tableRef.current) {
      const table = tableRef.current!
      const csvBlob = htmlTableToCsv(table)
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([await csvBlob.arrayBuffer()], { type: 'text/plain' }),
        }),
      ])
    }
  }
  return (
    <div className="px-2 py-2 overflow-x-auto relative">
      <table ref={tableRef} className="mt-0.5 mb-0.5 table-striped peer">
        {children}
      </table>
      <div className="absolute right-0 top-0 flex flex-horz gap-2 text-white invisible hover:visible peer-hover:visible">
        <button
          title="download Excel"
          className="p-1 bg-gray-500 bg-opacity-50 rounded-md"
          onClick={() => downloadXlsx()}
        >
          <IconDownloadWithType type="xls" />
        </button>
        <button
          title="download CSV"
          className="p-1 bg-gray-500 bg-opacity-50 rounded-md "
          onClick={() => downloadCsv()}
        >
          <IconDownloadWithType type="csv" />
        </button>
        <button
          title={t('copy_to_clipboard')}
          className="p-1 bg-gray-500 bg-opacity-50   rounded-md"
          onClick={() => copy()}
        >
          <IconClipboard></IconClipboard>
        </button>
      </div>
    </div>
  )
}
