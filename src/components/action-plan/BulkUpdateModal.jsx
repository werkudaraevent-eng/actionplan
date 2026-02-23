import { useState, useRef } from 'react';
import { X, Upload, Download, RefreshCw, CheckCircle, AlertCircle, Loader2, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import { useCompanyContext } from '../../context/CompanyContext';

const BATCH_SIZE = 20; // Process 20 rows at a time

export default function BulkUpdateModal({ isOpen, onClose, onUpdateComplete }) {
  const { toast } = useToast();
  const { activeCompanyId } = useCompanyContext();
  const fileInputRef = useRef(null);

  // State
  const [step, setStep] = useState(1); // 1: upload, 2: preview, 3: processing, 4: results
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [columnsToUpdate, setColumnsToUpdate] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState({ success: 0, failed: 0, errors: [] });

  if (!isOpen) return null;

  // Handle drag events
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (uploadedFile) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExt = uploadedFile.name.substring(uploadedFile.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExt)) {
      toast({ title: 'Invalid File', description: 'Please upload an Excel or CSV file', variant: 'warning' });
      return;
    }

    setFile(uploadedFile);
    parseFile(uploadedFile);
  };

  // Parse the uploaded file
  const parseFile = (uploadedFile) => {
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) {
          toast({ title: 'Empty File', description: 'The file contains no data rows.', variant: 'warning' });
          return;
        }

        // Check for 'id' column (case-insensitive)
        const headers = Object.keys(rows[0]);
        const idColumn = headers.find(h => h.toLowerCase() === 'id');

        if (!idColumn) {
          toast({
            title: 'Missing ID Column',
            description: 'Your file must have an "id" column to identify which records to update.',
            variant: 'error'
          });
          setFile(null);
          return;
        }

        // Identify columns to update (everything except 'id')
        const updateCols = headers.filter(h => h.toLowerCase() !== 'id');

        if (updateCols.length === 0) {
          toast({
            title: 'No Update Columns',
            description: 'Your file only has an "id" column. Add columns you want to update.',
            variant: 'warning'
          });
          setFile(null);
          return;
        }

        // Normalize data: ensure 'id' key is lowercase for consistency
        const normalizedData = rows.map(row => {
          const normalized = {};
          Object.entries(row).forEach(([key, value]) => {
            if (key.toLowerCase() === 'id') {
              normalized.id = value;
            } else {
              normalized[key] = value;
            }
          });
          return normalized;
        });

        // Filter out rows without valid UUIDs
        const validData = normalizedData.filter(row => {
          const id = row.id?.toString().trim();
          // Basic UUID validation (36 chars with hyphens)
          return id && id.length === 36 && id.includes('-');
        });

        if (validData.length === 0) {
          toast({
            title: 'No Valid IDs',
            description: 'No rows have valid UUID format in the "id" column.',
            variant: 'error'
          });
          setFile(null);
          return;
        }

        setParsedData(validData);
        setColumnsToUpdate(updateCols);
        setStep(2); // Move to preview

      } catch (parseError) {
        console.error('Parse error:', parseError);
        toast({ title: 'Parse Error', description: 'Failed to parse the file. Check the format.', variant: 'error' });
        setFile(null);
      }
    };

    reader.onerror = () => {
      toast({ title: 'Read Error', description: 'Failed to read the file.', variant: 'error' });
      setFile(null);
    };

    reader.readAsBinaryString(uploadedFile);
  };

  // Process the bulk update
  const processUpdate = async () => {
    // SECURITY: Hard guard — refuse to process without a tenant context
    if (!activeCompanyId) {
      toast({ title: 'Security Error', description: 'No active company selected. Cannot process update.', variant: 'error' });
      return;
    }

    setProcessing(true);
    setStep(3);
    setProgress(0);

    let successCount = 0;
    let failedCount = 0;
    const errorDetails = [];

    const totalRows = parsedData.length;
    const batches = Math.ceil(totalRows / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const start = batchIndex * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, totalRows);
      const batch = parsedData.slice(start, end);

      // Process each row in the batch
      const batchPromises = batch.map(async (row, idx) => {
        const rowNumber = start + idx + 2; // +2 for header row and 1-based index
        const id = row.id?.toString().trim();

        // Build update payload (exclude 'id')
        const updatePayload = {};
        columnsToUpdate.forEach(col => {
          const value = row[col];
          // Only include non-empty values (empty string = skip)
          if (value !== '' && value !== undefined && value !== null) {
            updatePayload[col] = value;
          }
        });

        // Skip if no fields to update
        if (Object.keys(updatePayload).length === 0) {
          return { success: true, skipped: true };
        }

        // SECURITY: Strip company_id from payload — users must NOT change tenant ownership
        delete updatePayload.company_id;

        // Add updated_at timestamp
        updatePayload.updated_at = new Date().toISOString();

        try {
          const { error, count } = await supabase
            .from('action_plans')
            .update(updatePayload)
            .eq('id', id)
            .eq('company_id', activeCompanyId); // CRITICAL: tenant isolation guard

          if (error) {
            return { success: false, row: rowNumber, id, error: error.message };
          }
          return { success: true };
        } catch (err) {
          return { success: false, row: rowNumber, id, error: err.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      batchResults.forEach(result => {
        if (result.success) {
          if (!result.skipped) successCount++;
        } else {
          failedCount++;
          errorDetails.push({
            row: result.row,
            id: result.id,
            error: result.error
          });
        }
      });

      // Update progress
      setProgress(Math.round(((batchIndex + 1) / batches) * 100));

      // Small delay between batches to prevent overwhelming the server
      if (batchIndex < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    setResults({ success: successCount, failed: failedCount, errors: errorDetails });
    setStep(4);
    setProcessing(false);

    if (successCount > 0) {
      onUpdateComplete?.();
    }
  };

  // Reset modal state
  const resetModal = () => {
    setStep(1);
    setFile(null);
    setParsedData([]);
    setColumnsToUpdate([]);
    setProgress(0);
    setResults({ success: 0, failed: 0, errors: [] });
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 shrink-0 bg-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Universal Bulk Update</h2>
                <p className="text-sm text-gray-500">Update any column via Excel/CSV</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="space-y-5">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4" /> How It Works</p>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li>Your file <strong>must</strong> have an <code className="bg-blue-100 px-1 rounded">id</code> column (UUID)</li>
                  <li>Any other column name will be updated (e.g., <code className="bg-blue-100 px-1 rounded">evidence</code>, <code className="bg-blue-100 px-1 rounded">remark</code>)</li>
                  <li>Column names must match database columns exactly</li>
                  <li>Empty cells are skipped (not overwritten)</li>
                </ul>
              </div>

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Use with Caution</p>
                    <p className="text-xs text-amber-700 mt-1">
                      This tool directly updates database records. Double-check your file before uploading.
                    </p>
                  </div>
                </div>
              </div>

              {/* Upload Area */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Upload Your File</p>
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  {file ? (
                    <div>
                      <p className="text-sm text-purple-600 font-medium">{file.name}</p>
                      <p className="text-xs text-gray-500 mt-1">Click to change file</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">Drag & drop your file here</p>
                      <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-semibold text-green-800">File Parsed Successfully</p>
                </div>
                <p className="text-sm text-green-700">
                  Found <strong>{parsedData.length}</strong> rows with valid IDs
                </p>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <p className="text-sm font-medium text-purple-800 mb-2">Columns to Update:</p>
                <div className="flex flex-wrap gap-2">
                  {columnsToUpdate.map(col => (
                    <span key={col} className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {/* Preview Table */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Preview (first 5 rows):</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600">id</th>
                          {columnsToUpdate.slice(0, 3).map(col => (
                            <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600">{col}</th>
                          ))}
                          {columnsToUpdate.length > 3 && (
                            <th className="px-3 py-2 text-left font-semibold text-gray-400">+{columnsToUpdate.length - 3} more</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parsedData.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-500 font-mono truncate max-w-[120px]" title={row.id}>
                              {row.id?.substring(0, 8)}...
                            </td>
                            {columnsToUpdate.slice(0, 3).map(col => (
                              <td key={col} className="px-3 py-2 text-gray-700 truncate max-w-[150px]" title={row[col]}>
                                {row[col] || <span className="text-gray-300">—</span>}
                              </td>
                            ))}
                            {columnsToUpdate.length > 3 && (
                              <td className="px-3 py-2 text-gray-400">...</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Processing */}
          {step === 3 && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-700 font-medium mb-2">Processing Updates...</p>
              <p className="text-sm text-gray-500 mb-4">
                Updating {parsedData.length} records in batches of {BATCH_SIZE}
              </p>

              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">{progress}% complete</p>
            </div>
          )}

          {/* Step 4: Results */}
          {step === 4 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className={`rounded-lg p-4 ${results.failed === 0
                ? 'bg-green-50 border border-green-200'
                : results.success === 0
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-amber-50 border border-amber-200'
                }`}>
                <div className="flex items-center gap-3">
                  {results.failed === 0 ? (
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  ) : results.success === 0 ? (
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  ) : (
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                  )}
                  <div>
                    <p className="font-semibold text-gray-800">Update Complete</p>
                    <p className="text-sm text-gray-600">
                      <span className="text-green-600 font-medium">{results.success} succeeded</span>
                      {results.failed > 0 && (
                        <>, <span className="text-red-600 font-medium">{results.failed} failed</span></>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Log */}
              {results.errors.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Error Log:</p>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {results.errors.slice(0, 20).map((err, idx) => (
                      <div key={idx} className="text-xs bg-red-50 text-red-700 rounded p-2">
                        <span className="font-medium">Row {err.row}</span>
                        <span className="text-red-500 mx-1">|</span>
                        <span className="font-mono text-red-600">{err.id?.substring(0, 8)}...</span>
                        <span className="text-red-500 mx-1">→</span>
                        <span>{err.error}</span>
                      </div>
                    ))}
                    {results.errors.length > 20 && (
                      <p className="text-xs text-gray-500">...and {results.errors.length - 20} more errors</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/80 rounded-b-2xl shrink-0">
          {step === 1 && (
            <p className="text-xs text-center text-gray-400">
              Upload a file to continue
            </p>
          )}

          {step === 2 && (
            <div className="flex gap-3">
              <button
                onClick={resetModal}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={processUpdate}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
              >
                Update {parsedData.length} Records
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="flex gap-3">
              <button
                onClick={resetModal}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Update More
              </button>
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}