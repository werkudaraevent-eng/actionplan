import { useState, useRef } from 'react';
import { X, Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useDepartments } from '../../hooks/useDepartments';
import { useCompanyContext } from '../../context/CompanyContext';
import { useToast } from '../common/Toast';

const TEMPLATE_HEADERS = [
  'Department Code',
  'Month',
  'Category',
  'Focus Area',
  'Goal/Strategy',
  'Action Plan',
  'Indicator',
  'PIC',
  'Evidence',
  'Status',
  'Proof of Evidence',
  'Remarks'
];

const VALID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Month name mapping (handles various formats)
const MONTH_MAP = {
  'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr', 'may': 'May', 'jun': 'Jun',
  'jul': 'Jul', 'aug': 'Aug', 'sep': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'dec': 'Dec',
  'january': 'Jan', 'february': 'Feb', 'march': 'Mar', 'april': 'Apr', 'june': 'Jun',
  'july': 'Jul', 'august': 'Aug', 'september': 'Sep', 'october': 'Oct', 'november': 'Nov', 'december': 'Dec'
};

/**
 * Smart Month Parser - Handles various period formats:
 * - Single: "Jan", "January"
 * - Range: "Jan - Mar", "Jan to Dec", "Jan-Dec 2026"
 * - List: "Mar, Jun, Sep", "Jan; Apr; Jul"
 * Returns array of standardized month names
 */
const parseMonths = (periodString) => {
  if (!periodString) return [];

  // Normalize: lowercase, remove years (e.g., "2026"), remove extra spaces
  let raw = periodString.toLowerCase().replace(/20\d\d/g, '').trim();

  const months = [];

  // SCENARIO A: Range (e.g., "Jan - Mar", "Jan to Dec")
  if (raw.includes('-') || raw.includes(' to ')) {
    const parts = raw.split(/-| to /).map(s => s.trim());
    if (parts.length === 2) {
      const startKey = parts[0].substring(0, 3);
      const endKey = parts[1].substring(0, 3);
      const startMonth = MONTH_MAP[startKey];
      const endMonth = MONTH_MAP[endKey];

      if (startMonth && endMonth) {
        const startIndex = VALID_MONTHS.indexOf(startMonth);
        const endIndex = VALID_MONTHS.indexOf(endMonth);

        if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
          for (let i = startIndex; i <= endIndex; i++) {
            months.push(VALID_MONTHS[i]);
          }
        }
      }
    }
  }
  // SCENARIO B: Comma/Semicolon Separated (e.g., "Mar, Jun, Sep")
  else if (raw.includes(',') || raw.includes(';')) {
    const parts = raw.split(/[,;]/).map(s => s.trim());
    parts.forEach(p => {
      const key = p.substring(0, 3);
      const m = MONTH_MAP[key];
      if (m) months.push(m);
    });
  }
  // SCENARIO C: Single Month (e.g., "Jan", "January")
  else {
    const key = raw.substring(0, 3);
    const m = MONTH_MAP[key];
    if (m) months.push(m);
  }

  // Remove duplicates and return
  return [...new Set(months)];
};

