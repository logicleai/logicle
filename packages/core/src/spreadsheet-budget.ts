// Shared by upload analysis and both fallback extractors. Limits apply to a whole workbook.
const maxPositions = 2_000_000
const maxBytes = 8 * 1024 * 1024

// Worker IPC and FileAnalysis persist errors as messages.
export const spreadsheetLimitMessage = 'Spreadsheet extraction limit exceeded'

export class SpreadsheetLimitError extends Error {
  constructor(reason: string) {
    super(`${spreadsheetLimitMessage}: ${reason}`)
  }
}

export class SpreadsheetBudget {
  private positions = 0
  private bytes = 0

  addRange(rows: number, columns: number) {
    this.positions += rows * Math.max(1, columns)
    if (this.positions > maxPositions) {
      throw new SpreadsheetLimitError(`more than ${maxPositions} cell positions`)
    }
  }

  checkBytes(additional: number) {
    if (this.bytes + additional > maxBytes) {
      throw new SpreadsheetLimitError(`more than ${maxBytes} bytes of text`)
    }
  }

  addBytes(bytes: number) {
    this.checkBytes(bytes)
    this.bytes += bytes
  }
}
