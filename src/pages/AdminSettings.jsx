import { useState, useEffect, useRef } from 'react';
import { Settings, Building2, Target, History, Plus, Pencil, Trash2, Save, X, Loader2, Upload, Download, User, UserPlus, Users, List, ToggleLeft, ToggleRight, ChevronUp, ChevronDown, Database, AlertTriangle, FileSpreadsheet, Shield, ShieldAlert, Lock, Calendar, RefreshCw, Mail, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import ImportModal from '../components/action-plan/ImportModal';
import BulkUpdateModal from '../components/action-plan/BulkUpdateModal';
import { useToast } from '../components/common/Toast';
import ConfirmDialog from '../components/common/ConfirmDialog';
import EmailSettingsSection from '../components/settings/EmailSettingsSection';
import OptionManager from '../components/settings/OptionManager';

const TABS = [
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'targets', label: 'Company Targets', icon: Target },
  { id: 'historical', label: 'Historical Data', icon: History },
  { id: 'dropdowns', label: 'Dropdown Options', icon: List },
  { id: 'data', label: 'Data Management', icon: Database },
  { id: 'system', label: 'System', icon: Shield },
  { id: 'email', label: 'Email & Notifications', icon: Mail },
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
          <div className="flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-gray-100 scrollbar-thin pb-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-shrink-0 whitespace-nowrap flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id
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
        {activeTab === 'system' && <SystemSettingsTab />}
        {activeTab === 'email' && <EmailSettingsSection />}
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
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm transition-colors ${headcount === 0
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
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${hasChanges
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
                    <span className={`font-semibold text-sm ${avg === null ? 'text-gray-300' :
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
          You have unsaved changes. Click "Save Changes" to persist your data.
        </div>
      )}
    </div>
  );
}

// ==================== DROPDOWN OPTIONS TAB ====================
const ALL_DROPDOWN_SECTIONS = [
  // System Master Data (master_options table)
  { id: 'DEPARTMENT', label: 'Departments / Divisions', description: 'Company units (BAS, SALES, IT, etc.)', source: 'master', showValue: true },
  { id: 'ROOT_CAUSE', label: 'Root Cause Categories', description: 'For Ishikawa/Fishbone analysis (Manpower, Method, etc.)', source: 'master', showValue: true },
  { id: 'AREA_OF_FOCUS', label: 'Area of Focus', description: 'Strategic focus areas (Cost Reduction, Innovation, etc.)', source: 'master', showValue: false },
  // Form Dropdown Options (dropdown_options table)
  { id: 'category', label: 'Priority Levels', description: 'Priority classification used in action plan forms (UH, H, M, L)', source: 'dropdown' },
  { id: 'goal', label: 'Strategic Goals / Initiatives', description: 'Pre-defined goals and strategies for quick selection', source: 'dropdown', hideCustomToggle: true, customToggleNote: 'Custom input is always enabled for Strategies via the form.' },
  { id: 'action_plan', label: 'Action Plan Templates', description: 'Standard action plan templates for common tasks', source: 'dropdown' },
  { id: 'failure_reason', label: 'Failure Reasons', description: 'Options shown when marking a plan as "Not Achieved"', source: 'dropdown' },
  { id: 'delete_reason', label: 'Deletion Reasons', description: 'Options shown when deleting/cancelling a plan', source: 'dropdown' },
];

function DropdownOptionsTab() {
  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-semibold text-gray-800">Dropdown Options Management</h3>
        <p className="text-sm text-gray-500 mt-1">
          Manage all system dropdowns and form options from a single control center.
          Each card supports adding, editing, reordering, archiving, and Excel import/export.
        </p>
      </div>

      {/* THE UNIFIED GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {ALL_DROPDOWN_SECTIONS.map((section) => (
          <OptionManager
            key={section.id}
            title={section.label}
            categoryKey={section.id}
            description={section.description}
            showValue={section.showValue ?? false}
            source={section.source}
            hideCustomToggle={section.hideCustomToggle ?? false}
            customToggleNote={section.customToggleNote ?? ''}
          />
        ))}
      </div>
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
  const [showBulkUpdateModal, setShowBulkUpdateModal] = useState(false);
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
        'Reason for Non-Achievement': plan.status === 'Not Achieved'
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
        { wch: 20 }, // Reason for Non-Achievement
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

  // Export IDs template for bulk update
  const handleExportForBulkUpdate = () => {
    try {
      const exportData = plans.map(plan => ({
        id: plan.id,
        action_plan: plan.action_plan || '',
        indicator: plan.indicator || '',  // Added for context
        department_code: plan.department_code || '',
        month: plan.month || '',
        // Empty columns as hints for what can be updated
        evidence: '',
        outcome_link: '',
        remark: '',
        status: '',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Bulk Update Template');

      ws['!cols'] = [
        { wch: 40 }, // id (UUID)
        { wch: 40 }, // action_plan
        { wch: 35 }, // indicator
        { wch: 12 }, // department_code
        { wch: 8 },  // month
        { wch: 30 }, // evidence
        { wch: 40 }, // outcome_link
        { wch: 30 }, // remark
        { wch: 15 }, // status
      ];

      const timestamp = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `Bulk_Update_Template_${timestamp}.xlsx`);

      toast({
        title: 'Template Downloaded',
        description: 'Fill in the columns you want to update, then upload using Step 2.',
        variant: 'success'
      });
    } catch (error) {
      console.error('Export template failed:', error);
      toast({ title: 'Export Failed', description: 'Failed to create template.', variant: 'error' });
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

      {/* Universal Bulk Update Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-200">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-50 rounded-lg">
            <RefreshCw className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800">Universal Bulk Update</h3>
            <p className="text-sm text-gray-500 mt-1">
              Update specific columns (e.g., evidence, outcome_link, remark) for existing action plans using an Excel file.
            </p>

            {/* Info Box */}
            <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs text-purple-700">
                <strong>How it works:</strong> Your Excel file must have an <code className="bg-purple-100 px-1 rounded">id</code> column (UUID).
                Any other column names will be matched to database columns and updated.
              </p>
            </div>

            {/* Two-Step Process */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Step 1: Export Template */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-semibold text-gray-700 mb-2">ðŸ“„ Step 1: Get Template</p>
                <p className="text-xs text-gray-500 mb-3">
                  Download a template with IDs and reference columns. Add your update columns.
                </p>
                <button
                  onClick={handleExportForBulkUpdate}
                  disabled={plans.length === 0}
                  className="w-full px-4 py-2 border border-purple-400 text-purple-600 font-medium rounded-lg hover:bg-purple-50 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Export IDs Template
                </button>
              </div>

              {/* Step 2: Upload Update File */}
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-semibold text-gray-700 mb-2">ðŸ“¤ Step 2: Upload Updates</p>
                <p className="text-xs text-gray-500 mb-3">
                  Upload your filled Excel file to update matching records.
                </p>
                <button
                  onClick={() => setShowBulkUpdateModal(true)}
                  className="w-full px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Upload Update File
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Update Modal */}
      <BulkUpdateModal
        isOpen={showBulkUpdateModal}
        onClose={() => setShowBulkUpdateModal(false)}
        onUpdateComplete={fetchPlans}
      />
    </div>
  );
}


// ==================== SYSTEM SETTINGS TAB ====================
function SystemSettingsTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState({
    is_lock_enabled: true,
    lock_cutoff_day: 6
  });
  const [schedules, setSchedules] = useState([]); // Monthly schedules from DB
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMonth, setSavingMonth] = useState(null); // month_index being saved
  const [editingMonth, setEditingMonth] = useState(null); // month_index being edited
  const [editDate, setEditDate] = useState('');
  const [showInfoDetails, setShowInfoDetails] = useState(false);

  // Carry-over penalty settings
  const [penaltySettings, setPenaltySettings] = useState({ carry_over_penalty_1: 80, carry_over_penalty_2: 50 });
  const [savingPenalties, setSavingPenalties] = useState(false);

  // Grading strategy settings (granular per-priority thresholds)
  const [gradingSettings, setGradingSettings] = useState({
    is_strict_grading_enabled: false,
    threshold_uh: 100, threshold_h: 100, threshold_m: 80, threshold_l: 70
  });
  const [savingGrading, setSavingGrading] = useState(false);

  // Drop approval policy settings (per-priority)
  const [dropPolicy, setDropPolicy] = useState({
    drop_approval_req_uh: false,
    drop_approval_req_h: false,
    drop_approval_req_m: false,
    drop_approval_req_l: false,
  });
  const [savingDropPolicy, setSavingDropPolicy] = useState(null); // which key is being saved

  const LOCK_YEARS_RANGE = [2025, 2026, 2027, 2028, 2029, 2030];
  const LOCK_MONTHS = Array.from({ length: 12 }, (_, i) => ({
    index: i,
    name: ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'][i]
  }));

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (!loading) fetchSchedules();
  }, [selectedYear, loading]);

  const fetchSettings = async () => {
    try {
      const [settingsResult, penaltyResult] = await Promise.all([
        supabase.from('system_settings').select('*').eq('id', 1).single(),
        supabase.rpc('get_carry_over_settings')
      ]);

      if (settingsResult.error) throw settingsResult.error;
      if (settingsResult.data) {
        setSettings({
          is_lock_enabled: settingsResult.data.is_lock_enabled,
          lock_cutoff_day: settingsResult.data.lock_cutoff_day
        });
        // Load grading settings from the same row
        setGradingSettings({
          is_strict_grading_enabled: settingsResult.data.is_strict_grading_enabled ?? false,
          threshold_uh: settingsResult.data.threshold_uh ?? 100,
          threshold_h: settingsResult.data.threshold_h ?? 100,
          threshold_m: settingsResult.data.threshold_m ?? 80,
          threshold_l: settingsResult.data.threshold_l ?? 70,
        });
        // Load drop approval policy from the same row
        setDropPolicy({
          drop_approval_req_uh: settingsResult.data.drop_approval_req_uh ?? false,
          drop_approval_req_h: settingsResult.data.drop_approval_req_h ?? false,
          drop_approval_req_m: settingsResult.data.drop_approval_req_m ?? false,
          drop_approval_req_l: settingsResult.data.drop_approval_req_l ?? false,
        });
      }

      if (!penaltyResult.error && penaltyResult.data) {
        setPenaltySettings({
          carry_over_penalty_1: penaltyResult.data.carry_over_penalty_1 ?? 80,
          carry_over_penalty_2: penaltyResult.data.carry_over_penalty_2 ?? 50
        });
      }
    } catch (error) {
      console.error('Error fetching system settings:', error);
      toast({ title: 'Error', description: 'Failed to load system settings.', variant: 'error' });
    }
    setLoading(false);
  };

  const handleToggleLock = async () => {
    setSaving(true);
    const newValue = !settings.is_lock_enabled;

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ is_lock_enabled: newValue })
        .eq('id', 1);

      if (error) throw error;

      setSettings(prev => ({ ...prev, is_lock_enabled: newValue }));
      toast({
        title: 'Settings Updated',
        description: `Auto-lock has been ${newValue ? 'enabled' : 'disabled'}.`,
        variant: 'success'
      });
    } catch (error) {
      console.error('Error updating lock setting:', error);
      toast({ title: 'Error', description: 'Failed to update setting.', variant: 'error' });
    }
    setSaving(false);
  };

  const handleCutoffDayChange = (value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1 || num > 28) return;
    setSettings(prev => ({ ...prev, lock_cutoff_day: num }));
  };

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('monthly_lock_schedules')
        .select('*')
        .eq('year', selectedYear);

      if (error) throw error;
      setSchedules(data || []);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  // Get schedule for a specific month
  const getSchedule = (monthIndex) => {
    return schedules.find(s => s.month_index === monthIndex);
  };

  // Calculate default deadline for a month
  const getDefaultDeadline = (monthIndex) => {
    const day = Math.max(1, Math.min(28, settings.lock_cutoff_day || 6));
    const nextMonth = monthIndex + 1;
    const deadlineYear = nextMonth > 11 ? selectedYear + 1 : selectedYear;
    const deadlineMonth = nextMonth > 11 ? 0 : nextMonth;
    return new Date(deadlineYear, deadlineMonth, day, 23, 59, 59, 999);
  };

  // Format date for display
  const formatDeadline = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Format date for datetime-local input
  const formatDateForInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}T23:59`;
  };

  const handleSaveCutoffDay = async () => {
    setSaving(true);

    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ lock_cutoff_day: settings.lock_cutoff_day })
        .eq('id', 1);

      if (error) throw error;

      toast({
        title: 'Settings Updated',
        description: `Default cutoff day set to the ${getOrdinal(settings.lock_cutoff_day)}.`,
        variant: 'success'
      });
    } catch (error) {
      console.error('Error updating cutoff day:', error);
      toast({ title: 'Error', description: 'Failed to update setting.', variant: 'error' });
    }
    setSaving(false);
  };

  // Toggle month auto-lock ON/OFF
  const handleToggleMonth = async (monthIndex) => {
    const schedule = getSchedule(monthIndex);
    const isCurrentlyForceOpen = schedule?.is_force_open === true;

    setSavingMonth(monthIndex);
    try {
      if (isCurrentlyForceOpen) {
        // Turn ON: Remove force-open flag (or delete the record if no custom date)
        if (schedule) {
          const { error } = await supabase
            .from('monthly_lock_schedules')
            .update({ is_force_open: false })
            .eq('id', schedule.id);
          if (error) throw error;
        }
        toast({
          title: 'Auto-Lock Enabled',
          description: `${LOCK_MONTHS[monthIndex].name} will now follow the lock schedule.`,
          variant: 'success'
        });
      } else {
        // Turn OFF: Set force-open flag
        const defaultDeadline = getDefaultDeadline(monthIndex);
        const { error } = await supabase
          .from('monthly_lock_schedules')
          .upsert({
            month_index: monthIndex,
            year: selectedYear,
            lock_date: schedule?.lock_date || defaultDeadline.toISOString(),
            is_force_open: true
          }, { onConflict: 'month_index,year' });

        if (error) throw error;
        toast({
          title: 'Auto-Lock Disabled',
          description: `${LOCK_MONTHS[monthIndex].name} is now always open.`,
          variant: 'success'
        });
      }
      await fetchSchedules();
    } catch (error) {
      console.error('Error toggling month:', error);
      toast({ title: 'Error', description: 'Failed to update month setting.', variant: 'error' });
    }
    setSavingMonth(null);
  };

  // Start editing custom date
  const startEditDate = (monthIndex) => {
    const schedule = getSchedule(monthIndex);
    const date = schedule?.lock_date ? new Date(schedule.lock_date) : getDefaultDeadline(monthIndex);
    setEditDate(formatDateForInput(date));
    setEditingMonth(monthIndex);
  };

  // Save custom date
  const handleSaveDate = async (monthIndex) => {
    if (!editDate) return;

    setSavingMonth(monthIndex);
    try {
      const lockDate = new Date(editDate);
      lockDate.setSeconds(59, 999);

      const { error } = await supabase
        .from('monthly_lock_schedules')
        .upsert({
          month_index: monthIndex,
          year: selectedYear,
          lock_date: lockDate.toISOString(),
          is_force_open: false
        }, { onConflict: 'month_index,year' });

      if (error) throw error;

      await fetchSchedules();
      setEditingMonth(null);
      setEditDate('');
      toast({
        title: 'Deadline Updated',
        description: `${LOCK_MONTHS[monthIndex].name} deadline set to ${formatDeadline(lockDate)}.`,
        variant: 'success'
      });
    } catch (error) {
      console.error('Error saving date:', error);
      toast({ title: 'Error', description: 'Failed to save deadline.', variant: 'error' });
    }
    setSavingMonth(null);
  };

  // Reset month to default
  const handleResetMonth = async (monthIndex) => {
    const schedule = getSchedule(monthIndex);
    if (!schedule) return;

    setSavingMonth(monthIndex);
    try {
      const { error } = await supabase
        .from('monthly_lock_schedules')
        .delete()
        .eq('id', schedule.id);

      if (error) throw error;

      await fetchSchedules();
      toast({
        title: 'Reset to Default',
        description: `${LOCK_MONTHS[monthIndex].name} will use the global default.`,
        variant: 'success'
      });
    } catch (error) {
      console.error('Error resetting month:', error);
      toast({ title: 'Error', description: 'Failed to reset.', variant: 'error' });
    }
    setSavingMonth(null);
  };

  // Helper to get ordinal suffix (1st, 2nd, 3rd, etc.)
  const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Save carry-over penalty settings
  const handleSavePenalties = async () => {
    const p1 = penaltySettings.carry_over_penalty_1;
    const p2 = penaltySettings.carry_over_penalty_2;

    if (p1 < 0 || p1 > 100 || p2 < 0 || p2 > 100) {
      toast({ title: 'Invalid Values', description: 'Penalties must be between 0 and 100.', variant: 'warning' });
      return;
    }
    if (p2 >= p1) {
      toast({ title: 'Invalid Configuration', description: 'Month 2 penalty must be lower than Month 1.', variant: 'warning' });
      return;
    }

    setSavingPenalties(true);
    try {
      const { error } = await supabase.rpc('update_carry_over_settings', {
        p_penalty_1: p1,
        p_penalty_2: p2
      });
      if (error) throw error;
      toast({ title: 'Settings Updated', description: 'Carry-over penalties saved.', variant: 'success' });
    } catch (error) {
      console.error('Error saving penalty settings:', error);
      toast({ title: 'Error', description: error.message || 'Failed to save penalties.', variant: 'error' });
    }
    setSavingPenalties(false);
  };

  // Save grading strategy settings
  const handleSaveGrading = async () => {
    setSavingGrading(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({
          is_strict_grading_enabled: gradingSettings.is_strict_grading_enabled,
          threshold_uh: gradingSettings.threshold_uh,
          threshold_h: gradingSettings.threshold_h,
          threshold_m: gradingSettings.threshold_m,
          threshold_l: gradingSettings.threshold_l,
        })
        .eq('id', 1);
      if (error) throw error;
      toast({
        title: 'Settings Updated',
        description: gradingSettings.is_strict_grading_enabled
          ? `Strict grading enabled. UH:${gradingSettings.threshold_uh} H:${gradingSettings.threshold_h} M:${gradingSettings.threshold_m} L:${gradingSettings.threshold_l}`
          : 'Flexible grading mode active. Admin decides status manually.',
        variant: 'success'
      });
    } catch (error) {
      console.error('Error saving grading settings:', error);
      toast({ title: 'Error', description: error.message || 'Failed to save grading settings.', variant: 'error' });
    }
    setSavingGrading(false);
  };

  // Toggle individual drop approval policy
  const handleToggleDropPolicy = async (key) => {
    const newValue = !dropPolicy[key];
    setSavingDropPolicy(key);
    try {
      const { error } = await supabase
        .from('system_settings')
        .update({ [key]: newValue })
        .eq('id', 1);
      if (error) throw error;
      setDropPolicy(prev => ({ ...prev, [key]: newValue }));
      const labels = {
        drop_approval_req_uh: 'Ultra High (UH)',
        drop_approval_req_h: 'High (H)',
        drop_approval_req_m: 'Medium (M)',
        drop_approval_req_l: 'Low (L)',
      };
      toast({
        title: 'Drop Policy Updated',
        description: `${labels[key]}: Approval ${newValue ? 'required' : 'not required'}.`,
        variant: 'success'
      });
    } catch (error) {
      console.error('Error updating drop policy:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update drop policy.', variant: 'error' });
    }
    setSavingDropPolicy(null);
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Auto-Lock Control Center */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-100 rounded-lg">
                <Lock className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Auto-Lock Control Center</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Manage when action plans become read-only
                </p>
              </div>
            </div>
            {/* Info Icon with Tooltip */}
            <button
              onClick={() => setShowInfoDetails(!showInfoDetails)}
              className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="How unlock requests work"
            >
              <AlertTriangle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collapsible Info Box */}
        {showInfoDetails && (
          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium mb-1">How Unlock Requests Work</p>
                <ul className="space-y-0.5 text-amber-700 text-xs">
                  <li>• Users can request to unlock a locked plan by providing a reason</li>
                  <li>• Admins review and approve/reject unlock requests</li>
                  <li>• Approved plans can be edited until the approval expires</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Compact Header Row: Global Toggle + Cutoff Day */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-6">
            {/* Global Enable Toggle */}
            <div className="flex items-center gap-4 flex-1 min-w-[280px]">
              <button
                onClick={handleToggleLock}
                disabled={saving}
                className={`p-1 rounded-lg transition-all flex-shrink-0 ${settings.is_lock_enabled
                  ? 'text-teal-600 hover:bg-teal-50'
                  : 'text-gray-400 hover:bg-gray-100'
                  }`}
                title={settings.is_lock_enabled ? 'Click to disable' : 'Click to enable'}
              >
                {saving ? (
                  <Loader2 className="w-9 h-9 animate-spin text-gray-400" />
                ) : settings.is_lock_enabled ? (
                  <ToggleRight className="w-9 h-9" />
                ) : (
                  <ToggleLeft className="w-9 h-9" />
                )}
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">Auto-Lock</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${settings.is_lock_enabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-200 text-gray-600'
                    }`}>
                    {settings.is_lock_enabled ? 'ON' : 'OFF'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Plans lock after the cutoff date
                </p>
              </div>
            </div>

            {/* Cutoff Day Input */}
            {settings.is_lock_enabled && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">Default Cutoff:</span>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={settings.lock_cutoff_day}
                  onChange={(e) => handleCutoffDayChange(e.target.value)}
                  className="w-14 px-2 py-1 text-center font-semibold text-gray-800 border border-gray-300 rounded focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
                <span className="text-sm text-gray-500">of next month</span>
                <button
                  onClick={handleSaveCutoffDay}
                  disabled={saving}
                  className="px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Monthly List - Only visible when lock is enabled */}
        {settings.is_lock_enabled && (
          <div className="p-5">
            {/* Year Selector */}
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-gray-700">Monthly Lock Schedule</h4>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                {LOCK_YEARS_RANGE.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Month Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {LOCK_MONTHS.map((month) => {
                const schedule = getSchedule(month.index);
                const isForceOpen = schedule?.is_force_open === true;
                const hasCustomDate = schedule && !schedule.is_force_open && schedule.lock_date;
                const deadline = hasCustomDate
                  ? new Date(schedule.lock_date)
                  : getDefaultDeadline(month.index);
                const isEditing = editingMonth === month.index;
                const isSaving = savingMonth === month.index;

                return (
                  <div
                    key={month.index}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isForceOpen
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-teal-50/50 border-teal-200'
                      }`}
                  >
                    {/* Left: Month Name + Toggle */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleMonth(month.index)}
                        disabled={isSaving}
                        className={`p-0.5 rounded transition-all ${isForceOpen
                          ? 'text-gray-400 hover:text-gray-600'
                          : 'text-teal-600 hover:text-teal-700'
                          }`}
                        title={isForceOpen ? 'Enable auto-lock' : 'Disable auto-lock'}
                      >
                        {isSaving ? (
                          <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
                        ) : isForceOpen ? (
                          <ToggleLeft className="w-7 h-7" />
                        ) : (
                          <ToggleRight className="w-7 h-7" />
                        )}
                      </button>
                      <div>
                        <span className="font-medium text-gray-800">{month.name}</span>
                        {isEditing ? (
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="datetime-local"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="px-2 py-1 text-xs border border-teal-300 rounded focus:ring-1 focus:ring-teal-500"
                            />
                            <button
                              onClick={() => handleSaveDate(month.index)}
                              disabled={isSaving || !editDate}
                              className="p-1 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => { setEditingMonth(null); setEditDate(''); }}
                              className="p-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <p className={`text-xs mt-0.5 ${isForceOpen ? 'text-gray-500' : 'text-teal-700'}`}>
                            {isForceOpen ? (
                              'Always Open'
                            ) : (
                              <>
                                Locks: {formatDeadline(deadline)}
                                {hasCustomDate && <span className="text-teal-600 ml-1">(custom)</span>}
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Edit Action (only when not force-open and not editing) */}
                    {!isForceOpen && !isEditing && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditDate(month.index)}
                          disabled={isSaving}
                          className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-100 rounded-lg transition-colors"
                          title="Edit deadline"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {hasCustomDate && (
                          <button
                            onClick={() => handleResetMonth(month.index)}
                            disabled={isSaving}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reset to default"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-3 h-3 rounded-full bg-teal-500"></div>
                <span>Auto-Lock ON (follows schedule)</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                <span>Auto-Lock OFF (always open)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Carry Over Penalty Rules */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 rounded-lg">
              <Target className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Carry Over Penalty Rules</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Configure max score caps for late action plans carried over between months
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Penalty 1 */}
          <div className="flex items-start gap-4 bg-amber-50/50 rounded-xl p-4 border border-amber-200">
            <div className="flex-1">
              <label className="block font-semibold text-gray-800 mb-1">
                Late Month 1 — Max Score Cap
              </label>
              <p className="text-xs text-gray-500 mb-3">
                The maximum score a plan can achieve if carried over once (first late month).
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={penaltySettings.carry_over_penalty_1}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 0 && v <= 100) {
                      setPenaltySettings(prev => ({ ...prev, carry_over_penalty_1: v }));
                    }
                  }}
                  className="w-20 px-3 py-2 text-center font-semibold text-gray-800 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <span className="text-gray-500 font-medium">%</span>
              </div>
            </div>
            <span className="mt-1 px-2.5 py-1 bg-amber-200 text-amber-800 text-xs font-bold rounded-full">M1</span>
          </div>

          {/* Penalty 2 */}
          <div className="flex items-start gap-4 bg-rose-50/50 rounded-xl p-4 border border-rose-200">
            <div className="flex-1">
              <label className="block font-semibold text-gray-800 mb-1">
                Late Month 2 — Max Score Cap
              </label>
              <p className="text-xs text-gray-500 mb-3">
                The maximum score for a second carry-over. Plans exceeding this limit will be forced to Drop.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={penaltySettings.carry_over_penalty_2}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 0 && v <= 100) {
                      setPenaltySettings(prev => ({ ...prev, carry_over_penalty_2: v }));
                    }
                  }}
                  className="w-20 px-3 py-2 text-center font-semibold text-gray-800 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                />
                <span className="text-gray-500 font-medium">%</span>
              </div>
            </div>
            <span className="mt-1 px-2.5 py-1 bg-rose-200 text-rose-800 text-xs font-bold rounded-full">M2</span>
          </div>

          {/* Validation hint + Save */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Month 2 cap must be lower than Month 1 cap.
            </p>
            <button
              onClick={handleSavePenalties}
              disabled={savingPenalties || penaltySettings.carry_over_penalty_2 >= penaltySettings.carry_over_penalty_1}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {savingPenalties ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Configuration
            </button>
          </div>
        </div>
      </div>

      {/* Grading Strategy Configuration */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-100 rounded-lg">
              <Star className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Grading Strategy Configuration</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Control how the system determines Achieved/Not Achieved status during grading
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Strict Mode Toggle */}
          <div className="flex items-start gap-4 bg-purple-50/50 rounded-xl p-4 border border-purple-200">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <label className="font-semibold text-gray-800">Strict Grading Mode</label>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradingSettings.is_strict_grading_enabled
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-gray-200 text-gray-600'
                  }`}>
                  {gradingSettings.is_strict_grading_enabled ? 'STRICT' : 'FLEXIBLE'}
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                {gradingSettings.is_strict_grading_enabled
                  ? 'System auto-determines status based on per-priority thresholds below. Each priority level has its own passing score.'
                  : 'Admin freely chooses Achieved or Not Achieved regardless of score. No automatic rules applied.'}
              </p>
            </div>
            <button
              onClick={() => setGradingSettings(prev => ({ ...prev, is_strict_grading_enabled: !prev.is_strict_grading_enabled }))}
              className={`p-1 rounded-lg transition-all flex-shrink-0 ${gradingSettings.is_strict_grading_enabled
                ? 'text-purple-600 hover:bg-purple-100'
                : 'text-gray-400 hover:bg-gray-100'
                }`}
            >
              {gradingSettings.is_strict_grading_enabled
                ? <ToggleRight className="w-9 h-9" />
                : <ToggleLeft className="w-9 h-9" />}
            </button>
          </div>

          {/* Passing Score Input — only meaningful when strict mode is ON */}
          {/* Grid of 4 threshold inputs */}
          <div className={`grid grid-cols-2 gap-4 transition-all ${gradingSettings.is_strict_grading_enabled ? '' : 'opacity-50 pointer-events-none'
            }`}>
            {[
              { key: 'threshold_uh', label: 'Ultra High', tag: 'UH', color: 'red', desc: 'Threshold for Ultra High priority plans' },
              { key: 'threshold_h', label: 'High', tag: 'H', color: 'orange', desc: 'Threshold for High priority plans' },
              { key: 'threshold_m', label: 'Medium', tag: 'M', color: 'blue', desc: 'Threshold for Medium priority plans' },
              { key: 'threshold_l', label: 'Low', tag: 'L', color: 'gray', desc: 'Threshold for Low priority plans' },
            ].map(({ key, label, tag, color, desc }) => (
              <div key={key} className={`flex items-start gap-4 rounded-xl p-4 border bg-${color}-50/50 border-${color}-200`}>
                <div className="flex-1">
                  <label className="block font-semibold text-gray-800 mb-1">
                    {label} Threshold
                  </label>
                  <p className="text-xs text-gray-500 mb-3">{desc}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={gradingSettings[key]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v >= 1 && v <= 100) {
                          setGradingSettings(prev => ({ ...prev, [key]: v }));
                        }
                      }}
                      disabled={!gradingSettings.is_strict_grading_enabled}
                      className={`w-20 px-3 py-2 text-center font-semibold text-gray-800 border border-gray-300 rounded-lg focus:ring-2 focus:ring-${color}-500 focus:border-${color}-500 disabled:bg-gray-100 disabled:text-gray-400`}
                    />
                    <span className="text-gray-500 font-medium">%</span>
                  </div>
                </div>
                <span className={`mt-1 px-2.5 py-1 text-xs font-bold rounded-full ${gradingSettings.is_strict_grading_enabled
                  ? `bg-${color}-200 text-${color}-800`
                  : 'bg-gray-200 text-gray-500'
                  }`}>{tag}</span>
              </div>
            ))}
          </div>

          {/* Strict Mode Rules Summary */}
          {gradingSettings.is_strict_grading_enabled && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">Active Rules</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-gray-700">Ultra High → Must score <span className="font-semibold">≥ {gradingSettings.threshold_uh}%</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  <span className="text-gray-700">High → Must score <span className="font-semibold">≥ {gradingSettings.threshold_h}%</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-gray-700">Medium → Must score <span className="font-semibold">≥ {gradingSettings.threshold_m}%</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                  <span className="text-gray-700">Low → Must score <span className="font-semibold">≥ {gradingSettings.threshold_l}%</span></span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">Carry-over items: threshold is capped at the plan's max possible score.</p>
            </div>
          )}

          {/* Save */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Changes apply immediately to all future gradings.
            </p>
            <button
              onClick={handleSaveGrading}
              disabled={savingGrading}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {savingGrading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Configuration
            </button>
          </div>
        </div>
      </div>

      {/* Drop Approval Policy */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Drop Approval Policy</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Toggle which priority levels require Management Approval to be dropped (marked Not Achieved). If OFF, plans can be dropped immediately.
              </p>
            </div>
          </div>
        </div>

        {/* Toggle Grid */}
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'drop_approval_req_uh', label: 'Ultra High (UH)', description: 'Mission-critical tasks', color: 'red', tag: 'UH' },
              { key: 'drop_approval_req_h', label: 'High (H)', description: 'Important strategic items', color: 'orange', tag: 'H' },
              { key: 'drop_approval_req_m', label: 'Medium (M)', description: 'Standard operational plans', color: 'blue', tag: 'M' },
              { key: 'drop_approval_req_l', label: 'Low (L)', description: 'Low-impact or optional tasks', color: 'gray', tag: 'L' },
            ].map(({ key, label, description, color, tag }) => (
              <div
                key={key}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${dropPolicy[key]
                  ? `border-${color}-200 bg-${color}-50/50`
                  : 'border-gray-100 bg-gray-50/50'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${dropPolicy[key]
                    ? `bg-${color}-200 text-${color}-800`
                    : 'bg-gray-200 text-gray-500'
                    }`}>{tag}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-xs text-gray-500">{description}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleDropPolicy(key)}
                  disabled={savingDropPolicy === key}
                  className={`p-1 rounded-lg transition-all flex-shrink-0 ${dropPolicy[key]
                    ? `text-${color}-600 hover:bg-${color}-100`
                    : 'text-gray-400 hover:bg-gray-100'
                    }`}
                  title={dropPolicy[key] ? 'Approval required — click to disable' : 'No approval needed — click to enable'}
                >
                  {savingDropPolicy === key ? (
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  ) : dropPolicy[key] ? (
                    <ToggleRight className="w-8 h-8" />
                  ) : (
                    <ToggleLeft className="w-8 h-8" />
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">Current policy: </span>
              {Object.values(dropPolicy).every(v => !v)
                ? 'All priorities can be dropped immediately (self-service).'
                : Object.values(dropPolicy).every(v => v)
                  ? 'All priorities require Management Approval to drop.'
                  : `Approval required for: ${[
                    dropPolicy.drop_approval_req_uh && 'UH',
                    dropPolicy.drop_approval_req_h && 'H',
                    dropPolicy.drop_approval_req_m && 'M',
                    dropPolicy.drop_approval_req_l && 'L',
                  ].filter(Boolean).join(', ')}. Others are self-service.`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Developer Zone - UAT/Testing Cleanup Tools */}
      <DeveloperZone />
    </div>
  );
}

