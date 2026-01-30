import { useState } from 'react';
import { X, FileText, Download, Info, Layers } from 'lucide-react';

/**
 * Simplified Export Modal - Just confirms export with current table state
 * The PDF will mirror exactly what the user sees in the HTML table:
 * - Same column order and visibility
 * - Same sort order
 * - Same filtered data
 */
export default function ExportConfigModal({ 
  isOpen, 
  onClose, 
  onExport, 
  isExporting = false,
  recordCount = 0,
  consolidatedCount = 0,
  visibleColumnCount = 0,
}) {
  const [includesSummary, setIncludesSummary] = useState(true);
  const [isConsolidated, setIsConsolidated] = useState(false);

  // Calculate display count based on consolidation toggle
  const displayCount = isConsolidated ? consolidatedCount : recordCount;
  const savedRows = recordCount - consolidatedCount;

  if (!isOpen) return null;

  const handleExport = () => {
    onExport({ includesSummary, isConsolidated });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-teal-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-white" />
            <h2 className="text-lg font-semibold text-white">Export to PDF</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Info Box */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">What You See Is What You Get</p>
              <p className="text-blue-600">
                The PDF will mirror your current table view exactly — same columns, same order, same sorting.
              </p>
            </div>
          </div>

          {/* Export Summary */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Export Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg transition-colors ${isConsolidated ? 'bg-teal-50 border border-teal-200' : 'bg-gray-50'}`}>
                <p className="text-2xl font-bold text-teal-600">{displayCount}</p>
                <p className="text-xs text-gray-500">
                  {isConsolidated ? 'Consolidated rows' : 'Records to export'}
                </p>
                {isConsolidated && savedRows > 0 && (
                  <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {savedRows} duplicates merged
                  </p>
                )}
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-teal-600">{visibleColumnCount}</p>
                <p className="text-xs text-gray-500">Visible columns</p>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Options</h3>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={isConsolidated}
                onChange={(e) => setIsConsolidated(e.target.checked)}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Consolidate Monthly Duplicates</p>
                <p className="text-xs text-gray-500">Merge identical plans into one row and group their months (e.g., "Jan - Dec")</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input
                type="checkbox"
                checked={includesSummary}
                onChange={(e) => setIncludesSummary(e.target.checked)}
                className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Include Summary Page</p>
                <p className="text-xs text-gray-500">Adds priority & status breakdown at the end</p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || recordCount === 0}
            className="px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
