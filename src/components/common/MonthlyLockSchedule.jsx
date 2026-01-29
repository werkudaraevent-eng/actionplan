import { useState, useEffect } from 'react';
import { Calendar, RotateCcw, Save, Loader2, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from './Toast';
import { getMonthName, getDefaultDeadline, formatLockDeadline } from '../../utils/lockUtils';

const YEARS_RANGE = [2025, 2026, 2027, 2028, 2029, 2030];
const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  index: i,
  name: getMonthName(i)
}));

export default function MonthlyLockSchedule({ defaultCutoffDay = 6 }) {
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [overrides, setOverrides] = useState([]); // Array from DB
  const [editingMonth, setEditingMonth] = useState(null); // month_index being edited
  const [editDate, setEditDate] = useState('');
  const [saving, setSaving] = useState(null); // month_index being saved
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOverrides();
  }, [selectedYear]);

  const fetchOverrides = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('monthly_lock_schedules')
        .select('*')
        .eq('year', selectedYear);
      
      if (error) throw error;
      setOverrides(data || []);
    } catch (error) {
      console.error('Error fetching monthly schedules:', error);
      toast({ title: 'Error', description: 'Failed to load monthly schedules.', variant: 'error' });
    }
    setLoading(false);
  };

  // Find override for a specific month
  const getOverride = (monthIndex) => {
    return overrides.find(o => o.month_index === monthIndex);
  };

  // Get the effective deadline for a month (override or default)
  const getEffectiveDeadline = (monthIndex) => {
    const override = getOverride(monthIndex);
    if (override) {
      return new Date(override.lock_date);
    }
    return getDefaultDeadline(monthIndex, selectedYear, defaultCutoffDay);
  };

  // Start editing a month
  const startEdit = (monthIndex) => {
    const override = getOverride(monthIndex);
    if (override) {
      // Format existing date for input
      const date = new Date(override.lock_date);
      setEditDate(formatDateForInput(date));
    } else {
      // Use default deadline as starting point
      const defaultDate = getDefaultDeadline(monthIndex, selectedYear, defaultCutoffDay);
      setEditDate(formatDateForInput(defaultDate));
    }
    setEditingMonth(monthIndex);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingMonth(null);
    setEditDate('');
  };

  // Format date for datetime-local input
  const formatDateForInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Save custom deadline
  const handleSave = async (monthIndex) => {
    if (!editDate) return;
    
    setSaving(monthIndex);
    try {
      const lockDate = new Date(editDate);
      lockDate.setSeconds(59, 999); // Set to end of minute
      
      const { error } = await supabase
        .from('monthly_lock_schedules')
        .upsert({
          month_index: monthIndex,
          year: selectedYear,
          lock_date: lockDate.toISOString()
        }, {
          onConflict: 'month_index,year'
        });
      
      if (error) throw error;
      
      await fetchOverrides();
      setEditingMonth(null);
      setEditDate('');
      toast({ 
        title: 'Deadline Updated', 
        description: `${getMonthName(monthIndex)} ${selectedYear} deadline set to ${formatLockDeadline(lockDate)}.`, 
        variant: 'success' 
      });
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast({ title: 'Error', description: 'Failed to save deadline.', variant: 'error' });
    }
    setSaving(null);
  };

  // Reset to default (delete override)
  const handleReset = async (monthIndex) => {
    const override = getOverride(monthIndex);
    if (!override) return;
    
    setSaving(monthIndex);
    try {
      const { error } = await supabase
        .from('monthly_lock_schedules')
        .delete()
        .eq('id', override.id);
      
      if (error) throw error;
      
      await fetchOverrides();
      toast({ 
        title: 'Reset to Default', 
        description: `${getMonthName(monthIndex)} ${selectedYear} will use the global default.`, 
        variant: 'success' 
      });
    } catch (error) {
      console.error('Error resetting schedule:', error);
      toast({ title: 'Error', description: 'Failed to reset deadline.', variant: 'error' });
    }
    setSaving(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Monthly Deadline Exceptions</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Override the default lock date for specific months
              </p>
            </div>
          </div>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {YEARS_RANGE.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-8 flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading schedules...
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 w-32">Month</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Lock Deadline</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MONTHS.map((month) => {
                const override = getOverride(month.index);
                const hasOverride = !!override;
                const deadline = getEffectiveDeadline(month.index);
                const isEditing = editingMonth === month.index;
                const isSaving = saving === month.index;
                
                return (
                  <tr key={month.index} className={`hover:bg-gray-50/50 ${isEditing ? 'bg-blue-50/30' : ''}`}>
                    {/* Month Name */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{month.name}</span>
                    </td>
                    
                    {/* Status Badge */}
                    <td className="px-4 py-3">
                      {hasOverride ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                          <Calendar className="w-3 h-3" />
                          Custom
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                          Default (Day {defaultCutoffDay})
                        </span>
                      )}
                    </td>
                    
                    {/* Deadline */}
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          type="datetime-local"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="px-3 py-1.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      ) : (
                        <span className={`text-sm ${hasOverride ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>
                          {formatLockDeadline(deadline)}
                        </span>
                      )}
                    </td>
                    
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSave(month.index)}
                              disabled={isSaving || !editDate}
                              className="p-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                              title="Save"
                            >
                              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(month.index)}
                              disabled={isSaving}
                              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            >
                              {hasOverride ? 'Edit' : 'Set Custom'}
                            </button>
                            {hasOverride && (
                              <button
                                onClick={() => handleReset(month.index)}
                                disabled={isSaving}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Reset to default"
                              >
                                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Note:</strong> Custom deadlines override the global default for that specific month. 
          Plans for a month lock at the specified deadline (e.g., January plans lock on the February deadline).
        </p>
      </div>
    </div>
  );
}