// Available years for import (current year + 2 previous years)
const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function ImportModal({ isOpen, onClose, onImportComplete }) {
  const { toast } = useToast();
  const { activeCompanyId } = useCompanyContext();
  const { departments } = useDepartments(activeCompanyId);
  const [step, setStep] = useState(1); // 1: upload, 2: processing, 3: results
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState({ success: 0, failed: 0, errors: [] });
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const downloadTemplate = () => {
    // Create sample data rows (Score column removed - graded later on web)
    const sampleData = [
      TEMPLATE_HEADERS,
      ['BAS', 'Jan', 'UH', 'Workforce Optimization', 'Improve Operations', 'Implement new system', 'System deployed', 'John Doe', 'Monthly report submitted', 'Open', '', ''],
      ['HR', 'Feb', 'Priority', 'Talent Development', 'Talent Acquisition', 'Hire 5 engineers', '5 hires completed', 'HR Manager', 'Hiring tracker updated', 'Achieved', 'https://drive.google.com/example', 'Completed ahead of schedule'],
      ['IT', 'Jan - Mar', 'UH', 'Digital Transformation', 'System Upgrade', 'Upgrade ERP system', 'ERP v2.0 deployed', 'IT Lead', 'Deployment report', 'Open', '', 'Multi-month project']
    ];

    // Create workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Action Plans');

    // Set column widths for better readability
    ws['!cols'] = [
      { wch: 15 }, // Department Code
      { wch: 12 }, // Month
      { wch: 12 }, // Category
      { wch: 25 }, // Focus Area
      { wch: 25 }, // Goal/Strategy
      { wch: 30 }, // Action Plan
      { wch: 25 }, // Indicator
      { wch: 15 }, // PIC
      { wch: 25 }, // Evidence
      { wch: 12 }, // Status
      { wch: 35 }, // Proof of Evidence
      { wch: 30 }  // Remarks
    ];

    // Download the file
    XLSX.writeFile(wb, `action_plans_template_${selectedYear}.xlsx`);
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
    const validExtensions = ['.xlsx', '.xls'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExt)) {
      toast({ title: 'Invalid File', description: 'Please upload an Excel file (.xlsx or .xls)', variant: 'warning' });
      return;
    }
    setFile(file);
  };

  const validateRow = (row) => {
    const errors = [];

    // Map CSV headers to row keys (PapaParse uses exact header names as keys)
    const deptCode = row['Department Code'];
    const monthRaw = row['Month'];
    const goalStrategy = row['Goal/Strategy'];
    const actionPlan = row['Action Plan'];
    const indicator = row['Indicator'];
    const pic = row['PIC'];

    const validDeptCodes = departments.map(d => d.code);
    if (!deptCode || !validDeptCodes.includes(deptCode.toUpperCase())) {
      errors.push(`Invalid Department Code: "${deptCode}"`);
    }

    // Use smart month parser
    const parsedMonths = parseMonths(monthRaw);
    if (parsedMonths.length === 0) {
      errors.push(`Invalid Month: "${monthRaw}". Use: Jan, Feb, Mar, etc. or ranges like "Jan - Mar"`);
    }

    if (!goalStrategy?.trim()) errors.push('Missing Goal/Strategy');
    if (!actionPlan?.trim()) errors.push('Missing Action Plan');
    if (!indicator?.trim()) errors.push('Missing Indicator');
    if (!pic?.trim()) errors.push('Missing PIC');

    return { errors, parsedMonths };
  };

  const processImport = async () => {
    if (!file) return;

    setProcessing(true);
    setStep(2);

    try {
      const reader = new FileReader();

      reader.onload = async (evt) => {
        try {
          const bstr = evt.target.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });

          // Get the first sheet
          const wsname = workbook.SheetNames[0];
          const ws = workbook.Sheets[wsname];

          // Convert to JSON (Array of Objects)
          // defval: "" ensures empty cells aren't undefined
          const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

          let successCount = 0;
          let failedCount = 0;
          const errorDetails = [];

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Flexible header mapping (handles various Excel header formats)
            const mappedRow = {
              'Department Code': row['Department Code'] || row['DEPT'] || row['Dept'] || row['Department'],
              'Month': row['Month'] || row['Periode'] || row['Period'] || row['MONTH'],
              'Category': row['Category'] || row['CATEGORY'] || row['Cat'],
              'Focus Area': row['Focus Area'] || row['AREA TO BE FOCUS'] || row['Area Focus'] || row['FOCUS AREA'],
              'Goal/Strategy': row['Goal/Strategy'] || row['GOAL/STRATEGI'] || row['Goal'] || row['Strategy'],
              'Action Plan': row['Action Plan'] || row['ACTION PLAN'] || row['Action'],
              'Indicator': row['Indicator'] || row['INDICATOR'],
              'PIC': row['PIC'] || row['Person In Charge'],
              'Evidence': row['Evidence'] || row['EVIDENCE'],
              'Status': row['Status'] || row['STATUS'],
              'Proof of Evidence': row['Proof of Evidence'] || row['PROOF OF EVIDENCE'] || row['Outcome Link'] || row['Outcome'],
              'Remarks': row['Remarks'] || row['REMARK'] || row['Remark'] || row['REMARKS']
            };

            const { errors: rowErrors, parsedMonths } = validateRow(mappedRow);

            if (rowErrors.length > 0) {
              failedCount++;
              errorDetails.push({ row: i + 2, errors: rowErrors });
              continue;
            }

            // Create one record per parsed month (handles ranges like "Jan - Mar")
            for (const month of parsedMonths) {
              // NOTE: Score is NOT imported - it is graded later on the web by Management
              const insertData = {
                department_code: mappedRow['Department Code']?.toString().toUpperCase(),
                month: month,
                year: selectedYear,
                category: mappedRow['Category']?.toString().trim() || null,
                area_focus: mappedRow['Focus Area']?.toString().trim() || null,
                goal_strategy: mappedRow['Goal/Strategy']?.toString().trim(),
                action_plan: mappedRow['Action Plan']?.toString().trim(),
                indicator: mappedRow['Indicator']?.toString().trim(),
                pic: mappedRow['PIC']?.toString().trim(),
                evidence: mappedRow['Evidence']?.toString().trim() || null,
                status: 'Open', // Always start as Open for new imports
                outcome_link: mappedRow['Proof of Evidence']?.toString().trim() || null,
                remark: mappedRow['Remarks']?.toString().trim() || null,
                company_id: activeCompanyId, // MULTI-TENANT: stamp company_id on imported rows
              };

              const { error } = await supabase.from('action_plans').insert(insertData);

              if (error) {
                failedCount++;
                errorDetails.push({ row: i + 2, errors: [`${month}: ${error.message}`] });
              } else {
                successCount++;
              }
            }
          }

          setResults({ success: successCount, failed: failedCount, errors: errorDetails });
          setStep(3);
          setProcessing(false);

          if (successCount > 0) {
            onImportComplete?.();
          }
        } catch (parseError) {
          console.error('Excel parsing error:', parseError);
          setResults({ success: 0, failed: 1, errors: [{ row: 0, errors: ['Failed to parse Excel file. Please check the file format.'] }] });
          setStep(3);
          setProcessing(false);
        }
      };

      reader.onerror = () => {
        setResults({ success: 0, failed: 1, errors: [{ row: 0, errors: ['Failed to read file'] }] });
        setStep(3);
        setProcessing(false);
      };

      reader.readAsBinaryString(file);
    } catch (error) {
      console.error('Import error:', error);
      setResults({ success: 0, failed: 1, errors: [{ row: 0, errors: [error.message] }] });
      setStep(3);
      setProcessing(false);
    }
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* STICKY HEADER */}
        <div className="p-6 border-b border-gray-100 shrink-0 bg-white rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Import Action Plans</h2>
                <p className="text-sm text-gray-500">Bulk upload from Excel file</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-5">
              {/* Year Selection */}
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
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
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedYear === year
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
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-800 mb-2">Step 1: Get the Template</p>
                <p className="text-sm text-blue-600 mb-3">
                  Download our Excel template with the correct headers and sample data.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Template (.xlsx)
                </button>
              </div>

              {/* Upload */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Step 2: Upload Your File</p>
                <div
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${dragActive ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
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
                    accept=".xlsx,.xls"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  {file ? (
                    <div>
                      <p className="text-sm text-teal-600 font-medium">{file.name}</p>
                      <p className="text-xs text-gray-500 mt-1">Will be imported as {selectedYear} data</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-600">Drag & drop your Excel file here</p>
                      <p className="text-xs text-gray-400 mt-1">or click to browse (.xlsx, .xls)</p>
                    </>
                  )}
                </div>
              </div>
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
              <div className={`rounded-lg p-4 ${results.success > 0 ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
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
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-40 overflow-y-auto">
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
            </div>
          )}
        </div>

        {/* STICKY FOOTER */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/80 rounded-b-2xl shrink-0">
          {step === 1 && (
            <button
              onClick={processImport}
              disabled={!file}
              className="w-full py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Import to {selectedYear}
            </button>
          )}
          {step === 3 && (
            <div className="flex gap-3">
              <button
                onClick={resetModal}
                className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
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
          )}
        </div>
      </div>
    </div>
  );
}
