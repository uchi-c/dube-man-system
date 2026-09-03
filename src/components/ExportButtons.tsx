import { useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { exportToExcel, exportToPdf, ExportColumn, ExportRow } from '../utils/exportUtils';

interface ExportButtonsProps {
  filename: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

/**
 * Two small buttons — "Excel" / "PDF" — dropped into a module's page
 * header to export whatever's currently in its table. Both formats build
 * from the exact same columns/rows the caller passes in, so a page never
 * has two separate lists to keep in sync.
 */
export default function ExportButtons({ filename, title, subtitle, columns, rows }: ExportButtonsProps) {
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  const handleExcel = async () => {
    setExporting('excel');
    try {
      await exportToExcel(filename, title, columns, rows);
    } finally {
      setExporting(null);
    }
  };

  const handlePdf = async () => {
    setExporting('pdf');
    try {
      await exportToPdf(filename, title, columns, rows, subtitle);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="dm-btn dm-btn-ghost"
        onClick={handleExcel}
        disabled={!rows.length || exporting !== null}
        title="Download as Excel"
      >
        {exporting === 'excel' ? <Loader2 className="dm-spin" style={{ width: 14, height: 14 }} /> : <FileSpreadsheet style={{ width: 14, height: 14 }} />}
        <span>Excel</span>
      </button>
      <button
        type="button"
        className="dm-btn dm-btn-ghost"
        onClick={handlePdf}
        disabled={!rows.length || exporting !== null}
        title="Download as PDF"
      >
        {exporting === 'pdf' ? <Loader2 className="dm-spin" style={{ width: 14, height: 14 }} /> : <FileText style={{ width: 14, height: 14 }} />}
        <span>PDF</span>
      </button>
    </div>
  );
}
