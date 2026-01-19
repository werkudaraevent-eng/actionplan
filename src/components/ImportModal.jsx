import { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Calendar } from 'lucide-react';
import Papa from 'papaparse';
import { supabase, DEPARTMENTS } from '../lib/supabase';
import { useToast } from './Toast';

const TEMPLATE_HEADERS = [
  'department_code',
  'month',
  'goal_strategy',
  'action_plan',
  'indicator',
  'pic',
  'report_format'
];

const VALID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VALID_DEPT_CODES = DEPARTMENTS.map(d => d.code);

// Available years for import (current year + 2 previous years)
const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function ImportModal({ isOpen, onClose, onImportComplete }) {
  const { toast } = useToast();
  const [step, setStep] = useState(1); // 1: upload, 2: processing, 3: results
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState({ success: 0, failed: 0, errors: [] });
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const downloadTemplate = () => {
    const csvContent = TEMPLATE_HEADERS.join(',') + '\n' +
      'BAS,Jan,Improve Operations,Implement new system,System deployed,John Doe,Monthly Report\n' +
      'HR,Feb,Talent Acquisition,Hire 5 engineers,5 hires completed,HR Manager,Weekly Update';
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `action_plans_template_${selectedYear}.csv`;
    link.click();
  };

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

  const handleFile = (file) => {
    if (!file.name.endsWith('.csv')) {
      toast({ title: 'Invalid File', description: 'Please upload a CSV file', variant: 'warning' });
      return;
    }
    setFile(file);
  };

  const validateRow = (row, index) => {
    const errors = [];
    
    if (!row.department_code || !VALID_DEPT_CODES.includes(row.department_code.toUpperCase())) {
      errors.push(`Invalid department_code: "${row.department_code}"`);
    }
    
    if (!row.month || !VALID_MONTHS.includes(row.month)) {
      errors.push(`Invalid month: "${row.month}". Use: ${VALID_MONTHS.join(', ')}`);
    }
    
    if (!row.goal_strategy?.trim()) errors.push('Missing goal_strategy');
    if (!row.action_plan?.trim()) errors.push('Missing action_plan');
    if (!row.indicator?.trim()) errors.push('Missing indicator');
    if (!row.pic?.trim()) errors.push('Missing pic');
    
    return errors;
  };

  const processImport = async () => {
    if (!file) return;
    
    setProcessing(true);
    setStep(2);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (parseResults) => {
        const rows = parseResults.data;
        let successCount = 0;
        let failedCount = 0;
        const errorDetails = [];
        
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const rowErrors = validateRow(row, i + 2);
          
          if (rowErrors.length > 0) {
            failedCount++;
            errorDetails.push({ row: i + 2, errors: rowErrors });
            continue;
          }
          
          // Insert into Supabase with selected year
          const { error } = await supabase.from('action_plans').insert({
            department_code: row.department_code.toUpperCase(),
            month: row.month,
            year: selectedYear, // Inject selected year
            goal_strategy: row.goal_strategy.trim(),
            action_plan: row.action_plan.trim(),
            indicator: row.indicator.trim(),
            pic: row.pic.trim(),
            report_format: row.report_format?.trim() || 'Monthly Report',
            status: 'Pending',
          });
          
          if (error) {
            failedCount++;
            errorDetails.push({ row: i + 2, errors: [error.message] });
          } else {
            successCount++;
          }
        }
        
        setResults({ success: successCount, failed: failedCount, errors: errorDetails });
        setStep(3);
        setProcessing(false);
        
        if (successCount > 0) {
          onImportComplete?.();
        }
      },
      error: (error) => {
        setResults({ success: 0, failed: 1, errors: [{ row: 0, errors: [error.message] }] });
        setStep(3);
        setProcessing(false);
      }
    });
  };

  const resetModal = () => {
    setStep(1);
    setFile(null);
    setResults({ success: 0, failed: 0, errors: [] });
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Import Action Plans</h2>
                <p className="text-sm text-gray-500">Bulk upload from CSV file</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              {/* Year Selection */}
              <div className="bg-amber-50 rounded-lg p-4">
                <p className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Select Fiscal Year
                </p>
                <p className="text-sm text-amber-600 mb-3">
                  All imported records will be assigned to this year.
                </p>
                <div className="flex gap-2">
                  {AVAILABLE_YEARS.map((year) => (
                    <button
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedYear === year
                          ? 'bg-amber-600 text-white'
                          : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              {/* Download Template */}
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-800 mb-2">Step 1: Get the Template</p>
                <p className="text-sm text-blue-600 mb-3">
                  Download our CSV template with the correct headers and sample data.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
              </div>

              {/* Upload */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Step 2: Upload Your File</p>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    dragActive ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-gray-400'
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
                    accept=".csv"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  {file ? (
                    <div>
                      <p className="text-sm text-teal-600 font-medium">{file.name}</p>
                      <p className="text-xs text-gray-500 mt-1">Will be imported as {selectedYear} data</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">Drag & drop your CSV file here</p>
                      <p className="text-xs text-gray-400 mt-1">or click to browse</p>
                    </>
                  )}
                </div>
              </div>

              {/* Import Button */}
              <button
                onClick={processImport}
                disabled={!file}
                className="w-full py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Import to {selectedYear}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 text-teal-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Importing to {selectedYear}...</p>
              <p className="text-sm text-gray-400 mt-1">This may take a moment</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Success Summary */}
              <div className={`rounded-lg p-4 ${results.success > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="flex items-center gap-3">
                  {results.success > 0 ? (
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  )}
                  <div>
                    <p className="font-semibold text-gray-800">Import Complete ({selectedYear})</p>
                    <p className="text-sm text-gray-600">
                      <span className="text-green-600 font-medium">{results.success} rows</span> imported successfully
                      {results.failed > 0 && (
                        <>, <span className="text-red-600 font-medium">{results.failed} rows</span> failed</>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Details */}
              {results.errors.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium text-gray-700 mb-2">Error Details:</p>
                  <div className="space-y-2">
                    {results.errors.slice(0, 10).map((err, idx) => (
                      <div key={idx} className="text-xs text-red-600 bg-red-50 rounded p-2">
                        <span className="font-medium">Row {err.row}:</span> {err.errors.join(', ')}
                      </div>
                    ))}
                    {results.errors.length > 10 && (
                      <p className="text-xs text-gray-500">...and {results.errors.length - 10} more errors</p>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={resetModal}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Import More
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
