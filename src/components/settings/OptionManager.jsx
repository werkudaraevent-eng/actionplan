import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Plus, Trash2, Save, X, Loader2, Upload, Download,
    ToggleLeft, ToggleRight, ChevronUp, ChevronDown,
    Search, FileSpreadsheet, AlertTriangle, RefreshCw,
    Pencil, Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useToast } from '../common/Toast';
import {
    parseExcelOptions,
    exportOptionsToExcel,
    bulkUpsertOptions,
} from '../../utils/masterOptionsUtils';

/**
 * OptionManager — Universal, reusable card for managing a single category
 * from either `master_options` or `dropdown_options`.
 *
 * @param {string}  title        - Card title (e.g. "Root Cause Categories")
 * @param {string}  categoryKey  - DB category value (e.g. 'ROOT_CAUSE')
 * @param {string}  [description] - Subtitle text
 * @param {boolean} [showValue]  - Show the Value column (default: false)
 * @param {string}  [source]     - 'master' (master_options) | 'dropdown' (dropdown_options), default 'master'
 */
export default function OptionManager({
    title,
    categoryKey,
    description = '',
    showValue = false,
    source = 'master',
    hideCustomToggle = false,
    customToggleNote = '',
}) {
    const { toast } = useToast();
    const fileInputRef = useRef(null);

    // Resolve table name from source
    const tableName = source === 'dropdown' ? 'dropdown_options' : 'master_options';

    // State
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Add new item state
    const [newLabel, setNewLabel] = useState('');
    const [newValue, setNewValue] = useState('');

    // Edit state
    const [editingId, setEditingId] = useState(null);
    const [editLabel, setEditLabel] = useState('');
    const [editValue, setEditValue] = useState('');

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteError, setDeleteError] = useState('');

    // Import preview state
    const [importPreview, setImportPreview] = useState(null);

    // ─── DATA FETCHING ──────────────────────────────────────────────
    const loadOptions = useCallback(async () => {
        setLoading(true);
        try {
            const selectCols = source === 'dropdown'
                ? 'id, category, label, sort_order, is_active'
                : '*';

            const { data, error } = await supabase
                .from(tableName)
                .select(selectCols)
                .eq('category', categoryKey)
                .order('sort_order', { ascending: true });

            if (error) throw error;

            // Normalize: for dropdown_options, synthesize value = label
            const normalized = (data || []).map(row => ({
                ...row,
                value: row.value ?? row.label,
            }));

            setOptions(normalized);
        } catch (err) {
            console.error(`OptionManager [${categoryKey}] fetch error:`, err);
            toast({ title: 'Load Failed', description: `Could not load ${title}.`, variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [categoryKey, tableName, source, title, toast]);

    useEffect(() => {
        loadOptions();
    }, [loadOptions]);

    // ─── FILTERED DATA ──────────────────────────────────────────────
    // The "Other" option is managed by the toggle, not the list
    const isOtherItem = (opt) => opt.label === 'Other' || (opt.value || '').toUpperCase() === 'OTHER';

    const otherOption = options.find(o => isOtherItem(o));
    const isOtherEnabled = otherOption?.is_active === true;

    const filteredOptions = options
        .filter(opt => {
            // Always hide the "Other" option from the list — controlled by toggle only
            if (isOtherItem(opt)) return false;
            return showArchived ? !opt.is_active : opt.is_active;
        })
        .filter(opt => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return opt.label.toLowerCase().includes(q) || (opt.value || '').toLowerCase().includes(q);
        });

    const activeCount = options.filter(o => o.is_active && !isOtherItem(o)).length;
    const archivedCount = options.filter(o => !o.is_active && !isOtherItem(o)).length;

    // ─── ADD NEW ────────────────────────────────────────────────────
    const handleAdd = async () => {
        const label = newLabel.trim();
        if (!label) return;

        const value = newValue.trim() || label;

        // Check for duplicate
        const duplicate = options.find(
            o => (o.label || '').toLowerCase() === label.toLowerCase() && o.is_active
        );
        if (duplicate) {
            toast({ title: 'Duplicate', description: `"${label}" already exists.`, variant: 'warning' });
            return;
        }

        setSaving(true);
        try {
            const maxSort = options.length > 0 ? Math.max(...options.map(o => o.sort_order || 0)) : 0;

            const insertData = source === 'dropdown'
                ? { category: categoryKey, label, sort_order: maxSort + 1, is_active: true }
                : { category: categoryKey, label, value, sort_order: maxSort + 1, is_active: true };

            const { error } = await supabase.from(tableName).insert(insertData);
            if (error) throw error;

            toast({ title: 'Added', description: `"${label}" added successfully.`, variant: 'success' });
            setNewLabel('');
            setNewValue('');
            await loadOptions();
        } catch (err) {
            console.error('Add error:', err);
            toast({ title: 'Add Failed', description: err.message, variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // ─── EDIT ───────────────────────────────────────────────────────
    const startEdit = (option) => {
        setEditingId(option.id);
        setEditLabel(option.label);
        setEditValue(option.value || option.label);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditLabel('');
        setEditValue('');
    };

    const saveEdit = async () => {
        if (!editLabel.trim()) return;

        setSaving(true);
        try {
            const updateData = source === 'dropdown'
                ? { label: editLabel.trim() }
                : { label: editLabel.trim(), value: editValue.trim() || editLabel.trim() };

            const { error } = await supabase
                .from(tableName)
                .update(updateData)
                .eq('id', editingId);

            if (error) throw error;

            toast({ title: 'Updated', description: 'Option updated.', variant: 'success' });
            cancelEdit();
            await loadOptions();
        } catch (err) {
            console.error('Edit error:', err);
            toast({ title: 'Update Failed', description: err.message, variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // ─── TOGGLE ACTIVE / ARCHIVE ────────────────────────────────────
    const handleToggleActive = async (option) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from(tableName)
                .update({ is_active: !option.is_active })
                .eq('id', option.id);

            if (error) throw error;

            const action = option.is_active ? 'archived' : 'restored';
            toast({
                title: option.is_active ? 'Archived' : 'Restored',
                description: `"${option.label}" has been ${action}.`,
                variant: 'success',
            });
            await loadOptions();
        } catch (err) {
            console.error('Toggle error:', err);
            toast({ title: 'Update Failed', description: err.message, variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // ─── PERMANENT DELETE ───────────────────────────────────────────
    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;

        setSaving(true);
        setDeleteError('');

        try {
            // .select() forces Supabase to return deleted rows — critical for verifying success.
            // Without it, error:null + data:null is returned even when 0 rows are deleted (RLS/ID mismatch).
            console.log(`[OptionManager] DELETE from "${tableName}" WHERE id = ${deleteTarget.id}`);

            const { data, error } = await supabase
                .from(tableName)
                .delete()
                .eq('id', deleteTarget.id)
                .select();

            if (error) {
                // Foreign Key violation — option is in use
                if (error.code === '23503') {
                    const msg = 'Cannot delete: This option is actively used in existing records. Please Archive it instead.';
                    setDeleteError(msg);
                    toast({ title: 'Cannot Delete', description: msg, variant: 'warning' });
                    setSaving(false);
                    return;
                }
                throw error;
            }

            // "Paranoid" check: verify a row was actually deleted.
            // If data is empty, the DELETE ran but affected 0 rows — likely an RLS policy blocking it.
            if (!data || data.length === 0) {
                const msg = 'Delete failed: Item not found or permission denied. Check Supabase RLS policies for this table.';
                console.warn(`[OptionManager] Zero rows returned from DELETE on "${tableName}". Possible RLS block or stale ID.`);
                setDeleteError(msg);
                toast({ title: 'Delete Failed', description: msg, variant: 'error' });
                setSaving(false);
                return;
            }

            // ✅ Verified success — row was actually removed from DB
            const deletedLabel = deleteTarget.label;
            setOptions(prev => prev.filter(item => item.id !== deleteTarget.id));
            setDeleteTarget(null);
            setDeleteError('');
            toast({ title: 'Deleted', description: `"${deletedLabel}" permanently deleted.`, variant: 'success' });

            // Background refetch to sync sort_order / any server-side changes
            loadOptions();
        } catch (err) {
            console.error('Delete error:', err);
            const msg = err.message || 'An unexpected error occurred.';
            setDeleteError(msg);
            toast({ title: 'Delete Failed', description: msg, variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // ─── REORDER ────────────────────────────────────────────────────
    const handleMove = async (currentIndex, direction) => {
        const activeOpts = filteredOptions;
        const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

        if (swapIndex < 0 || swapIndex >= activeOpts.length) return;

        const item = activeOpts[currentIndex];
        const swapItem = activeOpts[swapIndex];

        setSaving(true);
        try {
            await Promise.all([
                supabase.from(tableName).update({ sort_order: swapItem.sort_order }).eq('id', item.id),
                supabase.from(tableName).update({ sort_order: item.sort_order }).eq('id', swapItem.id),
            ]);
            await loadOptions();
        } catch (err) {
            console.error('Reorder error:', err);
            toast({ title: 'Reorder Failed', description: err.message, variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // ─── TOGGLE "OTHER" (ALLOW CUSTOM INPUT) ──────────────────────
    const handleToggleOther = async () => {
        setSaving(true);
        try {
            if (otherOption) {
                // Toggle existing "Other" option
                const { error } = await supabase
                    .from(tableName)
                    .update({ is_active: !otherOption.is_active })
                    .eq('id', otherOption.id);
                if (error) throw error;
            } else {
                // Create "Other" option
                const maxSort = options.length > 0 ? Math.max(...options.map(o => o.sort_order || 0)) : 0;
                const insertData = {
                    category: categoryKey,
                    label: 'Other',
                    sort_order: maxSort + 999,
                    is_active: true,
                    ...(source === 'master' ? { value: 'OTHER' } : {}),
                };
                const { error } = await supabase.from(tableName).insert(insertData);
                if (error) throw error;
            }

            const action = isOtherEnabled ? 'disabled' : 'enabled';
            toast({
                title: `Custom Input ${action === 'enabled' ? 'Enabled' : 'Disabled'}`,
                description: `"Other" option ${action} for ${title}.`,
                variant: 'success',
            });
            await loadOptions();
        } catch (err) {
            console.error('Toggle Other error:', err);
            toast({ title: 'Update Failed', description: err.message, variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    // ─── EXPORT ─────────────────────────────────────────────────────
    const handleExport = async () => {
        setExporting(true);
        try {
            if (source === 'master') {
                // Use the master_options utility
                const result = await exportOptionsToExcel(categoryKey, { includeInactive: true });
                if (result.success) {
                    toast({ title: 'Export Complete', description: `Exported ${result.count} items.`, variant: 'success' });
                } else {
                    toast({ title: 'Export Failed', description: result.error, variant: 'error' });
                }
            } else {
                // Export dropdown_options inline
                const items = options.filter(o => o.label !== 'Other');
                if (items.length === 0) {
                    toast({ title: 'No Data', description: 'No options to export.', variant: 'warning' });
                    return;
                }
                const exportData = items.map(o => ({
                    'Label': o.label,
                    'Active': o.is_active ? 'Yes' : 'No',
                    'Sort Order': o.sort_order ?? 0,
                }));
                const ws = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, categoryKey.substring(0, 31));
                ws['!cols'] = [{ wch: 35 }, { wch: 8 }, { wch: 12 }];
                const safeName = categoryKey.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                XLSX.writeFile(wb, `${safeName}_Options_${new Date().toISOString().split('T')[0]}.xlsx`);
                toast({ title: 'Exported', description: `${exportData.length} items exported.`, variant: 'success' });
            }
        } catch (err) {
            toast({ title: 'Export Failed', description: err.message, variant: 'error' });
        } finally {
            setExporting(false);
        }
    };

    // ─── IMPORT ─────────────────────────────────────────────────────
    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImporting(true);
        try {
            if (source === 'master') {
                // Use the master_options parser
                const result = await parseExcelOptions(file, categoryKey);
                if (result.success) {
                    setImportPreview(result);
                } else {
                    toast({ title: 'Parse Failed', description: result.errors?.join(', '), variant: 'error' });
                }
            } else {
                // Parse for dropdown_options
                const data = new Uint8Array(await file.arrayBuffer());
                const wb = XLSX.read(data, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

                if (rows.length === 0) {
                    toast({ title: 'Empty File', description: 'No data rows found.', variant: 'warning' });
                    return;
                }

                // Normalize rows into preview format
                const parsed = [];
                rows.forEach((row, idx) => {
                    const keys = Object.keys(row);
                    const labelKey = keys.find(k => k.toLowerCase().trim() === 'label') || keys[0];
                    const label = (row[labelKey] || '').toString().trim();
                    if (!label || label.toLowerCase() === 'other') return;

                    const activeRaw = (row[keys.find(k => k.toLowerCase().trim() === 'active') || ''] || 'yes').toString().trim().toLowerCase();
                    const is_active = !['no', 'false', '0', 'inactive', 'n'].includes(activeRaw);

                    parsed.push({
                        category: categoryKey,
                        label,
                        value: label,
                        sort_order: idx + 1,
                        is_active,
                    });
                });

                if (parsed.length === 0) {
                    toast({ title: 'No Valid Rows', description: 'Could not find any valid labels.', variant: 'warning' });
                    return;
                }

                setImportPreview({ success: true, data: parsed, rowCount: parsed.length });
            }
        } catch (err) {
            toast({ title: 'Import Error', description: err.message, variant: 'error' });
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const confirmImport = async () => {
        if (!importPreview?.data) return;

        setImporting(true);
        try {
            if (source === 'master') {
                const result = await bulkUpsertOptions(importPreview.data);
                if (result.success) {
                    toast({
                        title: 'Import Complete',
                        description: `${result.inserted} added, ${result.updated} updated, ${result.skipped} skipped.`,
                        variant: 'success',
                    });
                } else {
                    toast({ title: 'Import Failed', description: result.error, variant: 'error' });
                    return;
                }
            } else {
                // Bulk insert into dropdown_options
                let addedCount = 0;
                const existingLabels = options.map(o => o.label.toLowerCase());
                let maxSort = Math.max(0, ...options.map(o => o.sort_order || 0));

                for (const item of importPreview.data) {
                    if (existingLabels.includes(item.label.toLowerCase())) continue;
                    maxSort++;
                    const { error } = await supabase.from('dropdown_options').insert({
                        category: categoryKey, label: item.label, is_active: item.is_active, sort_order: maxSort,
                    });
                    if (!error) { addedCount++; existingLabels.push(item.label.toLowerCase()); }
                }
                toast({ title: 'Import Complete', description: `${addedCount} new options added.`, variant: 'success' });
            }

            setImportPreview(null);
            await loadOptions();
        } catch (err) {
            toast({ title: 'Import Error', description: err.message, variant: 'error' });
        } finally {
            setImporting(false);
        }
    };

    // ─── RENDER ─────────────────────────────────────────────────────
    return (
        <div className="h-[600px] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

            {/* ══ HEADER (flex-none) ════════════════════════════════ */}
            <div className="flex-none p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800 text-base leading-tight">{title}</h3>
                        {description && (
                            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                {activeCount} active
                            </span>
                            {archivedCount > 0 && (
                                <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                    {archivedCount} archived
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            onClick={handleExport}
                            disabled={exporting || options.length === 0}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40"
                            title="Export to Excel"
                        >
                            {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            Export
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={importing}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors disabled:opacity-40"
                            title="Import from Excel"
                        >
                            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            Import
                        </button>
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                        <button
                            onClick={() => setShowArchived(!showArchived)}
                            className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors ${showArchived
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'text-gray-500 bg-white border border-gray-200 hover:bg-gray-50'
                                }`}
                            title={showArchived ? 'Hide archived' : 'Show archived'}
                        >
                            {showArchived ? <ToggleRight className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                            {showArchived ? 'Archived' : 'Archive'}
                        </button>
                        <button
                            onClick={loadOptions}
                            className="p-1.5 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                {options.length > 5 && (
                    <div className="mt-2.5 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search options..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                        />
                    </div>
                )}
            </div>

            {/* ══ IMPORT PREVIEW BANNER (conditional, flex-none) ══════ */}
            {importPreview && (
                <div className="flex-none p-3 bg-blue-50 border-b border-blue-100">
                    <div className="flex items-start gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-blue-800">
                                Ready to import {importPreview.rowCount} item{importPreview.rowCount !== 1 ? 's' : ''}
                            </p>
                            {importPreview.errors && importPreview.errors.length > 0 && (
                                <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                    <AlertTriangle className="w-3 h-3 inline mr-1" />
                                    {importPreview.errors.length} warning{importPreview.errors.length !== 1 ? 's' : ''}
                                </div>
                            )}
                            <div className="mt-1.5 max-h-20 overflow-y-auto rounded border border-blue-200 bg-white">
                                <table className="w-full text-[10px]">
                                    <thead className="bg-blue-50 text-blue-700">
                                        <tr>
                                            <th className="px-2 py-0.5 text-left font-medium">Label</th>
                                            {showValue && <th className="px-2 py-0.5 text-left font-medium">Value</th>}
                                            <th className="px-2 py-0.5 text-left font-medium">Active</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-blue-50">
                                        {importPreview.data.slice(0, 5).map((item, i) => (
                                            <tr key={i}>
                                                <td className="px-2 py-0.5 text-gray-700">{item.label}</td>
                                                {showValue && <td className="px-2 py-0.5 text-gray-500">{item.value}</td>}
                                                <td className="px-2 py-0.5">{item.is_active ? '✓' : '✗'}</td>
                                            </tr>
                                        ))}
                                        {importPreview.data.length > 5 && (
                                            <tr><td colSpan={showValue ? 3 : 2} className="px-2 py-0.5 text-gray-400 text-center">...+{importPreview.data.length - 5} more</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={confirmImport}
                                    disabled={importing}
                                    className="px-3 py-1 text-[11px] font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1"
                                >
                                    {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                    Confirm
                                </button>
                                <button
                                    onClick={() => setImportPreview(null)}
                                    className="px-3 py-1 text-[11px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══ BODY (flex-1, scrollable) ════════════════════════ */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
                {loading ? (
                    /* Skeleton loading state */
                    <div className="p-4 space-y-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="flex items-center gap-3 animate-pulse">
                                <div className="flex-1 h-4 bg-gray-200 rounded" />
                                {showValue && <div className="w-20 h-4 bg-gray-100 rounded" />}
                                <div className="w-6 h-4 bg-gray-100 rounded" />
                            </div>
                        ))}
                    </div>
                ) : filteredOptions.length === 0 ? (
                    /* Centered empty state */
                    <div className="flex flex-col justify-center items-center h-full text-gray-400 px-6">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <Search className="w-5 h-5 text-gray-300" />
                        </div>
                        <p className="text-sm font-medium text-gray-500">
                            {searchQuery ? 'No matches found' : showArchived ? 'No archived options' : 'No options yet'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            {searchQuery ? 'Try a different search term.' : showArchived ? 'Archive items to see them here.' : 'Add your first option below.'}
                        </p>
                    </div>
                ) : (
                    /* Options list */
                    <div className="divide-y divide-gray-50">
                        {filteredOptions.map((option, index) => (
                            <div
                                key={option.id}
                                className={`flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50/80 transition-colors ${!option.is_active ? 'bg-amber-50/30' : ''}`}
                            >
                                {/* Label (with inline edit) */}
                                <div className="flex-1 min-w-0">
                                    {editingId === option.id ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={editLabel}
                                                onChange={(e) => setEditLabel(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                className="flex-1 px-2 py-1 text-sm border border-teal-300 rounded focus:ring-2 focus:ring-teal-500"
                                                autoFocus
                                            />
                                            {showValue && (
                                                <input
                                                    type="text"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                    className="w-28 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-teal-500"
                                                    placeholder="Value"
                                                />
                                            )}
                                            <button onClick={saveEdit} disabled={saving} className="p-1 text-teal-600 hover:bg-teal-50 rounded">
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <span className={`text-sm truncate block ${option.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                                            {option.label}
                                        </span>
                                    )}
                                </div>

                                {/* Value */}
                                {showValue && editingId !== option.id && (
                                    <span className="w-28 text-center text-xs text-gray-400 font-mono truncate shrink-0">
                                        {option.value}
                                    </span>
                                )}

                                {/* Status toggle */}
                                <button
                                    onClick={() => handleToggleActive(option)}
                                    disabled={saving}
                                    className={`p-0.5 rounded transition-colors shrink-0 ${option.is_active
                                        ? 'text-teal-600 hover:bg-teal-50'
                                        : 'text-gray-400 hover:bg-gray-100'
                                        }`}
                                    title={option.is_active ? 'Archive' : 'Restore'}
                                >
                                    {option.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                                </button>

                                {/* Actions */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                    {option.is_active && editingId !== option.id && (
                                        <>
                                            <button
                                                onClick={() => startEdit(option)}
                                                disabled={saving}
                                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleMove(index, 'up')}
                                                disabled={saving || index === 0}
                                                className="p-1 text-gray-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                title="Move up"
                                            >
                                                <ChevronUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleMove(index, 'down')}
                                                disabled={saving || index === filteredOptions.length - 1}
                                                className="p-1 text-gray-400 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                title="Move down"
                                            >
                                                <ChevronDown className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    )}

                                    {/* Delete (only for archived) */}
                                    {showArchived && !option.is_active && (
                                        <button
                                            onClick={() => setDeleteTarget(option)}
                                            disabled={saving}
                                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Permanently delete"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ══ FOOTER (flex-none, pinned bottom) ═════════════════ */}
            <div className="flex-none border-t border-gray-200 bg-gray-50">
                {/* Add New Row */}
                {!showArchived && (
                    <div className="px-3 py-2.5 border-b border-gray-100">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                placeholder="Add option(s)..."
                                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                            />
                            {showValue && (
                                <input
                                    type="text"
                                    value={newValue}
                                    onChange={(e) => setNewValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                                    placeholder="Value (auto)"
                                    className="w-32 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                                />
                            )}
                            <button
                                onClick={handleAdd}
                                disabled={saving || !newLabel.trim()}
                                className="px-3 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add
                            </button>
                        </div>
                    </div>
                )}

                {/* Allow Custom Input toggle */}
                <div className="px-3 py-2">
                    {hideCustomToggle ? (
                        /* Card has custom input managed elsewhere (e.g. CreatableSelect) */
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] text-gray-400 italic">
                                {customToggleNote || 'Custom input is always enabled for this field.'}
                            </p>
                            <span className="text-[10px] text-gray-300">{source === 'master' ? 'master_options' : 'dropdown_options'}</span>
                        </div>
                    ) : (
                        /* Standard Allow Custom Input toggle */
                        <>
                            <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-600">Allow Custom Input</span>
                                        {isOtherEnabled && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={handleToggleOther}
                                    disabled={saving}
                                    className={`p-0.5 rounded-lg transition-colors shrink-0 ${isOtherEnabled
                                        ? 'text-teal-600 hover:bg-teal-50'
                                        : 'text-gray-300 hover:bg-gray-100'
                                        }`}
                                    title={isOtherEnabled ? 'Disable custom input' : 'Enable custom input'}
                                >
                                    {isOtherEnabled ? (
                                        <ToggleRight className="w-7 h-7" />
                                    ) : (
                                        <ToggleLeft className="w-7 h-7" />
                                    )}
                                </button>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-gray-400">{filteredOptions.length} of {options.filter(o => !isOtherItem(o)).length} shown</span>
                                <span className="text-[10px] text-gray-300">{source === 'master' ? 'master_options' : 'dropdown_options'}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ══ DELETE CONFIRMATION MODAL ═══════════════════════ */}
            {deleteTarget && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">Delete Permanently?</h3>
                        <p className="text-gray-600 text-sm mb-4">
                            This will permanently remove <span className="font-semibold text-gray-800">"{deleteTarget.label}"</span>.
                            This action cannot be undone.
                        </p>
                        {/* Inline error message — shown when deletion fails */}
                        {deleteError && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700">{deleteError}</p>
                            </div>
                        )}
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => { setDeleteTarget(null); setDeleteError(''); }}
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
                                {saving ? 'Deleting...' : 'Delete Forever'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
