import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ExportColumn<T> { header: string; value: (row: T) => string | number | null; money?: boolean }

const rs = (n: number) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export function exportExcel<T>(file: string, sheet: string, cols: ExportColumn<T>[], rows: T[]) {
  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.header, c.value(r) ?? ''])))
  const ws = XLSX.utils.json_to_sheet(data, { header: cols.map((c) => c.header) })
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(c.header.length + 2, 14) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31))
  XLSX.writeFile(wb, `${file}.xlsx`)
}

/** PDF fonts can't draw ₹, so money columns print as "Rs. 1,82,000". */
export function exportPdf<T>(file: string, title: string, subtitle: string, cols: ExportColumn<T>[], rows: T[]) {
  const doc = new jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20, 31, 29)
  doc.text(`SNIREVA · ${title}`, 40, 44)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(69, 83, 78)
  doc.text(subtitle, 40, 60)
  autoTable(doc, {
    startY: 76,
    head: [cols.map((c) => c.header)],
    body: rows.map((r) => cols.map((c) => { const v = c.value(r); return c.money ? rs(Number(v)) : String(v ?? '') })),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, lineColor: [220, 230, 224], lineWidth: 0.5, textColor: [20, 31, 29] },
    headStyles: { fillColor: [242, 247, 244], textColor: [69, 83, 78], fontStyle: 'bold' },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, c.money ? { halign: 'right' as const } : {}])),
    didDrawPage: () => {
      const n = doc.getNumberOfPages()
      doc.setFontSize(8); doc.setTextColor(102, 117, 111)
      doc.text(`Generated ${new Date().toLocaleString('en-IN')} · page ${n}`, 40, doc.internal.pageSize.getHeight() - 20)
    },
  })
  doc.save(`${file}.pdf`)
}
