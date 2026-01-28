import { useState, useEffect, useRef } from 'react';
import { Settings, Building2, Target, History, Plus, Pencil, Trash2, Save, X, Loader2, Upload, Download, User, UserPlus, Users, List, ToggleLeft, ToggleRight, ChevronUp, ChevronDown, Database, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import ImportModal from '../components/action-plan/ImportModal';
import { useToast } from '../components/common/Toast';
import ConfirmDialog from '../components/common/ConfirmDialog';

const TABS = [
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'targets', label: 'Company Targets', icon: Target },
  { id: 'historical', label: 'Historical Data', icon: History },
  { id: 'dropdowns', label: 'Dropdown Options', icon: List },
  { id: 'data', label: 'Data Management', icon: Database },
];

const YEARS_RANGE = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

export default function AdminSettings({ onNavigateToUsers }) {
  const [activeTab, setActiveTab] = useState('departments');
  
  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      {/* Header - Sticky with high z-index */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
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
        {activeTab === 'dropdowns' && <DropdownOptionsTab />}
        {activeTab === 'data' && <DataManagementTab />}
      </main>
    </div>
  );
}

// ==================== DEPARTMENTS TAB ====================
function DepartmentsTab({ onNavigateToUsers }) {
  const { toast } = useToast();
  const [departments, setDepartments] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCode, setEditingCode] = useState(null);
  const [editName, setEditName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

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
      toast({ title: 'Department Created', description: `${newName.trim()} has been added.`, variant: 'success' });
    } catch (error) {
      console.error('Save error:', error);
      toast({ title: 'Failed to Save', description: error.message || 'Unknown error', variant: 'error' });
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
      toast({ title: 'Department Updated', description: `${code} has been updated.`, variant: 'success' });
    } catch (error) {
      console.error('Update error:', error);
      toast({ title: 'Failed to Update', description: error.message || 'Unknown error', variant: 'error' });
    }
    setSaving(false);
  };

  const handleDelete = async (code) => {
    try {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('code', code);
      
      if (error) throw error;
      
      await fetchData();
      toast({ title: 'Department Deleted', description: `${code} has been removed.`, variant: 'success' });
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Failed to Delete', description: error.message || 'Unknown error', variant: 'error' });
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
                    <button onClick={() => setConfirmDelete(dept.code)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
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

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => handleDelete(confirmDelete)}
        title="Delete Department"
        message={`Delete department "${confirmDelete}"? This cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}

// ==================== TARGETS TAB ====================
function TargetsTab() {
  const { toast } = useToast();
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
    
    if (error) {
      toast({ title: 'Failed to Save', description: 'Could not save target', variant: 'error' });
    } else {
      toast({ title: 'Target Saved', description: `${year} target set to ${value}%`, variant: 'success' });
    }
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
  const { toast } = useToast();
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
      toast({ 
        title: 'Data Saved Successfully', 
        description: `Saved ${records.length} records for ${selectedYear}. Dashboard updated.`, 
        variant: 'success' 
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({ title: 'Failed to Save', description: error.message || 'Unknown error', variant: 'error' });
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
            toast({ title: 'Import Failed', description: 'No valid data found in CSV. Please check the format.', variant: 'warning' });
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
          let description = `Imported ${records.length} monthly records for ${importedCount} departments.`;
          if (skippedDepts.length > 0) {
            description += ` Skipped: ${[...new Set(skippedDepts)].join(', ')}`;
          }
          toast({ title: 'Import Successful', description, variant: 'success' });

          // Refresh grid if current year was imported
          if (importYears.includes(selectedYear)) {
            await fetchData();
          }

        } catch (error) {
          console.error('Import error:', error);
          toast({ title: 'Import Failed', description: error.message || 'Unknown error', variant: 'error' });
        }
        
        setImporting(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error('Parse error:', error);
        toast({ title: 'Parse Error', description: 'Failed to parse CSV file', variant: 'error' });
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

// ==================== DROPDOWN OPTIONS TAB ====================
const DROPDOWN_CATEGORIES = [
  { id: 'failure_reason', label: 'Failure Reasons', description: 'Options shown when marking a plan as "Not Achieved"' },
  { id: 'delete_reason', label: 'Deletion Reasons', description: 'Options shown when deleting/cancelling a plan' },
  { id: 'area_focus', label: 'Focus Areas', description: 'Area of focus for action plans (e.g., Workforce Optimization)' },
  { id: 'category', label: 'Categories', description: 'Priority/category classification for action plans' },
  { id: 'goal', label: 'Strategic Goals / Initiatives', description: 'Pre-defined goals and strategies for quick selection in forms' },
  { id: 'action_plan', label: 'Action Plan Templates', description: 'Standard action plan templates for common tasks' },
];

function DropdownOptionsTab() {
  const { toast } = useToast();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newLabels, setNewLabels] = useState({}); // { category: 'new label' }
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [optionToDelete, setOptionToDelete] = useState(null); // { id, label, category }
  const [showArchived, setShowArchived] = useState(false); // Toggle for archived view

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    // Fetch ALL options (both active and inactive) for local filtering
    const { data, error } = await supabase
      .from('dropdown_options')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) {
      console.error('Error fetching dropdown options:', error);
    }
    setOptions(data || []);
    setLoading(false);
  };

  // Separate standard options from "Other" option (sorted by sort_order)
  // Now filters based on showArchived toggle
  const getStandardOptions = (category) => {
    return options
      .filter(opt => opt.category === category && opt.label !== 'Other' && opt.is_active === !showArchived)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  };

  // Get archived count for a category
  const getArchivedCount = (category) => {
    return options.filter(opt => opt.category === category && opt.label !== 'Other' && !opt.is_active).length;
  };

  // Get active count for a category
  const getActiveCount = (category) => {
    return options.filter(opt => opt.category === category && opt.label !== 'Other' && opt.is_active).length;
  };

  const getOtherOption = (category) => {
    return options.find(opt => opt.category === category && opt.label === 'Other');
  };

  const handleAddOption = async (category) => {
    const rawInput = newLabels[category]?.trim();
    if (!rawInput) return;
    
    // 1. SPLIT & CLEAN - Split by ';', trim whitespace, and remove empty strings
    const labelsToProcess = rawInput
      .split(';')
      .map(item => item.trim())
      .filter(item => item !== '' && item.toLowerCase() !== 'other'); // Also filter out "Other"

    if (labelsToProcess.length === 0) {
      toast({ title: 'Invalid Input', description: '"Other" is a system option. Use the toggle below to enable/disable it.', variant: 'warning' });
      return;
    }

    setSaving(true);
    
    let addedCount = 0;
    let restoredCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const addedLabels = [];
    const restoredLabels = [];

    // Get current max sort_order for this category
    const allCategoryOptions = options.filter(opt => opt.category === category && opt.label !== 'Other');
    let currentMaxSort = allCategoryOptions.length > 0 
      ? Math.max(...allCategoryOptions.map(o => o.sort_order || 0)) 
      : 0;

    // 2. PROCESS EACH LABEL
    for (const label of labelsToProcess) {
      try {
        // A. Check if option already exists (including inactive/soft-deleted ones)
        const { data: existing, error: checkError } = await supabase
          .from('dropdown_options')
          .select('*')
          .eq('category', category)
          .ilike('label', label) // Case-insensitive match
          .maybeSingle();

        if (checkError) throw checkError;

        if (existing) {
          if (existing.is_active) {
            // Already active - skip
            skippedCount++;
          } else {
            // B. Restore if inactive
            const { data: restored, error: updateError } = await supabase
              .from('dropdown_options')
              .update({ is_active: true })
              .eq('id', existing.id)
              .select()
              .single();

            if (updateError) throw updateError;

            // Update local state
            if (restored) {
              setOptions(prev => prev.map(item => 
                item.id === existing.id ? restored : item
              ));
            }
            restoredCount++;
            restoredLabels.push(label);
          }
        } else {
          // C. Insert new option
          currentMaxSort++;
          const { data, error } = await supabase
            .from('dropdown_options')
            .insert({ 
              category, 
              label, 
              sort_order: currentMaxSort,
              is_active: true 
            })
            .select()
            .single();

          if (error) throw error;

          // Update local state
          if (data) {
            setOptions(prev => [...prev, data]);
          }
          addedCount++;
          addedLabels.push(label);
        }
      } catch (err) {
        console.error(`Error processing "${label}":`, err);
        errorCount++;
      }
    }

    // 3. Clear input
    setNewLabels(prev => ({ ...prev, [category]: '' }));
    setSaving(false);

    // 4. FINAL SUMMARY TOAST
    if (errorCount > 0) {
      toast({ 
        title: 'Completed with Errors', 
        description: `Added: ${addedCount}, Restored: ${restoredCount}, Skipped: ${skippedCount}, Failed: ${errorCount}`, 
        variant: 'warning' 
      });
    } else if (addedCount === 0 && restoredCount === 0) {
      toast({ 
        title: 'No Changes', 
        description: `All ${skippedCount} option(s) already exist and are active.`, 
        variant: 'info' 
      });
    } else {
      const parts = [];
      if (addedCount > 0) parts.push(`Added ${addedCount}`);
      if (restoredCount > 0) parts.push(`Restored ${restoredCount}`);
      if (skippedCount > 0) parts.push(`Skipped ${skippedCount} existing`);
      
      toast({ 
        title: 'Success!', 
        description: parts.join(', '), 
        variant: 'success' 
      });
    }
  };

  const handleToggleActive = async (option) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('dropdown_options')
        .update({ is_active: !option.is_active })
        .eq('id', option.id);

      if (error) throw error;
      
      // Immediately update local state
      setOptions(prev => prev.map(item => 
        item.id === option.id ? { ...item, is_active: !item.is_active } : item
      ));
    } catch (error) {
      console.error('Toggle error:', error);
      toast({ title: 'Failed to Update', description: error.message || 'Unknown error', variant: 'error' });
    }
    setSaving(false);
  };

  // Restore an archived option (set is_active = true)
  const handleRestoreOption = async (option) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('dropdown_options')
        .update({ is_active: true })
        .eq('id', option.id);

      if (error) throw error;
      
      // Immediately update local state
      setOptions(prev => prev.map(item => 
        item.id === option.id ? { ...item, is_active: true } : item
      ));
      
      toast({ title: 'Option Restored', description: `"${option.label}" has been restored.`, variant: 'success' });
    } catch (error) {
      console.error('Restore error:', error);
      toast({ title: 'Failed to Restore', description: error.message || 'Unknown error', variant: 'error' });
    }
    setSaving(false);
  };

  const handleToggleOther = async (category) => {
    const otherOption = getOtherOption(category);
    
    setSaving(true);
    try {
      if (otherOption) {
        // Toggle existing "Other" option
        const { error } = await supabase
          .from('dropdown_options')
          .update({ is_active: !otherOption.is_active })
          .eq('id', otherOption.id);

        if (error) throw error;
        
        // Immediately update local state
        setOptions(prev => prev.map(item => 
          item.id === otherOption.id ? { ...item, is_active: !item.is_active } : item
        ));
      } else {
        // Create "Other" option if it doesn't exist
        const { data, error } = await supabase
          .from('dropdown_options')
          .insert({ 
            category, 
            label: 'Other', 
            sort_order: 99, // Always last
            is_active: true 
          })
          .select()
          .single();

        if (error) throw error;
        
        // Add new option to local state
        if (data) {
          setOptions(prev => [...prev, data]);
        }
      }
    } catch (error) {
      console.error('Toggle Other error:', error);
      toast({ title: 'Failed to Update', description: error.message || 'Unknown error', variant: 'error' });
    }
    setSaving(false);
  };

  const handleDelete = (option) => {
    setOptionToDelete(option);
    setIsDeleteModalOpen(true);
  };

  const handleMove = async (category, currentIndex, direction) => {
    const standardOptions = getStandardOptions(category);
    
    // Calculate target index
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    // Bounds check
    if (targetIndex < 0 || targetIndex >= standardOptions.length) return;
    
    const currentItem = standardOptions[currentIndex];
    const targetItem = standardOptions[targetIndex];
    
    // Swap sort_order values
    const currentSortOrder = currentItem.sort_order;
    const targetSortOrder = targetItem.sort_order;
    
    // Optimistic UI update - swap in local state immediately
    setOptions(prev => prev.map(item => {
      if (item.id === currentItem.id) {
        return { ...item, sort_order: targetSortOrder };
      }
      if (item.id === targetItem.id) {
        return { ...item, sort_order: currentSortOrder };
      }
      return item;
    }));
    
    // Persist to database
    try {
      const [result1, result2] = await Promise.all([
        supabase
          .from('dropdown_options')
          .update({ sort_order: targetSortOrder })
          .eq('id', currentItem.id),
        supabase
          .from('dropdown_options')
          .update({ sort_order: currentSortOrder })
          .eq('id', targetItem.id)
      ]);
      
      if (result1.error) throw result1.error;
      if (result2.error) throw result2.error;
    } catch (error) {
      console.error('Move error:', error);
      // Revert optimistic update on error
      setOptions(prev => prev.map(item => {
        if (item.id === currentItem.id) {
          return { ...item, sort_order: currentSortOrder };
        }
        if (item.id === targetItem.id) {
          return { ...item, sort_order: targetSortOrder };
        }
        return item;
      }));
      toast({ title: 'Failed to Reorder', description: error.message || 'Unknown error', variant: 'error' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!optionToDelete) return;

    setSaving(true);
    try {
      // Soft delete: set is_active to false instead of hard delete
      const { error } = await supabase
        .from('dropdown_options')
        .update({ is_active: false })
        .eq('id', optionToDelete.id);

      if (error) {
        console.error('Error deleting option:', error);
        toast({ title: 'Failed to Delete', description: 'Check console for details.', variant: 'error' });
        setSaving(false);
        return;
      }
      
      // Immediately update local state to reflect the deletion
      setOptions(prev => prev.filter(item => item.id !== optionToDelete.id));
      toast({ title: 'Option Deleted', description: `"${optionToDelete.label}" has been removed.`, variant: 'success' });
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Failed to Delete', description: error.message || 'Unknown error', variant: 'error' });
    }
    setSaving(false);
    setIsDeleteModalOpen(false);
    setOptionToDelete(null);
  };

  const handleCancelDelete = () => {
    setIsDeleteModalOpen(false);
    setOptionToDelete(null);
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Archive Toggle Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800">Dropdown Options Management</h3>
            <p className="text-sm text-gray-500 mt-1">
              {showArchived 
                ? 'Viewing archived options. Click "Restore" to reactivate.' 
                : 'Manage active dropdown options for forms.'}
            </p>
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              showArchived 
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {showArchived ? (
              <>
                <ToggleRight className="w-5 h-5" />
                Viewing Archived
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Show Archived
              </>
            )}
          </button>
        </div>
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {DROPDOWN_CATEGORIES.map((cat) => {
          const standardOptions = getStandardOptions(cat.id);
          const otherOption = getOtherOption(cat.id);
          const activeCount = getActiveCount(cat.id) + (otherOption?.is_active ? 1 : 0);
          const archivedCount = getArchivedCount(cat.id) + (otherOption && !otherOption.is_active ? 1 : 0);

          return (
            <div key={cat.id} className="bg-white rounded-xl shadow-sm border border-gray-100">
              {/* Header */}
              <div className={`p-4 border-b ${showArchived ? 'bg-amber-50 border-amber-100' : 'border-gray-100'}`}>
                <h3 className="font-semibold text-gray-800">{cat.label}</h3>
                <p className="text-sm text-gray-500 mt-1">{cat.description}</p>
                <div className="flex gap-3 mt-2 text-xs">
                  <span className={`${!showArchived ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                    {activeCount} active
                  </span>
                  {archivedCount > 0 && (
                    <span className={`${showArchived ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                      {archivedCount} archived
                    </span>
                  )}
                </div>
              </div>

              {/* Add New - Only show when NOT in archived view */}
              {!showArchived && (
                <div className="p-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newLabels[cat.id] || ''}
                      onChange={(e) => setNewLabels(prev => ({ ...prev, [cat.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddOption(cat.id)}
                      placeholder="Add option(s)... Use ; for bulk add"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <button
                      onClick={() => handleAddOption(cat.id)}
                      disabled={saving || !newLabels[cat.id]?.trim()}
                      className="px-4 py-2 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Options List */}
              <div className="divide-y divide-gray-100 max-h-[280px] overflow-y-auto">
                {standardOptions.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    {showArchived 
                      ? 'No archived options in this category.' 
                      : 'No custom options yet. Add one above.'}
                  </div>
                ) : (
                  standardOptions.map((option, index) => (
                    <div 
                      key={option.id} 
                      className={`p-3 flex items-center gap-2 hover:bg-gray-50 ${showArchived ? 'bg-amber-50/50' : ''}`}
                    >
                      {/* Label */}
                      <span className={`flex-1 text-sm ${showArchived ? 'text-gray-500' : 'text-gray-800'}`}>
                        {option.label}
                      </span>

                      {showArchived ? (
                        /* Restore Button - Show in archived view */
                        <button
                          onClick={() => handleRestoreOption(option)}
                          disabled={saving}
                          className="px-3 py-1.5 text-sm font-medium text-teal-600 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors flex items-center gap-1"
                          title="Restore this option"
                        >
                          <ToggleRight className="w-4 h-4" />
                          Restore
                        </button>
                      ) : (
                        <>
                          {/* Reorder Buttons */}
                          <div className="flex flex-col">
                            <button
                              onClick={() => handleMove(cat.id, index, 'up')}
                              disabled={saving || index === 0}
                              className="p-0.5 text-gray-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleMove(cat.id, index, 'down')}
                              disabled={saving || index === standardOptions.length - 1}
                              className="p-0.5 text-gray-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Move down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Archive/Delete Button */}
                          <button
                            onClick={() => handleDelete(option)}
                            disabled={saving}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Archive option"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* System Option: "Other" Toggle - Only show when NOT in archived view */}
              {!showArchived && (
                <div className="p-4 bg-slate-50 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Allow Custom Input</span>
                        <span className="text-xs px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">System</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        When enabled, users can select "Other" and type a custom reason.
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleOther(cat.id)}
                      disabled={saving}
                      className={`p-1 rounded-lg transition-colors ${
                        otherOption?.is_active 
                          ? 'text-teal-600 hover:bg-teal-50' 
                          : 'text-gray-400 hover:bg-gray-100'
                      }`}
                      title={otherOption?.is_active ? 'Click to disable "Other" option' : 'Click to enable "Other" option'}
                    >
                      {otherOption?.is_active ? (
                        <ToggleRight className="w-8 h-8" />
                      ) : (
                        <ToggleLeft className="w-8 h-8" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && optionToDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Archive Option?</h3>
            <p className="text-gray-600 text-sm mb-4">
              Are you sure you want to archive <span className="font-semibold text-gray-800">"{optionToDelete.label}"</span>? 
            </p>
            <p className="text-xs text-teal-600 bg-teal-50 px-3 py-2 rounded-lg mb-4">
              💡 You can restore this option later from the "Show Archived" view.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
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


// ==================== DATA MANAGEMENT TAB ====================
function DataManagementTab() {
  const { toast } = useToast();
  const [showImportModal, setShowImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    const { data, error } = await supabase
      .from('action_plans')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    
    if (error) console.error('Error fetching plans:', error);
    setPlans(data || []);
    setLoading(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportData = plans.map((plan) => ({
        'Year': plan.year,
        'Department': plan.department_code,
        'Month': plan.month,
        'Category': plan.category || '',
        'Focus Area': plan.area_focus || '',
        'Goal/Strategy': plan.goal_strategy,
        'Action Plan': plan.action_plan,
        'Indicator': plan.indicator,
        'PIC': plan.pic,
        'Evidence': plan.evidence || '',
        'Status': plan.status,
        'Root Cause Category': plan.status === 'Not Achieved' 
          ? (plan.gap_category === 'Other' && plan.specify_reason 
              ? `Other: ${plan.specify_reason}` 
              : (plan.gap_category || '-'))
          : '-',
        'Failure Details': plan.status === 'Not Achieved' ? (plan.gap_analysis || '-') : '-',
        'Score': plan.score || '',
        'Proof of Evidence': plan.outcome_link || '',
        'Remarks': plan.remark || '',
        'Created At': plan.created_at,
      }));
      
      // Create worksheet and workbook
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Action Plans');
      
      // Set column widths
      ws['!cols'] = [
        { wch: 8 },  // Year
        { wch: 12 }, // Department
        { wch: 8 },  // Month
        { wch: 12 }, // Category
        { wch: 25 }, // Focus Area
        { wch: 30 }, // Goal/Strategy
        { wch: 35 }, // Action Plan
        { wch: 25 }, // Indicator
        { wch: 15 }, // PIC
        { wch: 25 }, // Evidence
        { wch: 12 }, // Status
        { wch: 20 }, // Root Cause Category
        { wch: 35 }, // Failure Details
        { wch: 8 },  // Score
        { wch: 35 }, // Proof of Evidence
        { wch: 30 }, // Remarks
        { wch: 20 }, // Created At
      ];
      
      // Download
      XLSX.writeFile(wb, `action_plans_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast({ title: 'Export Complete', description: `Exported ${exportData.length} records.`, variant: 'success' });
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Export Failed', description: 'Failed to export data.', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Export Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-50 rounded-lg">
            <Download className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800">Export Data</h3>
            <p className="text-sm text-gray-500 mt-1">
              Download all action plan records ({plans.length} total) in Excel (.xlsx) format for backup or external analysis.
            </p>
            <button
              onClick={handleExport}
              disabled={exporting || plans.length === 0}
              className="mt-4 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Download Excel'}
            </button>
          </div>
        </div>
      </div>

      {/* Import Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-teal-50 rounded-lg">
            <Upload className="w-6 h-6 text-teal-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800">Import Action Plans</h3>
            <p className="text-sm text-gray-500 mt-1">
              Bulk upload action plans using an Excel file (.xlsx). Please ensure your file follows the standard template.
            </p>
            
            {/* Warning Box */}
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-700">
                <strong>Warning:</strong> Importing data may add new records to the database. Please double-check your file before uploading.
              </p>
            </div>
            
            {/* Upload Button */}
            <div className="mt-4">
              <button
                onClick={() => setShowImportModal(true)}
                className="px-4 py-2 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 flex items-center gap-2 transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Select Excel File
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={fetchPlans}
      />
    </div>
  );
}
