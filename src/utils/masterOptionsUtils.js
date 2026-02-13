/**
 * masterOptionsUtils.js
 * 
 * Utility functions for Master Options bulk import (Excel → DB)
 * and export (DB → Excel). Works with the `master_options` table.
 * 
 * Dependencies: xlsx (already installed in the project)
 */

import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

// ============================================================================
// 1. PARSE EXCEL → JSON  (Import Helper)
// ============================================================================

/**
 * Reads an Excel (.xlsx) file and returns a structured array of option objects
 * ready for upserting via the `upsert_master_options` RPC.
 *
 * Expected Excel columns:
 *   - Label   (required) — Display text for the option
 *   - Value   (optional) — DB value; auto-generated from Label if missing
 *   - Active  (optional) — "Yes"/"No" or true/false; defaults to true
 *   - Sort    (optional) — Integer for display ordering; defaults to 0
 *
 * @param {File}   file     - The File object from an <input type="file"> element
 * @param {string} category - The master_options category (e.g. 'ROOT_CAUSE', 'DEPARTMENT')
 * @returns {Promise<{ success: boolean, data?: object[], errors?: string[], rowCount?: number }>}
 */
export async function parseExcelOptions(file, category) {
    return new Promise((resolve) => {
        if (!file) {
            return resolve({ success: false, errors: ['No file provided.'] });
        }

        if (!category || category.trim() === '') {
            return resolve({ success: false, errors: ['Category is required.'] });
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                // Use the first sheet
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) {
                    return resolve({ success: false, errors: ['Excel file has no sheets.'] });
                }

                const worksheet = workbook.Sheets[sheetName];
                const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (rawRows.length === 0) {
                    return resolve({ success: false, errors: ['Excel file is empty (no data rows found).'] });
                }

                const errors = [];
                const parsedItems = [];

                rawRows.forEach((row, index) => {
                    const rowNum = index + 2; // +2 because row 1 is header, data starts at 2

                    // Normalize column names (case-insensitive lookup)
                    const normalized = normalizeRowKeys(row);

                    // Extract Label (required)
                    const label = (normalized['label'] || '').toString().trim();
                    if (!label) {
                        errors.push(`Row ${rowNum}: Missing "Label" (required).`);
                        return;
                    }

                    // Extract Value (optional — auto-generate from label if missing)
                    let value = (normalized['value'] || '').toString().trim();
                    if (!value) {
                        value = label; // Use label as value
                    }

                    // Extract Active (optional — defaults to true)
                    const activeRaw = (normalized['active'] || 'yes').toString().trim().toLowerCase();
                    const isActive = !['no', 'false', '0', 'inactive', 'n'].includes(activeRaw);

                    // Extract Sort Order (optional — defaults to index)
                    let sortOrder = parseInt(normalized['sort'] || normalized['sort_order'] || normalized['order'], 10);
                    if (isNaN(sortOrder)) {
                        sortOrder = index + 1; // Auto-assign order based on row position
                    }

                    parsedItems.push({
                        category: category.trim().toUpperCase(),
                        label,
                        value,
                        sort_order: sortOrder,
                        is_active: isActive,
                    });
                });

                if (parsedItems.length === 0 && errors.length > 0) {
                    return resolve({ success: false, errors });
                }

                resolve({
                    success: true,
                    data: parsedItems,
                    errors: errors.length > 0 ? errors : undefined,
                    rowCount: parsedItems.length,
                });
            } catch (err) {
                console.error('parseExcelOptions error:', err);
                resolve({
                    success: false,
                    errors: [`Failed to parse Excel file: ${err.message}`],
                });
            }
        };

        reader.onerror = () => {
            resolve({ success: false, errors: ['Failed to read the file.'] });
        };

        reader.readAsArrayBuffer(file);
    });
}


// ============================================================================
// 2. EXPORT DB → EXCEL  (Export Helper)
// ============================================================================

/**
 * Fetches master_options by category from Supabase and downloads as an .xlsx file.
 *
 * Output columns: Label, Value, Active (Yes/No), Sort Order
 * Filename: `{Category}_MasterData.xlsx`
 *
 * @param {string}  category      - The master_options category to export (e.g. 'ROOT_CAUSE')
 * @param {object}  [options]     - Optional configuration
 * @param {boolean} [options.includeInactive=false] - Include inactive/archived options
 * @returns {Promise<{ success: boolean, count?: number, error?: string }>}
 */
