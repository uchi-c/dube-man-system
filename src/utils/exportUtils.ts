/**
 * src/utils/exportUtils.ts
 * Shared PDF/Excel export for any module's data table — Inventory, Sales,
 * Customers, Pharmacy, etc. Both functions take the same simple shape
 * (columns + rows of already-formatted strings/numbers) so a page never
 * needs to know anything about exceljs or jspdf directly.
 *
 * exceljs (not the npm `xlsx` package) is used deliberately: `xlsx`'s
 * npm-registry release has a known unpatched prototype-pollution/ReDoS
 * advisory (SheetJS only ships fixes via their own CDN, which this
 * project's network policy can't reach), so exceljs is the safer choice
 * even though it's a heavier dependency.
 *
 * Both libraries are dynamically imported (not top-level) — together
 * they're a ~400KB gzipped chunk, and every page with an ExportButtons
 * instance would otherwise pull that in just to render two buttons.
 * Loading it only when someone actually clicks Excel/PDF keeps Inventory/
 * Sales/Customers/Pharmacy's own load light for everyone who never exports.
 */

export interface ExportColumn {
  header: string;
  key: string;
  /** Excel column width in characters. Ignored for PDF (auto-sized). */
  width?: number;
}

export type ExportRow = Record<string, string | number | null | undefined>;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportToExcel(
  filename: string,
  sheetName: string,
  columns: ExportColumn[],
  rows: ExportRow[],
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Uruu OS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31)); // Excel sheet-name limit
  sheet.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach(r => sheet.addRow(r));

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`,
  );
}

export async function exportToPdf(
  filename: string,
  title: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  subtitle?: string,
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait' });

  doc.setFontSize(14);
  doc.text(title, 14, 16);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(subtitle, 14, 22);
  }

  autoTable(doc, {
    startY: subtitle ? 27 : 22,
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => String(r[c.key] ?? ''))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [23, 42, 112] },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
