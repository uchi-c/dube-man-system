import React, { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react';

interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  sortKey?: string;
  className?: string;
}

interface DataTableProps<T> {
  id?: string;
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  filterFunction?: (item: T, query: string) => boolean;
  emptyMessage?: string;
  loading?: boolean;
}

export default function DataTable<T>({
  id,
  data,
  columns,
  searchPlaceholder = 'Search…',
  filterFunction,
  emptyMessage = 'Nothing here yet.',
  loading = false,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const filteredData = React.useMemo(() => {
    if (!filterFunction || !query) return data;
    return data.filter(item => filterFunction(item, query));
  }, [data, query, filterFunction]);

  const paginatedData = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="dm-card space-y-4 p-4" id={id}>
      {filterFunction && (
        <div className="relative">
          <Search style={{ width: 16, height: 16, color: 'var(--text-low)', position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input type="text" className="dm-input" style={{ paddingLeft: '2.5rem' }} placeholder={searchPlaceholder} value={query} onChange={handleQueryChange} />
        </div>
      )}

      <div className="dm-scroll-x">
        <table className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--panel-line)' }}>
              {columns.map((column, idx) => (
                <th key={idx} className={`dm-label ${column.className || ''}`} style={{ padding: '12px 16px' }}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-low)' }}>
                  <RefreshCw className="dm-spin" style={{ width: 22, height: 22, margin: '0 auto 8px' }} />
                  <span>Loading…</span>
                </td>
              </tr>
            ) : paginatedData.length > 0 ? (
              paginatedData.map((item, rowIdx) => (
                <tr key={rowIdx} style={{ borderBottom: '1px solid var(--panel-line)' }} className="dm-row">
                  {columns.map((column, colIdx) => (
                    <td key={colIdx} className={column.className || ''} style={{ padding: '12px 16px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {column.accessor(item)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-low)' }}>
                  <Inbox style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.6 }} />
                  <span style={{ display: 'block', fontWeight: 600, color: 'var(--text-mid)' }}>Nothing here yet</span>
                  <p style={{ fontSize: '0.78rem', maxWidth: '22rem', margin: '4px auto 0' }}>{emptyMessage}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center p-3 rounded-2xl" style={{ background: 'var(--panel-2)', border: '1px solid var(--panel-line)' }}>
          <span className="dm-nums" style={{ fontSize: '0.72rem', color: 'var(--text-low)' }}>
            Page <strong style={{ color: 'var(--text-mid)' }}>{currentPage}</strong> of {totalPages} · {filteredData.length} records
          </span>
          <div className="flex gap-1.5">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="dm-btn dm-btn-ghost" style={{ minHeight: 34, padding: '0 0.7rem', fontSize: '0.75rem' }}>
              <ChevronLeft style={{ width: 14, height: 14 }} /> Prev
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="dm-btn dm-btn-ghost" style={{ minHeight: 34, padding: '0 0.7rem', fontSize: '0.75rem' }}>
              Next <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