export async function exportOptionsToExcel(category, options = {}) {
    const { includeInactive = false } = options;

    try {
        if (!category || category.trim() === '') {
            return { success: false, error: 'Category is required.' };
        }

        // Fetch data from Supabase
        let query = supabase
            .from('master_options')
            .select('label, value, is_active, sort_order')
            .eq('category', category.trim().toUpperCase())
            .order('sort_order', { ascending: true });

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Export fetch error:', error);
            return { success: false, error: `Failed to fetch data: ${error.message}` };
        }

        if (!data || data.length === 0) {
            return { success: false, error: `No options found for category "${category}".` };
        }

        // Transform to export-friendly format
        const exportData = data.map((item) => ({
            'Label': item.label,
            'Value': item.value,
            'Active': item.is_active ? 'Yes' : 'No',
            'Sort Order': item.sort_order ?? 0,
        }));

        // Create worksheet and workbook
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();

        // Clean category name for sheet title (max 31 chars for Excel)
        const sheetName = formatCategoryName(category).substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // Set column widths
        worksheet['!cols'] = [
            { wch: 35 }, // Label
            { wch: 20 }, // Value
            { wch: 8 },  // Active
            { wch: 12 }, // Sort Order
        ];

        // Generate filename and download
        const safeName = category.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        const timestamp = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `${safeName}_MasterData_${timestamp}.xlsx`);

        return { success: true, count: exportData.length };
    } catch (err) {
        console.error('exportOptionsToExcel error:', err);
        return { success: false, error: `Export failed: ${err.message}` };
    }
}


// ============================================================================
// 3. UPSERT VIA RPC  (Calls the database function)
// ============================================================================

/**
 * Sends parsed option items to the `upsert_master_options` RPC for bulk insert/update.
 *
 * @param {object[]} items - Array of option objects from parseExcelOptions
 * @returns {Promise<{ success: boolean, inserted?: number, updated?: number, skipped?: number, error?: string }>}
 */
export async function bulkUpsertOptions(items) {
    try {
        if (!items || items.length === 0) {
            return { success: false, error: 'No items to upsert.' };
        }

        const { data, error } = await supabase.rpc('upsert_master_options', {
            p_items: items,
        });

        if (error) {
            console.error('bulkUpsertOptions RPC error:', error);
            return { success: false, error: `Upsert failed: ${error.message}` };
        }

        return {
            success: data?.success ?? true,
            inserted: data?.inserted ?? 0,
            updated: data?.updated ?? 0,
            skipped: data?.skipped ?? 0,
        };
    } catch (err) {
        console.error('bulkUpsertOptions error:', err);
        return { success: false, error: `Upsert failed: ${err.message}` };
    }
}


// ============================================================================
// 4. FETCH OPTIONS  (Simple query helper)
// ============================================================================

/**
 * Fetches active master_options for a given category, sorted by sort_order.
 *
 * @param {string}  category - e.g. 'ROOT_CAUSE', 'PRIORITY', 'DEPARTMENT'
 * @param {boolean} [includeInactive=false]
 * @returns {Promise<{ data: object[], error?: string }>}
 */
export async function fetchMasterOptions(category, includeInactive = false) {
    try {
        let query = supabase
            .from('master_options')
            .select('id, category, label, value, sort_order, is_active')
            .eq('category', category.toUpperCase())
            .order('sort_order', { ascending: true });

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('fetchMasterOptions error:', error);
            return { data: [], error: error.message };
        }

        return { data: data || [] };
    } catch (err) {
        return { data: [], error: err.message };
    }
}


// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Normalize row keys to lowercase, trimmed for case-insensitive column matching.
 * Handles variations like "LABEL", "Label", "label", "  Label  "
 */
function normalizeRowKeys(row) {
    const normalized = {};
    for (const key of Object.keys(row)) {
        normalized[key.trim().toLowerCase()] = row[key];
    }
    return normalized;
}

/**
 * Format category string for display: 'ROOT_CAUSE' → 'Root Cause'
 */
function formatCategoryName(category) {
    return category
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
