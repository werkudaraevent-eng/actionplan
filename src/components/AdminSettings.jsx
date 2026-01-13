import { useState, useEffect, useRef } from 'react';
import { Settings, Building2, Target, History, Plus, Pencil, Trash2, Save, X, Loader2, Upload, Download, User, UserPlus, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Papa from 'papaparse';

const TABS = [
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'targets', label: 'Company Targets', icon: Target },
  { id: 'historical', label: 'Historical Data', icon: History },
];

const YEARS_RANGE = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

export default function AdminSettings({ onNavigateToUsers }) {
  const [activeTab, setActiveTab] = useState('departments');
  
  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Admin Settings</h1>
            <p className="text-gray-500 text-sm">Manage system configuration and master data</p>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="flex border-b border-gray-100">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-teal-600 text-teal-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'departments' && <DepartmentsTab onNavigateToUsers={onNavigateToUsers} />}
        {activeTab === 'targets' && <TargetsTab />}
        {activeTab === 'historical' && <HistoricalTab />}
      </main>
    </div>
  );
}

// ==================== DEPARTMENTS TAB ====================
function DepartmentsTab({ onNavigateToUsers }) {
  const [departments, setDepartments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCode, setEditingCode] = useState(null);
  const [editName, setEditName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Fetch departments and profiles in parallel
    const [deptResult, profileResult] = await Promise.all([
      supabase.from('departments').select('*').order('code'),
      supabase.from('profiles').select('id, full_name, role, department_code')
    ]);
    
    if (deptResult.error) console.error('Error fetching departments:', deptResult.error);
    if (profileResult.error) console.error('Error fetching profiles:', profileResult.error);
    
    setDepartments(deptResult.data || []);
    setProfiles(profileResult.data || []);
    setLoading(false);
  };

  // Get leader for a department
  const getLeader = (deptCode) => {
    return profiles.find(p => p.department_code === deptCode && p.role === 'leader');
  };

  // Get headcount for a department
  const getHeadcount = (deptCode) => {
    return profiles.filter(p => p.department_code === deptCode).length;
  };

  const handleSaveNew = async () => {
    if (!newCode.trim() || !newName.trim()) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('departments')
        .insert({ code: newCode.toUpperCase().trim(), name: newName.trim() });
      
      if (error) throw error;
      
      await fetchData();
      setIsAdding(false);
      setNewCode('');
      setNewName('');
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save department: ' + (error.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const handleSaveEdit = async (code) => {
    if (!editName.trim()) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('departments')
        .update({ name: editName.trim() })
        .eq('code', code);
      
      if (error) throw error;
      
      await fetchData();
      setEditingCode(null);
      setEditName('');
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update department: ' + (error.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const handleDelete = async (code) => {
    if (!confirm(`Delete department "${code}"? This cannot be undone.`)) return;
    
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('code', code);
      
      if (error) throw error;
      
      await fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete department: ' + (error.message || 'Unknown error'));
    }
  };

  const startEdit = (dept) => {
    setEditingCode(dept.code);
    setEditName(dept.name);
    setIsAdding(false);
  };

  const startAdd = () => {
    setIsAdding(true);
    setEditingCode(null);
    setNewCode('');
    setNewName('');
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setEditName('');
    setIsAdding(false);
    setNewCode('');
    setNewName('');
  };

  if (loading) return <LoadingState />;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Department Management</h2>
        <button
          onClick={startAdd}
          disabled={isAdding}
          className="flex items-center gap-2 px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> Add Department
        </button>
      </div>

      {/* Table Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-12 gap-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <div className="col-span-2">Code</div>
        <div className="col-span-3">Department Name</div>
        <div className="col-span-3">Leader</div>
        <div className="col-span-2">Headcount</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      <div className="divide-y divide-gray-100">
        {/* Add New Row */}
        {isAdding && (
          <div key="add-new-row" className="p-4 bg-teal-50 grid grid-cols-12 gap-4 items-center">
            <div className="col-span-2">
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Code"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                maxLength={10}
              />
            </div>
            <div className="col-span-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Department Name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="col-span-3 text-gray-400 text-sm italic">—</div>
            <div className="col-span-2 text-gray-400 text-sm italic">—</div>
            <div className="col-span-2 flex justify-end gap-2">
              <button onClick={handleSaveNew} disabled={saving} className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </button>
              <button onClick={cancelEdit} className="p-2 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Department List */}
        {departments.map((dept) => {
          const leader = getLeader(dept.code);
          const headcount = getHeadcount(dept.code);
          
          return (
            <div key={dept.code} className="p-4 grid grid-cols-12 gap-4 items-center hover:bg-gray-50/50">
              {editingCode === dept.code ? (
                <>
                  <div className="col-span-2">
                    <span className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-mono block">{dept.code}</span>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="col-span-3 text-gray-400 text-sm">—</div>
                  <div className="col-span-2 text-gray-400 text-sm">—</div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <button onClick={() => handleSaveEdit(dept.code)} disabled={saving} className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </button>
                    <button onClick={cancelEdit} className="p-2 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-2">
                    <span className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg text-sm font-mono font-semibold inline-block">
                      {dept.code}
                    </span>
                  </div>
                  <div className="col-span-3 text-gray-800 font-medium">{dept.name}</div>
                  <div className="col-span-3">
                    {leader ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-sm">
                        <User className="w-3.5 h-3.5" />
                        {leader.full_name}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-sm font-medium">
                        <UserPlus className="w-3.5 h-3.5" />
                        VACANT
                      </span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <button
                      onClick={() => onNavigateToUsers && onNavigateToUsers(dept.code)}
                      disabled={headcount === 0}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm transition-colors ${
                        headcount === 0 
                          ? 'bg-gray-100 text-gray-500 cursor-not-allowed' 
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer'
                      }`}
                      title={headcount > 0 ? `View ${headcount} team members` : 'No users in this department'}
                    >
                      <Users className="w-3.5 h-3.5" />
                      {headcount} {headcount === 1 ? 'User' : 'Users'}
                    </button>
                  </div>
                  <div className="col-span-2 flex justify-end gap-2">
                    <button onClick={() => startEdit(dept)} className="p-2 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(dept.code)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {departments.length === 0 && !isAdding && (
          <div key="empty-state" className="p-8 text-center text-gray-500">No departments found. Add one to get started.</div>
        )}
      </div>
    </div>
  );
}

// ==================== TARGETS TAB ====================
function TargetsTab() {
  const [targets, setTargets] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    fetchTargets();
  }, []);

  const fetchTargets = async () => {
    const { data, error } = await supabase.from('annual_targets').select('*');
    if (!error && data) {
      const map = {};
      data.forEach((t) => (map[t.year] = t.target_percentage));
      setTargets(map);
    }
    setLoading(false);
  };

  const handleChange = (year, value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0 || num > 100) return;
    setTargets({ ...targets, [year]: num });
  };

  const handleSave = async (year) => {
    setSaving(year);
    const value = targets[year] ?? 80;
    
    const { error } = await supabase
      .from('annual_targets')
      .upsert({ year, target_percentage: value }, { onConflict: 'year' });
    
    if (error) alert('Failed to save target');
    setSaving(null);
  };

  if (loading) return <LoadingState />;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Company Annual Targets</h2>
        <p className="text-sm text-gray-500 mt-1">Set the global completion target percentage for each fiscal year</p>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {YEARS_RANGE.map((year) => (
            <div key={year} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <div className="text-lg font-bold text-gray-800 mb-3">{year}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={targets[year] ?? ''}
                  onChange={(e) => handleChange(year, e.target.value)}
                  placeholder="80"
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold"
                />
                <span className="text-gray-500">%</span>
                <button
                  onClick={() => handleSave(year)}
                  disabled={saving === year}
                  className="ml-auto p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving === year ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== HISTORICAL TAB ====================
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CSV_MONTH_HEADERS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function HistoricalTab() {
  const [departments, setDepartments] = useState([]);
  const [gridData, setGridData] = useState({}); // { "DEPT_CODE": { 1: 80, 2: 75, ... } }
  const [quickFill, setQuickFill] = useState({}); // { "DEPT_CODE": "80" }
  const [selectedYear, setSelectedYear] = useState(2023);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch departments
    const { data: depts } = await supabase.from('departments').select('*').order('code');
    setDepartments(depts || []);

    // Fetch historical stats for selected year
    const { data: stats } = await supabase
      .from('historical_stats')
      .select('*')
      .eq('year', selectedYear);
    
    // Build grid data structure
    const grid = {};
    (depts || []).forEach(dept => {
      grid[dept.code] = {};
      for (let m = 1; m <= 12; m++) {
        grid[dept.code][m] = '';
      }
    });
    
    // Populate with existing data
    (stats || []).forEach(s => {
      if (grid[s.department_code]) {
        grid[s.department_code][s.month] = s.completion_rate;
      }
    });
    
    setGridData(grid);
    setQuickFill({});
    setHasChanges(false);
    setLoading(false);
  };

  const handleCellChange = (deptCode, month, value) => {
    const num = parseFloat(value);
    if (value !== '' && (isNaN(num) || num < 0 || num > 100)) return;
    
    setGridData(prev => ({
      ...prev,
      [deptCode]: {
        ...prev[deptCode],
        [month]: value === '' ? '' : num
      }
    }));
    setHasChanges(true);
  };

  const handleQuickFill = (deptCode) => {
    const value = parseFloat(quickFill[deptCode]);
    if (isNaN(value) || value < 0 || value > 100) return;
    
    const newRow = {};
    for (let m = 1; m <= 12; m++) {
      newRow[m] = value;
    }
    
    setGridData(prev => ({
      ...prev,
      [deptCode]: newRow
    }));
    setQuickFill(prev => ({ ...prev, [deptCode]: '' }));
    setHasChanges(true);
  };

  const calculateAverage = (deptCode) => {
    const row = gridData[deptCode];
    if (!row) return null;
    
    const values = Object.values(row).filter(v => v !== '' && v !== null && v !== undefined);
    if (values.length === 0) return null;
    
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    return avg.toFixed(1);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    
    try {
      // Collect all non-empty values for upsert
      const records = [];
      
      Object.entries(gridData).forEach(([deptCode, months]) => {
        Object.entries(months).forEach(([month, value]) => {
          if (value !== '' && value !== null && value !== undefined) {
            records.push({
              department_code: deptCode,
              year: selectedYear,
              month: parseInt(month, 10),
              completion_rate: parseFloat(value)
            });
          }
        });
      });

      // Delete existing records for this year first (to handle cleared cells)
      await supabase
        .from('historical_stats')
        .delete()
        .eq('year', selectedYear);

      // Insert all records
      if (records.length > 0) {
        const { error } = await supabase
          .from('historical_stats')
          .insert(records);
        
        if (error) throw error;
      }

      setHasChanges(false);
      alert(`Saved ${records.length} records for ${selectedYear}`);
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save: ' + (error.message || 'Unknown error'));
    }
    
    setSaving(false);
  };

  // Download CSV template
  const handleDownloadTemplate = () => {
    const headers = ['department_code', 'year', ...CSV_MONTH_HEADERS];
    const rows = departments.map(dept => {
      const row = [dept.code, selectedYear];
      for (let m = 1; m <= 12; m++) {
        const value = gridData[dept.code]?.[m];
        row.push(value !== '' && value !== null && value !== undefined ? value : '');
      }
      return row;
    });
    
    const csv = Papa.unparse({ fields: headers, data: rows });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `historical_data_template_${selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // Handle CSV import
  const handleImportCSV = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const validDeptCodes = new Set(departments.map(d => d.code));
          const records = [];
          const skippedDepts = [];
          let importedCount = 0;

          results.data.forEach((row) => {
            const deptCode = (row.department_code || '').trim().toUpperCase();
            const year = parseInt(row.year, 10);
            
            // Validate department exists
            if (!validDeptCodes.has(deptCode)) {
              if (deptCode) skippedDepts.push(deptCode);
              return;
            }

            // Validate year
            if (isNaN(year) || year < 2000 || year > 2100) return;

            // Process each month column
            CSV_MONTH_HEADERS.forEach((monthKey, idx) => {
              const monthNum = idx + 1;
              const value = parseFloat(row[monthKey]);
              
              if (!isNaN(value) && value >= 0 && value <= 100) {
                records.push({
                  department_code: deptCode,
                  year: year,
                  month: monthNum,
                  completion_rate: value
                });
              }
            });

            importedCount++;
          });

          if (records.length === 0) {
            alert('No valid data found in CSV. Please check the format.');
            setImporting(false);
            return;
          }

          // Get unique years from import
          const importYears = [...new Set(records.map(r => r.year))];

          // Delete existing records for imported years
          for (const year of importYears) {
            await supabase
              .from('historical_stats')
              .delete()
              .eq('year', year);
          }

          // Bulk insert
          const { error } = await supabase
            .from('historical_stats')
            .insert(records);

          if (error) throw error;

          // Show success message
          let message = `Successfully imported ${records.length} monthly records for ${importedCount} departments.`;
          if (skippedDepts.length > 0) {
            message += `\n\nSkipped unknown departments: ${[...new Set(skippedDepts)].join(', ')}`;
          }
          alert(message);

          // Refresh grid if current year was imported
          if (importYears.includes(selectedYear)) {
            await fetchData();
          }

        } catch (error) {
          console.error('Import error:', error);
          alert('Failed to import: ' + (error.message || 'Unknown error'));
        }
        
        setImporting(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error('Parse error:', error);
        alert('Failed to parse CSV file');
        setImporting(false);
      }
    });
  };

  if (loading) return <LoadingState />;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-gray-800">Historical Data Entry (Monthly)</h2>
            <p className="text-sm text-gray-500 mt-1">Enter monthly completion rates for years without real data</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="px-4 py-2 border border-gray-300 rounded-lg font-semibold"
            >
              {YEARS_RANGE.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <button
              onClick={handleSaveAll}
              disabled={saving || !hasChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                hasChanges 
                  ? 'bg-teal-600 text-white hover:bg-teal-700' 
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
        
        {/* Import/Export buttons */}
        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500">Bulk Actions:</span>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-3.5 h-3.5" />
            Download Template
          </button>
          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-teal-600 text-teal-600 rounded-lg hover:bg-teal-50 cursor-pointer">
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {importing ? 'Importing...' : 'Import CSV'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImportCSV}
              className="hidden"
              disabled={importing}
            />
          </label>
          <span className="text-xs text-gray-400 ml-2">
            CSV format: department_code, year, jan, feb, mar, ... dec
          </span>
        </div>
      </div>

      {/* Matrix Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 sticky left-0 bg-gray-50 min-w-[140px]">Department</th>
              {MONTHS.map((month, idx) => (
                <th key={month} className="px-2 py-3 font-medium text-gray-600 text-center min-w-[60px]">{month}</th>
              ))}
              <th className="px-3 py-3 font-semibold text-gray-700 text-center min-w-[70px] bg-gray-100">Avg</th>
              <th className="px-3 py-3 font-medium text-gray-600 text-center min-w-[120px]">Quick Fill</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {departments.map((dept) => {
              const avg = calculateAverage(dept.code);
              return (
                <tr key={dept.code} className="hover:bg-gray-50/50">
                  <td className="px-4 py-2 sticky left-0 bg-white">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-mono font-semibold">
                        {dept.code}
                      </span>
                      <span className="text-gray-600 text-xs truncate max-w-[80px]" title={dept.name}>
                        {dept.name.split(' ')[0]}
                      </span>
                    </div>
                  </td>
                  {MONTHS.map((_, idx) => {
                    const month = idx + 1;
                    const value = gridData[dept.code]?.[month] ?? '';
                    return (
                      <td key={month} className="px-1 py-1">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={value}
                          onChange={(e) => handleCellChange(dept.code, month, e.target.value)}
                          placeholder="—"
                          className="w-full px-1 py-1.5 border border-gray-200 rounded text-center text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center bg-gray-50">
                    <span className={`font-semibold text-sm ${
                      avg === null ? 'text-gray-300' :
                      parseFloat(avg) >= 90 ? 'text-green-600' :
                      parseFloat(avg) >= 70 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {avg !== null ? `${avg}%` : '—'}
                    </span>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={quickFill[dept.code] || ''}
                        onChange={(e) => setQuickFill(prev => ({ ...prev, [dept.code]: e.target.value }))}
                        placeholder="All"
                        className="w-14 px-1 py-1.5 border border-gray-200 rounded text-center text-xs"
                      />
                      <button
                        onClick={() => handleQuickFill(dept.code)}
                        disabled={!quickFill[dept.code]}
                        className="px-2 py-1.5 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 disabled:opacity-30"
                        title="Fill all months with this value"
                      >
                        Fill
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {departments.length === 0 && (
        <div className="p-8 text-center text-gray-500">No departments found. Add departments first.</div>
      )}

      {/* Unsaved changes indicator */}
      {hasChanges && (
        <div className="p-3 bg-amber-50 border-t border-amber-200 text-center text-sm text-amber-700">
          ⚠️ You have unsaved changes. Click "Save Changes" to persist your data.
        </div>
      )}
    </div>
  );
}

// Loading State Component
function LoadingState() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="flex items-center justify-center gap-3 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading...
      </div>
    </div>
  );
}