// ==================== DEVELOPER ZONE (UAT CLEANUP) ====================
function DeveloperZone() {
  const { toast } = useToast();
  const [hardResetting, setHardResetting] = useState(false);
  const [safeResetting, setSafeResetting] = useState(false);
  const [showHardResetConfirm, setShowHardResetConfirm] = useState(false);
  const [showSafeResetConfirm, setShowSafeResetConfirm] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  // HARD RESET: Mark & Sweep - deletes carry-over children, resets parents to Blocked
  const handleHardReset = async () => {
    setHardResetting(true);
    try {
      const { data, error } = await supabase.rpc('reset_simulation_data');
      if (error) throw error;
      setLastResult({ type: 'hard', ...data });
      setShowHardResetConfirm(false);
      toast({
        title: '✅ Hard Reset Complete',
        description: `Deleted ${data?.deleted_carry_over ?? 0} carry-over plans, reset ${data?.reset_parents ?? 0} parents, removed ${data?.deleted_duplicates ?? 0} duplicates.`,
        variant: 'success'
      });
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      console.error('Hard reset failed:', err);
      toast({ title: 'Reset Failed', description: err.message || 'Unknown error.', variant: 'error' });
    } finally {
      setHardResetting(false);
    }
  };

  // SAFE RESET: UPDATE-only factory reset - no deletions, breaks carry-over links
  const handleSafeReset = async () => {
    setSafeResetting(true);
    try {
      const { data, error } = await supabase.rpc('reset_action_plans_safe');
      if (error) throw error;
      setLastResult({ type: 'safe', ...data });
      setShowSafeResetConfirm(false);
      toast({
        title: '✅ Safe Reset Complete',
        description: `Reset ${data?.reset_count ?? 0} action plans to Open. No records deleted.`,
        variant: 'success'
      });
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      console.error('Safe reset failed:', err);
      toast({ title: 'Reset Failed', description: err.message || 'Unknown error.', variant: 'error' });
    } finally {
      setSafeResetting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-red-100 bg-gradient-to-r from-red-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-100 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">Developer Zone</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              UAT/Testing cleanup tools - Use with caution
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* SAFE RESET — Recommended */}
        <div className="p-4 bg-amber-50 rounded-xl border-2 border-amber-300">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-bold text-amber-700">Safe Reset: Factory Reset (No Deletion)</h4>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">RECOMMENDED</span>
              </div>
              <p className="text-sm text-amber-600 mt-1 mb-3">
                Resets all statuses, scores, carry-over flags, and blocker data back to <code className="bg-amber-100 px-1 rounded">Open</code>.
                Breaks parent-child links safely. <strong>Zero deletions</strong> — all plan definitions are preserved.
              </p>

              <div className="text-xs text-amber-500 space-y-1 mb-4">
                <p><strong>Resets:</strong> status → Open, scores → NULL, carry-over → Normal, blockers → cleared, audit logs → truncated</p>
                <p><strong>Preserves:</strong> department, month, goal, action plan title, indicator, PIC, category, evidence</p>
              </div>

              <button
                onClick={() => setShowSafeResetConfirm(true)}
                disabled={safeResetting}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {safeResetting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Resetting...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> SAFE RESET — Factory Reset</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* HARD RESET — Mark & Sweep */}
        <div className="p-4 bg-red-50 rounded-xl border-2 border-red-300">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-bold text-red-700">Hard Reset: Mark & Sweep</h4>
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full">DESTRUCTIVE</span>
              </div>
              <p className="text-sm text-red-600 mt-1 mb-3">
                Deletes all carry-over child plans, resets parent plans to <code className="bg-red-100 px-1 rounded">Blocked</code>,
                removes duplicates. Use when you need to re-test the Resolution Wizard from scratch.
              </p>

              <div className="text-xs text-red-500 space-y-1 mb-4">
                <p><strong>Deletes:</strong> All plans where <code className="bg-red-100 px-1 rounded">origin_plan_id IS NOT NULL</code> (carry-over children)</p>
                <p><strong>Resets:</strong> Parent plans → Blocked, scores → NULL, carry-over flags → cleared</p>
                <p><strong>Preserves:</strong> Recurring (native) plans with <code className="bg-red-100 px-1 rounded">origin_plan_id = NULL</code></p>
              </div>

              <button
                onClick={() => setShowHardResetConfirm(true)}
                disabled={hardResetting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {hardResetting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sweeping...</>
                ) : (
                  <><Shield className="w-4 h-4" /> HARD RESET — Delete Carry-Overs</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Last Result Summary */}
        {lastResult && (
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600">
            <span className="font-semibold">Last {lastResult.type === 'hard' ? 'Hard' : 'Safe'} Reset:</span>{' '}
            {lastResult.type === 'hard'
              ? `${lastResult.deleted_carry_over} children deleted, ${lastResult.reset_parents} parents reset, ${lastResult.deleted_duplicates} duplicates removed`
              : `${lastResult.reset_count} plans reset to Open`
            }
          </div>
        )}
      </div>

      {/* Confirmation Modal for Safe Reset */}
      {showSafeResetConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-r from-amber-600 to-amber-500 p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Safe Factory Reset</h3>
                  <p className="text-amber-100 text-sm">UPDATE only — no deletions</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-amber-800 font-medium mb-2">This will reset ALL action plans:</p>
                <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
                  <li>Status → Open, Scores → NULL</li>
                  <li>Carry-over links broken, flags cleared</li>
                  <li>Blockers, remarks, unlock requests → cleared</li>
                  <li>Audit logs, notifications, progress logs → truncated</li>
                </ul>
              </div>
              <p className="text-sm text-gray-600 mb-2">Plan definitions (titles, goals, PICs, departments) stay intact.</p>
              <p className="text-sm font-semibold text-gray-800">Proceed?</p>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowSafeResetConfirm(false)} disabled={safeResetting} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleSafeReset} disabled={safeResetting} className="flex-1 px-4 py-2.5 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {safeResetting ? <><Loader2 className="w-4 h-4 animate-spin" /> Resetting...</> : <><RefreshCw className="w-4 h-4" /> Yes, Safe Reset</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Hard Reset */}
      {showHardResetConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-red-500 p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Hard Reset: Mark & Sweep</h3>
                  <p className="text-red-100 text-sm">Deletes carry-over children</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800 font-medium mb-2">DESTRUCTIVE: This will DELETE carry-over plans</p>
                <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                  <li>All plans with origin_plan_id → DELETED</li>
                  <li>Parent plans → status reverted to Blocked</li>
                  <li>Scores, carry-over flags → cleared</li>
                  <li>Duplicates → removed</li>
                </ul>
              </div>
              <p className="text-sm text-gray-600 mb-2">Recurring (native) plans are preserved. Use this to re-test the Resolution Wizard.</p>
              <p className="text-sm font-semibold text-gray-800">Are you absolutely sure?</p>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setShowHardResetConfirm(false)} disabled={hardResetting} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleHardReset} disabled={hardResetting} className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {hardResetting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sweeping...</> : <><Shield className="w-4 h-4" /> Yes, Hard Reset</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
