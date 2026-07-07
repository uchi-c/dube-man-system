import React, { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';

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
  searchPlaceholder = "Search items...",
  filterFunction,
  emptyMessage = "No details found in our systems.",
  loading = false
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Filter items
  const filteredData = React.useMemo(() => {
    if (!filterFunction || !query) return data;
    return data.filter(item => filterFunction(item, query));
  }, [data, query, filterFunction]);

  // Paginated items
  const paginatedData = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  // Reset pagination on filter query change
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs space-y-4 p-4" id={id}>
      
      {/* Search Header block */}
      {filterFunction && (
        <div className="relative">
          <input
            type="text"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-rose-500 text-slate-700 rounded-2xl outline-none text-xs transition-all"
            placeholder={searchPlaceholder}
            value={query}
            onChange={handleQueryChange}
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        </div>
      )}

      {/* Main Table section */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 font-mono text-slate-400 uppercase tracking-wider text-[10px]">
              {columns.map((column, idx) => (
                <th key={idx} className={`px-4 py-3 font-bold ${column.className || ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody className="divide-y divide-slate-100 text-slate-600 font-sans relative">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-rose-500 mx-auto mb-2" />
                  <span>Synchronizing remote data ledger...</span>
                </td>
              </tr>
            ) : paginatedData.length > 0 ? (
              paginatedData.map((item, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-50/50 transition-colors">
                  {columns.map((column, colIdx) => (
                    <td key={colIdx} className={`px-4 py-3.5 whitespace-nowrap align-middle ${column.className || ''}`}>
                      {column.accessor(item)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-slate-400">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <span className="font-semibold block text-slate-600">Information Ledger Empty</span>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-1">{emptyMessage}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-3 rounded-2xl text-[11px] font-mono text-slate-500 mt-2">
          <span>
            Page <strong>{currentPage}</strong> of {totalPages} &bull; Showing {paginatedData.length} of {filteredData.length} records
          </span>
          <div className="flex space-x-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 px-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-700 disabled:opacity-40 rounded-lg shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5 inline mr-0.5" /> Prev
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 px-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-700 disabled:opacity-40 rounded-lg shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              Next <ChevronRight className="w-3.5 h-3.5 inline ml-0.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
