import { useState } from 'react';
import { Download, FileSpreadsheet, FileJson, Copy, FileImage, Check, Loader2 } from 'lucide-react';
import { buildMarkdownSummary, exportDashboardExcel, exportDashboardJSON, exportDashboardPDF } from '../../utils/dashboardExportUtils';

const EXPORT_OPTIONS = [
  {
    id: 'pdf',
    label: 'Export as PDF',
    description: 'Visual screenshot — untuk presentasi atau upload ke AI',
    icon: FileImage,
  },
  {
    id: 'excel',
    label: 'Export as Excel',
    description: 'Data terstruktur — untuk analisa di spreadsheet',
    icon: FileSpreadsheet,
  },
  {
    id: 'json',
    label: 'Export as JSON',
    description: 'Data mentah — untuk developer atau integrasi API',
    icon: FileJson,
  },
  {
    id: 'clipboard',
    label: 'Copy for AI Analysis',
    description: 'Copy ringkasan — paste langsung ke ChatGPT atau Claude',
    icon: Copy,
  },
];

export default function DashboardExportButton({ dashboardData, dashboardElementId, title }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleExport = async (optionId) => {
    setLoading(optionId);
    try {
      switch (optionId) {
        case 'pdf':
          await exportDashboardPDF(dashboardElementId, title);
          break;
        case 'excel':
          exportDashboardExcel(dashboardData);
          break;
        case 'json':
          exportDashboardJSON(dashboardData);
          break;
        case 'clipboard': {
          const md = buildMarkdownSummary(dashboardData);
          await navigator.clipboard.writeText(md);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          break;
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setLoading(null);
      if (optionId !== 'clipboard') setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Download className="w-4 h-4" />
        Export
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-2">
              <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Export Dashboard</p>
              {EXPORT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isLoading = loading === option.id;
                const isCopied = option.id === 'clipboard' && copied;

                return (
                  <button
                    key={option.id}
                    onClick={() => handleExport(option.id)}
                    disabled={isLoading}
                    className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    <div className="p-1.5 bg-gray-100 rounded-lg shrink-0">
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                      ) : isCopied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Icon className="w-4 h-4 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {isCopied ? 'Copied!' : option.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
