import { useState, useMemo, useEffect } from 'react';
import { Building2, ClipboardCheck, PartyPopper, FileSpreadsheet, FileText, RotateCcw, Loader2, AlertTriangle, ArrowRight, XCircle, User, Megaphone, CheckCircle, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';
import { useActionPlans } from '../hooks/useActionPlans';
import { useDepartments } from '../hooks/useDepartments';
import { usePermission } from '../hooks/usePermission';
import { supabase, withTimeout } from '../lib/supabase';
import GlobalStatsGrid from '../components/dashboard/GlobalStatsGrid';
import UnifiedPageHeader from '../components/layout/UnifiedPageHeader';
import DataTable, { useColumnVisibility } from '../components/action-plan/DataTable';
import ActionPlanModal from '../components/action-plan/ActionPlanModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import GradeActionPlanModal from '../components/action-plan/GradeActionPlanModal';
import ExportConfigModal from '../components/action-plan/ExportConfigModal';
import ResolutionModal from '../components/action-plan/ResolutionModal';
import ViewDetailModal from '../components/action-plan/ViewDetailModal';
import { useToast } from '../components/common/Toast';

const CURRENT_YEAR = new Date().getFullYear();

// Month order for sorting and filtering
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = Object.fromEntries(MONTHS_ORDER.map((m, i) => [m, i]));

export default function CompanyActionPlans({ initialStatusFilter = '', initialDeptFilter = '', initialActiveTab = 'all_records', highlightPlanId = '' }) {
  const { isAdmin, isExecutive } = useAuth();
  const { can } = usePermission();
  const canEdit = !isExecutive; // Executives have read-only access
  const canExport = can('report', 'export');
  const { toast } = useToast();
  const { departments } = useDepartments();
  // Fetch ALL plans (no department filter)
  const { plans, loading, refetch, updatePlan, deletePlan, updateStatus, gradePlan, resetPlan } = useActionPlans(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  
  // Smart modal navigation: counter to signal when edit modal closes
  const [editModalClosedCounter, setEditModalClosedCounter] = useState(0);

  // Tab state for Admin Grading Inbox - use initialActiveTab prop
  const [activeTab, setActiveTab] = useState(initialActiveTab);

  // Column visibility
  const { visibleColumns, columnOrder, toggleColumn, moveColumn, reorderColumns, resetColumns } = useColumnVisibility();

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [startMonth, setStartMonth] = useState('Jan');
  const [endMonth, setEndMonth] = useState('Dec');
  const [selectedStatus, setSelectedStatus] = useState(initialStatusFilter || 'all');
  const [selectedDept, setSelectedDept] = useState(initialDeptFilter || 'all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Legacy: Keep selectedMonth for backward compatibility
  const selectedMonth = startMonth === endMonth ? startMonth : 'all';

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, planId: null, planTitle: '' });
  const [deleting, setDeleting] = useState(false);

  // Grade modal state
  const [gradeModal, setGradeModal] = useState({ isOpen: false, plan: null });

  // Soft refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Update filters when props change (from dashboard drill-down)
  useEffect(() => {
    if (initialStatusFilter) {
      setSelectedStatus(initialStatusFilter);
    }
  }, [initialStatusFilter]);

  useEffect(() => {
    if (initialDeptFilter) {
      setSelectedDept(initialDeptFilter);
    }
  }, [initialDeptFilter]);

  // Update active tab when prop changes (from dashboard navigation)
  useEffect(() => {
    if (initialActiveTab) {
      setActiveTab(initialActiveTab);
    }
  }, [initialActiveTab]);

  // Count items needing grading (submitted but not yet graded)
  const needsGradingCount = useMemo(() => {
    return plans.filter(p =>
      p.submission_status === 'submitted' && p.quality_score == null
    ).length;
  }, [plans]);

  // Department filter for grading tab
  const [gradingDeptFilter, setGradingDeptFilter] = useState('all');

  // Items needing grading - sorted by department then month, with optional dept filter
  const needsGradingPlans = useMemo(() => {
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return plans
      .filter(p => {
        // Must be submitted and not yet graded
        if (p.submission_status !== 'submitted' || p.quality_score != null) return false;
        // Apply department filter if set - STRICT CODE COMPARISON
        if (gradingDeptFilter && gradingDeptFilter !== 'all') {
          const filterCode = gradingDeptFilter.trim().toUpperCase();
          const planCode = (p.department_code || '').trim().toUpperCase();
          
          if (planCode !== filterCode) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // First sort by department
        if (a.department_code !== b.department_code) {
          return a.department_code.localeCompare(b.department_code);
        }
        // Then by month (oldest first)
        return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
      });
  }, [plans, gradingDeptFilter]);

  // Escalation department filter
  const [escalationDeptFilter, setEscalationDeptFilter] = useState('all');

  // Count escalated items (Management/BOD level only)
  const escalationCount = useMemo(() => {
    return plans.filter(p => p.status === 'Blocked' && p.attention_level === 'Management_BOD').length;
  }, [plans]);

  // Escalated items - sorted by department then month, with optional dept filter
  const escalationPlans = useMemo(() => {
    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return plans
      .filter(p => {
        // Must be Management/BOD escalation only
        if (p.status !== 'Blocked' || p.attention_level !== 'Management_BOD') return false;
        // Apply department filter if set
        if (escalationDeptFilter && escalationDeptFilter !== 'all') {
          const filterCode = escalationDeptFilter.trim().toUpperCase();
          const planCode = (p.department_code || '').trim().toUpperCase();
          if (planCode !== filterCode) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // First sort by department
        if (a.department_code !== b.department_code) {
          return a.department_code.localeCompare(b.department_code);
        }
        // Then by month (oldest first)
        return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
      });
  }, [plans, escalationDeptFilter]);

  // Combined filter logic - respects active tab
  const filteredPlans = useMemo(() => {
    // If on "needs_grading" tab, use the pre-filtered list
    if (activeTab === 'needs_grading') {
      return needsGradingPlans;
    }

    const startIdx = MONTH_INDEX[startMonth] ?? 0;
    const endIdx = MONTH_INDEX[endMonth] ?? 11;

    // Otherwise apply normal filters for "all_records" tab
    const filtered = plans.filter((plan) => {
      // Department filter - STRICT CODE COMPARISON
      if (selectedDept && selectedDept !== 'all' && selectedDept !== 'All' && selectedDept !== 'All Departments') {
        const filterCode = selectedDept.trim().toUpperCase();
        const planCode = (plan.department_code || '').trim().toUpperCase();
        
        if (planCode !== filterCode) {
          return false;
        }
      }

      // Month range filter
      const planMonthIdx = MONTH_INDEX[plan.month];
      if (planMonthIdx !== undefined && (planMonthIdx < startIdx || planMonthIdx > endIdx)) {
        return false;
      }

      // Status filter
      if (selectedStatus !== 'all' && plan.status !== selectedStatus) {
        return false;
      }

      // Category filter (UH, H, M, L)
      if (selectedCategory !== 'all') {
        const planCategory = (plan.category || '').toUpperCase();
        // Extract the category code (first word before space or parenthesis)
        const planCategoryCode = planCategory.split(/[\s(]/)[0];
        if (planCategoryCode !== selectedCategory.toUpperCase()) {
          return false;
        }
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const searchableFields = [
          plan.goal_strategy,
          plan.action_plan,
          plan.indicator,
          plan.pic,
          plan.remark,
          plan.department_code,
        ].filter(Boolean);

        const matchesSearch = searchableFields.some((field) =>
          field.toLowerCase().includes(query)
        );

        if (!matchesSearch) return false;
      }

      return true;
    });

    return filtered;
  }, [plans, selectedDept, startMonth, endMonth, selectedStatus, selectedCategory, searchQuery, activeTab, needsGradingPlans]);

  // Pre-calculate consolidated count for the export modal
  // Uses same fingerprint logic as the actual consolidation
  const consolidatedCount = useMemo(() => {
    const grouped = new Set();
    filteredPlans.forEach(row => {
      const fingerprint = [
        row.department_code,
        row.category,
        row.area_focus,
        row.goal_strategy,
        row.action_plan,
        row.indicator,
        row.evidence,
        row.pic
      ].map(val => String(val || '').trim().toLowerCase()).join('|');
      grouped.add(fingerprint);
    });
    return grouped.size;
  }, [filteredPlans]);

  const hasActiveFilters = selectedDept !== 'all' || (startMonth !== 'Jan' || endMonth !== 'Dec') || selectedStatus !== 'all' || selectedCategory !== 'all' || searchQuery.trim();

  const clearAllFilters = () => {
    setSearchQuery('');
    setStartMonth('Jan');
    setEndMonth('Dec');
    setSelectedStatus('all');
    setSelectedDept('all');
    setSelectedCategory('all');
  };

  const clearMonthFilter = () => {
    setStartMonth('Jan');
    setEndMonth('Dec');
  };

  // Soft refresh handler - re-fetches data without page reload
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      // Small delay so user feels the "work" happening
      await new Promise(resolve => setTimeout(resolve, 400));
    } finally {
      setIsRefreshing(false);
    }
  };

  // Export Excel handler
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const columns = [
        { key: 'department_code', label: 'Department' },
        { key: 'month', label: 'Month' },
        { key: 'category', label: 'Category' },
        { key: 'area_focus', label: 'Focus Area' },
        { key: 'goal_strategy', label: 'Goal/Strategy' },
        { key: 'action_plan', label: 'Action Plan' },
        { key: 'indicator', label: 'Indicator' },
        { key: 'pic', label: 'PIC' },
        { key: 'evidence', label: 'Evidence' },
        { key: 'status', label: 'Status' },
        { key: 'root_cause', label: 'Root Cause Category' },
        { key: 'failure_details', label: 'Failure Details' },
        { key: 'score', label: 'Score' },
        { key: 'outcome_link', label: 'Proof of Evidence' },
        { key: 'remark', label: 'Remarks' },
        { key: 'created_at', label: 'Created At' },
      ];

      const exportData = filteredPlans.map(plan => {
        const row = {};
        columns.forEach(col => {
          let value = plan[col.key] ?? '';
          
          // Handle special computed columns
          if (col.key === 'root_cause') {
            // Only populate for "Not Achieved" status
            if (plan.status === 'Not Achieved') {
              value = plan.gap_category === 'Other' && plan.specify_reason
                ? `Other: ${plan.specify_reason}`
                : (plan.gap_category || '-');
            } else {
              value = '-';
            }
          } else if (col.key === 'failure_details') {
            // Only populate for "Not Achieved" status
            value = plan.status === 'Not Achieved' ? (plan.gap_analysis || '-') : '-';
          } else if (col.key === 'created_at' && value) {
            value = new Date(value).toLocaleDateString();
          }
          
          row[col.label] = value;
        });
        return row;
      });

      // Create worksheet and workbook
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Action Plans');

      // Set column widths
      ws['!cols'] = columns.map(() => ({ wch: 20 }));

      // Generate filename and download
      const timestamp = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `All_Action_Plans_${CURRENT_YEAR}_${timestamp}.xlsx`);
    } catch (error) {
      console.error('Export failed:', error);
      toast({ title: 'Export Failed', description: 'Failed to export data. Please try again.', variant: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // Export PDF handler - Mirrors current table state (WYSIWYG)
  const handleExportPDF = async (config = {}) => {
    const { includesSummary = true, isConsolidated = false } = config;
    
    setExportingPdf(true);
    setShowExportModal(false);
    
    try {
      // Month order for chronological sorting
      const monthMap = {
        'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
        'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
      };
      
      // Consolidation helper - merges duplicate plans into single rows with grouped months
      // CRITICAL: Uses strict string sanitization to ensure proper matching
      const consolidateData = (data) => {
        const grouped = {};
        
        data.forEach(row => {
          // Create a strict content fingerprint
          // ONLY include fields that define the "same" action plan
          // EXCLUDE: id, created_at, updated_at, month, status, score, remark, outcome_link
          // SANITIZE: trim whitespace, normalize to lowercase for comparison
          const fingerprint = [
            row.department_code,
            row.category,
            row.area_focus,
            row.goal_strategy,
            row.action_plan,  // Most important field
            row.indicator,
            row.evidence,
            row.pic
          ].map(val => String(val || '').trim().toLowerCase()).join('|');
          
          if (!grouped[fingerprint]) {
            // First occurrence: Clone row and init months array
            grouped[fingerprint] = { ...row, _monthsList: [row.month] };
          } else {
            // Duplicate found: Just push the month (avoid duplicates)
            if (!grouped[fingerprint]._monthsList.includes(row.month)) {
              grouped[fingerprint]._monthsList.push(row.month);
            }
          }
        });
        
        // Convert back to array and format the 'Month' column
        return Object.values(grouped).map(item => {
          // Remove duplicate months and sort chronologically
          const uniqueMonths = [...new Set(item._monthsList)];
          uniqueMonths.sort((a, b) => (monthMap[a] || 99) - (monthMap[b] || 99));
          
          // Format month label based on count
          let monthLabel = '';
          if (uniqueMonths.length === 12) {
            monthLabel = `FY ${CURRENT_YEAR} (Jan-Dec)`;
          } else if (uniqueMonths.length > 3) {
            // Range format for 4+ months: "Jan - Jun (6mo)"
            monthLabel = `${uniqueMonths[0]} - ${uniqueMonths[uniqueMonths.length - 1]} (${uniqueMonths.length}mo)`;
          } else if (uniqueMonths.length > 1) {
            // List format for 2-3 months: "Jan, Feb, Mar"
            monthLabel = uniqueMonths.join(', ');
          } else {
            monthLabel = uniqueMonths[0] || '-';
          }
          
          // Clean up internal property and return
          const { _monthsList, ...cleanItem } = item;
          return { ...cleanItem, month: monthLabel };
        });
      };
      
      // Use filteredPlans directly - already filtered by current UI filters
      // Apply multi-level sorting: Department (Primary) -> Month (Secondary, chronological)
      let sortedData = [...filteredPlans].sort((a, b) => {
        // Primary: Sort by department
        const deptA = (a.department_code || '').toLowerCase();
        const deptB = (b.department_code || '').toLowerCase();
        const deptCompare = deptA.localeCompare(deptB);
        if (deptCompare !== 0) return deptCompare;
        
        // Secondary: Sort by month (chronological)
        const monthA = monthMap[a.month] || 99;
        const monthB = monthMap[b.month] || 99;
        return monthA - monthB;
      });
      
      // Apply consolidation if enabled
      const dataToExport = isConsolidated ? consolidateData(sortedData) : sortedData;
      
      if (dataToExport.length === 0) {
        toast({ title: 'No Data', description: 'No action plans to export.', variant: 'warning' });
        setExportingPdf(false);
        return;
      }
      
      // Column definitions - maps table column IDs to PDF labels and data accessors
      // Adjust month column width when consolidated (needs more space for ranges)
      const COLUMN_DEFS = {
        dept: { label: 'Dept', fixedWidth: 14, align: 'center', getValue: (p) => String(p.department_code || '-') },
        month: { label: 'Month', fixedWidth: isConsolidated ? 28 : 14, align: 'center', getValue: (p) => String(p.month || '-') },
        category: { label: 'Category', fixedWidth: 20, align: 'center', getValue: (p) => String(p.category || '-') },
        area_focus: { label: 'Area Focus', fixedWidth: null, align: 'left', getValue: (p) => String(p.area_focus || '-') },
        goal_strategy: { label: 'Goal/Strategy', fixedWidth: null, align: 'left', getValue: (p) => String(p.goal_strategy || '-') },
        action_plan: { label: 'Action Plan', fixedWidth: null, align: 'left', getValue: (p) => String(p.action_plan || '-') },
        indicator: { label: 'Indicator', fixedWidth: null, align: 'left', getValue: (p) => String(p.indicator || '-') },
        pic: { label: 'PIC', fixedWidth: 25, align: 'left', getValue: (p) => String(p.pic || '-') },
        evidence: { label: 'Evidence', fixedWidth: null, align: 'left', getValue: (p) => String(p.evidence || '-') },
        status: { label: 'Status', fixedWidth: 22, align: 'center', getValue: (p) => String(p.status || '-') },
        score: { label: 'Score', fixedWidth: 12, align: 'center', getValue: (p) => p.quality_score != null ? `${p.quality_score}%` : '-' },
        outcome: { label: 'Proof', fixedWidth: null, align: 'left', getValue: (p) => String(p.outcome_link || '-') },
        remark: { label: 'Remark', fixedWidth: null, align: 'left', getValue: (p) => String(p.remark || '-') },
      };
      
      // Build active columns from table's columnOrder and visibleColumns state
      // Always include Dept at start for company-wide view
      const tableCols = columnOrder.filter(colId => visibleColumns[colId] && COLUMN_DEFS[colId]);
      const finalCols = ['dept', ...tableCols];
      
      // Build table headers and row builder
      const tableHead = [finalCols.map(c => COLUMN_DEFS[c]?.label || c)];
      const buildRow = (p) => finalCols.map(c => COLUMN_DEFS[c]?.getValue(p) || '-');
      const statusColIdx = finalCols.indexOf('status');
      
      // Build column styles
      const colStyles = {};
      finalCols.forEach((colId, idx) => {
        const def = COLUMN_DEFS[colId];
        if (def?.fixedWidth) {
          colStyles[idx] = { cellWidth: def.fixedWidth, halign: def.align };
        } else {
          colStyles[idx] = { halign: def?.align || 'left' };
        }
      });
      
      // Create PDF document - LANDSCAPE A4
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const generatedDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      });
      
      // Helper: Add header
      const addHeader = () => {
        doc.setFillColor(13, 148, 136);
        doc.rect(0, 0, pageWidth, 18, 'F');
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('Werkudara Group - Action Plan Report', margin, 12);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Company-Wide | FY ${CURRENT_YEAR}`, pageWidth - margin, 12, { align: 'right' });
      };
      
      // Helper: Add footer
      const addFooter = (pageNum, totalPages) => {
        doc.setFontSize(8);
        doc.setTextColor(128, 128, 128);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated on ${generatedDate}`, margin, pageHeight - 8);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      };
      
      // Add first page header
      addHeader();
      
      // Report info
      let yPosition = 26;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Total: ${dataToExport.length} Action Plans | ${finalCols.length} Columns`, margin, yPosition);
      yPosition += 6;
      
      // Build table body
      const tableBody = dataToExport.map(buildRow);
      
      // Generate table
      autoTable(doc, {
        startY: yPosition,
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontStyle: 'bold', fontSize: 9, halign: 'center', valign: 'middle', cellPadding: 2 },
        bodyStyles: { fontSize: 8, cellPadding: 1.5, valign: 'middle', overflow: 'linebreak' },
        columnStyles: colStyles,
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 28, bottom: 20, left: margin, right: margin },
        tableLineColor: [200, 200, 200],
        tableLineWidth: 0.1,
        tableWidth: 'auto',
        didDrawPage: () => {
          doc.setFillColor(13, 148, 136);
          doc.rect(0, 0, pageWidth, 18, 'F');
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text('Werkudara Group - Action Plan Report', margin, 12);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.text(`Company-Wide | FY ${CURRENT_YEAR}`, pageWidth - margin, 12, { align: 'right' });
        },
        willDrawCell: (data) => {
          if (statusColIdx >= 0 && data.section === 'body' && data.column.index === statusColIdx) {
            const status = data.cell.raw;
            if (status === 'Achieved') doc.setTextColor(22, 163, 74);
            else if (status === 'Not Achieved') doc.setTextColor(220, 38, 38);
            else if (status === 'On Progress') doc.setTextColor(37, 99, 235);
            else doc.setTextColor(107, 114, 128);
          }
        },
        didDrawCell: () => { doc.setTextColor(0, 0, 0); }
      });
      
      // Add Summary Page (optional)
      if (includesSummary) {
        doc.addPage();
        addHeader();
        
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text('Executive Summary', margin, 32);
        
        let summaryY = 45;
        
        const priorityConfig = {
          'UH (Ultra High)': { color: [220, 38, 38], shortLabel: 'Ultra High' },
          'H (High)': { color: [234, 88, 12], shortLabel: 'High' },
          'M (Medium)': { color: [202, 138, 4], shortLabel: 'Medium' },
          'L (Low)': { color: [22, 163, 74], shortLabel: 'Low' },
          'Uncategorized': { color: [107, 114, 128], shortLabel: 'Uncategorized' }
        };
        const priorityOrder = ['UH (Ultra High)', 'H (High)', 'M (Medium)', 'L (Low)', 'Uncategorized'];
        
        const categoryToBucket = (category) => {
          if (!category || typeof category !== 'string') return 'Uncategorized';
          const normalized = category.trim();
          if (normalized.includes('Ultra High') || normalized === 'UH') return 'UH (Ultra High)';
          if (normalized.includes('High') && !normalized.includes('Ultra')) return 'H (High)';
          if (normalized.includes('Medium') || normalized === 'M') return 'M (Medium)';
          if (normalized.includes('Low') || normalized === 'L') return 'L (Low)';
          return 'Uncategorized';
        };
        
        const drawBullet = (x, y, color) => {
          doc.setFillColor(color[0], color[1], color[2]);
          doc.circle(x, y - 1.5, 2, 'F');
        };
        
        // Priority Breakdown
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin, summaryY - 5, 120, 60, 3, 3, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text('Priority Distribution', margin + 5, summaryY + 3);
        
        summaryY += 12;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const priorityCounts = {};
        priorityOrder.forEach(k => { priorityCounts[k] = 0; });
        dataToExport.forEach(p => { priorityCounts[categoryToBucket(p.category)]++; });
        
        priorityOrder.forEach(priorityKey => {
          const count = priorityCounts[priorityKey];
          if (count > 0) {
            const cfg = priorityConfig[priorityKey];
            const percentage = ((count / dataToExport.length) * 100).toFixed(1);
            drawBullet(margin + 7, summaryY, cfg.color);
            doc.setTextColor(cfg.color[0], cfg.color[1], cfg.color[2]);
            doc.text(`${cfg.shortLabel}:`, margin + 12, summaryY);
            doc.setTextColor(31, 41, 55);
            doc.text(`${count} items (${percentage}%)`, margin + 45, summaryY);
            summaryY += 7;
          }
        });
        
        summaryY += 3;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(13, 148, 136);
        doc.text(`Total: ${dataToExport.length} action plans`, margin + 5, summaryY);
        
        // Status Breakdown
        summaryY = 45;
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(margin + 130, summaryY - 5, 120, 60, 3, 3, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 41, 55);
        doc.text('Status Breakdown', margin + 135, summaryY + 3);
        
        summaryY += 12;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        
        const statusCounts = {};
        const statusColors = { 'Achieved': [22, 163, 74], 'On Progress': [37, 99, 235], 'Open': [107, 114, 128], 'Not Achieved': [220, 38, 38] };
        
        dataToExport.forEach(p => {
          const status = p.status || 'Unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        Object.entries(statusCounts).forEach(([status, count]) => {
          const percentage = ((count / dataToExport.length) * 100).toFixed(1);
          const color = statusColors[status] || [107, 114, 128];
          doc.setTextColor(color[0], color[1], color[2]);
          doc.text(`${status}:`, margin + 135, summaryY);
          doc.setTextColor(31, 41, 55);
          doc.text(`${count} (${percentage}%)`, margin + 175, summaryY);
          summaryY += 7;
        });
      }
      
      // Add page numbers
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }
      
      // Save
      const timestamp = new Date().toISOString().split('T')[0];
      doc.save(`Werkudara_Action_Plans_${CURRENT_YEAR}_${timestamp}.pdf`);
      
      toast({ title: 'PDF Exported', description: 'Report generated successfully.', variant: 'success' });
    } catch (error) {
      console.error('PDF Export failed:', error);
      toast({ title: 'Export Failed', description: 'Failed to export PDF. Please try again.', variant: 'error' });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleSave = async (formData) => {
    try {
      if (editData) {
        // Check if blocker will be auto-resolved (completing a blocked task)
        const originalPlan = plans.find(p => p.id === editData.id);
        const isCompletionStatus = formData.status === 'Achieved' || formData.status === 'Not Achieved';
        const blockerWasAutoResolved = isCompletionStatus && originalPlan?.is_blocked === true;
        
        await updatePlan(editData.id, {
          month: formData.month,
          goal_strategy: formData.goal_strategy,
          action_plan: formData.action_plan,
          indicator: formData.indicator,
          pic: formData.pic,
          report_format: formData.report_format,
          status: formData.status,
          outcome_link: formData.outcome_link,
          remark: formData.remark,
          // Gap analysis fields for "Not Achieved" status
          gap_category: formData.gap_category,
          gap_analysis: formData.gap_analysis,
          specify_reason: formData.specify_reason,
          // Blocker fields (set by ActionPlanModal when "Blocked" is selected)
          ...(formData.is_blocked !== undefined && { is_blocked: formData.is_blocked }),
          ...(formData.blocker_reason !== undefined && { blocker_reason: formData.blocker_reason }),
          // Escalation fields (blocker category & attention level)
          ...(formData.blocker_category !== undefined && { blocker_category: formData.blocker_category }),
          ...(formData.attention_level !== undefined && { attention_level: formData.attention_level }),
        }, originalPlan);
        
        // Show toast if blocker was auto-resolved
        if (blockerWasAutoResolved) {
          toast({ 
            title: 'Plan Completed', 
            description: 'Blocker has been automatically cleared.', 
            variant: 'success' 
          });
        }
      }
      setEditData(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Save failed:', error);
      toast({ title: 'Save Failed', description: 'Failed to save. Please try again.', variant: 'error' });
    }
  };

  const handleDelete = (item) => {
    // Only prevent deletion if the plan is graded/locked by management
    // Users with delete permission can delete plans of ANY status (Open, On Progress, Achieved, Not Achieved)
    if (item.quality_score != null) {
      toast({ title: 'Action Denied', description: 'This plan has been graded by management and cannot be deleted.', variant: 'warning' });
      return;
    }
    setDeleteModal({
      isOpen: true,
      planId: item.id,
      planTitle: item.action_plan || item.goal_strategy || 'this action plan',
    });
  };

  const confirmDelete = async (deletionReason) => {
    if (!deleteModal.planId) return;
    setDeleting(true);
    try {
      await deletePlan(deleteModal.planId, deletionReason);
      setDeleteModal({ isOpen: false, planId: null, planTitle: '' });
    } catch (error) {
      console.error('Delete failed:', error);
      toast({ title: 'Delete Failed', description: 'Failed to delete. Please try again.', variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = (item) => {
    setEditData(item);
    setIsModalOpen(true);
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateStatus(id, newStatus);
    } catch (error) {
      console.error('Status update failed:', error);
      toast({ title: 'Update Failed', description: 'Failed to update status. Please try again.', variant: 'error' });
    }
  };

  const handleCompletionStatusChange = (item, newStatus) => {
    setEditData({ ...item, status: newStatus });
    setIsModalOpen(true);
  };

  // Grade modal handlers
  const handleOpenGradeModal = (item) => {
    setGradeModal({ isOpen: true, plan: item });
  };

  const handleGrade = async (planId, gradeData) => {
    try {
      await gradePlan(planId, gradeData);
      setGradeModal({ isOpen: false, plan: null });
    } catch (error) {
      console.error('Grade failed:', error);
      // Check for specific "recalled" error
      if (error.code === 'ITEM_RECALLED') {
        throw new Error('This item has been RECALLED by the department. Please refresh and try again.');
      }
      throw error;
    }
  };

  // Quick reset state (individual item reset from table)
  const [quickResetItem, setQuickResetItem] = useState(null);
  const [quickResetting, setQuickResetting] = useState(false);

  // Quick reset handler - opens confirmation, then wipes the item
  const handleQuickReset = (item) => {
    setQuickResetItem(item);
  };

  const confirmQuickReset = async () => {
    if (!quickResetItem) return;
    setQuickResetting(true);
    try {
      await resetPlan(quickResetItem.id);
      toast({ title: 'Reset Complete', description: 'Item has been wiped and reverted to Pending.', variant: 'success' });
      setQuickResetItem(null);
    } catch (error) {
      console.error('Quick reset failed:', error);
      toast({ title: 'Reset Failed', description: error.message || 'Failed to reset item.', variant: 'error' });
    } finally {
      setQuickResetting(false);
    }
  };

  // Escalation action state
  const [escalationUpdating, setEscalationUpdating] = useState(null);
  
  // Resolution modal state
  const [resolutionModal, setResolutionModal] = useState({ isOpen: false, item: null });

  // View detail modal state (for escalation cards)
  const [viewPlan, setViewPlan] = useState(null);

  // Track which escalation plans have management instructions
  const [instructedPlanIds, setInstructedPlanIds] = useState(new Set());

  // Fetch instruction status when escalation plans change
  useEffect(() => {
    if (escalationPlans.length === 0) {
      setInstructedPlanIds(new Set());
      return;
    }
    const ids = escalationPlans.map(p => p.id);
    (async () => {
      try {
        const { data } = await withTimeout(
          supabase
            .from('progress_logs')
            .select('action_plan_id, message')
            .in('action_plan_id', ids)
            .like('message', '%[MANAGEMENT INSTRUCTION]%'),
          5000
        );
        if (data) {
          setInstructedPlanIds(new Set(data.map(r => r.action_plan_id)));
        }
      } catch {
        // Non-critical — cards just won't show instructed state
      }
    })();
  }, [escalationPlans]);

  // Handle escalation resolution - Opens the resolution modal
  const handleMarkResolved = (item) => {
    setResolutionModal({ isOpen: true, item });
  };
  
  // Handle confirmed resolution from modal
  const handleConfirmResolution = async (itemId, payload) => {
    setEscalationUpdating(itemId);
    try {
      // Use updatePlan to update all fields at once (status, remark, action_plan, indicator, etc.)
      await updatePlan(itemId, payload, null, true); // skipLockCheck = true for admin operations
      
      toast({ 
        title: 'Escalation Resolved', 
        description: payload.action_plan || payload.indicator 
          ? 'Item resolved with plan adjustments. The team can continue working on it.'
          : 'Item returned to "On Progress". The team can continue working on it.', 
        variant: 'success' 
      });
      
      setResolutionModal({ isOpen: false, item: null });
    } catch (error) {
      console.error('Resolution failed:', error);
      toast({ title: 'Update Failed', description: 'Failed to resolve escalation.', variant: 'error' });
    } finally {
      setEscalationUpdating(null);
    }
  };

  // Handle escalation closure - Close as Not Achieved
  const handleCloseAsFailed = async (item) => {
    setEscalationUpdating(item.id);
    try {
      await updateStatus(item.id, 'Not Achieved');
      toast({ 
        title: 'Escalation Closed', 
        description: 'Item marked as "Not Achieved". It will appear in the grading queue.', 
        variant: 'success' 
      });
    } catch (error) {
      console.error('Close as failed failed:', error);
      toast({ title: 'Update Failed', description: 'Failed to close escalation.', variant: 'error' });
    } finally {
      setEscalationUpdating(null);
    }
  };

  return (
    <div className="flex-1 bg-gray-50 min-h-full">
      {/* Unified Page Header with Filters */}
      <UnifiedPageHeader
        title="All Action Plans"
        subtitle={`Company-wide Master Tracker — ${plans.length} total plans`}
        withFilters={true}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        startMonth={startMonth}
        setStartMonth={setStartMonth}
        endMonth={endMonth}
        setEndMonth={setEndMonth}
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        columnVisibility={{ visibleColumns, columnOrder, toggleColumn, moveColumn, reorderColumns, resetColumns }}
        onClear={clearAllFilters}
        withDeptFilter={activeTab === 'all_records'}
        selectedDept={selectedDept}
        setSelectedDept={setSelectedDept}
        departments={departments}
        searchPlaceholder="Search across all departments..."
        headerActions={
          <>
            {/* Soft Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
              <span className="text-sm font-medium">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            {/* Export Buttons - Only visible if user has export permission */}
            {canExport && (
              <>
                <button
                  onClick={handleExportExcel}
                  disabled={exporting || filteredPlans.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 border border-teal-600 text-teal-600 bg-white rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {exporting ? 'Exporting...' : 'Export Excel'}
                </button>
                <button
                  onClick={() => setShowExportModal(true)}
                  disabled={exportingPdf || filteredPlans.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 border border-red-500 text-red-500 bg-white rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="w-4 h-4" />
                  {exportingPdf ? 'Exporting...' : 'Export PDF'}
                </button>
              </>
            )}
          </>
        }
        filterActions={
          <div className="flex items-center gap-3">
            {/* Tab Toggle */}
            <div className="flex items-center bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('needs_grading')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'needs_grading'
                  ? 'bg-white shadow text-purple-700'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <ClipboardCheck className="w-4 h-4" />
                Grading
                {needsGradingCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === 'needs_grading'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-orange-500 text-white'
                    }`}>
                    {needsGradingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('escalations')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'escalations'
                  ? 'bg-white shadow text-amber-700'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Escalations
                {escalationCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${activeTab === 'escalations'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-500 text-white'
                    }`}>
                    {escalationCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('all_records')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'all_records'
                  ? 'bg-white shadow text-gray-800'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                All
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${activeTab === 'all_records' ? 'bg-gray-200 text-gray-700' : 'bg-gray-200 text-gray-500'}`}>
                  {plans.length}
                </span>
              </button>
            </div>

            {/* Department Filter for Grading Tab */}
            {activeTab === 'needs_grading' && needsGradingCount > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                <Building2 className="w-4 h-4 text-purple-500" />
                <select
                  value={gradingDeptFilter}
                  onChange={(e) => setGradingDeptFilter(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Depts</option>
                  {departments.map((dept) => (
                    <option key={dept.code} value={dept.code}>{dept.code}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Department Filter for Escalations Tab */}
            {activeTab === 'escalations' && escalationCount > 0 && (
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                <Building2 className="w-4 h-4 text-amber-500" />
                <select
                  value={escalationDeptFilter}
                  onChange={(e) => setEscalationDeptFilter(e.target.value)}
                  className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">All Depts</option>
                  {departments.map((dept) => (
                    <option key={dept.code} value={dept.code}>{dept.code}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        }
      />

      {/* Scrollable Content Area */}
      <main className="p-6 space-y-6">
        {/* KPI Cards - Only show on All Records tab */}
        {activeTab === 'all_records' && (
          <GlobalStatsGrid
            plans={filteredPlans}
            scope="company"
            loading={loading}
            dateContext={startMonth === 'Jan' && endMonth === 'Dec' ? `FY ${CURRENT_YEAR}` : (startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`)}
            periodLabel={startMonth === 'Jan' && endMonth === 'Dec' ? '' : ` (${startMonth === endMonth ? startMonth : `${startMonth} - ${endMonth}`})`}
            activeFilter={selectedStatus !== 'all' ? (() => {
              // Map status back to card filter key
              const reverseMap = {
                'Achieved': 'achieved',
                'On Progress': 'in-progress',
                'Open': 'open',
                'Not Achieved': 'not-achieved'
              };
              return reverseMap[selectedStatus] || null;
            })() : null}
            onCardClick={(cardType) => {
              // cardType is null when toggling off, or the filter key when toggling on
              if (cardType === null) {
                setSelectedStatus('all');
                return;
              }
              const statusMap = {
                'all': 'all',
                'achieved': 'Achieved',
                'in-progress': 'On Progress',
                'open': 'Open',
                'not-achieved': 'Not Achieved',
                'completion': 'all',
                'verification': 'all'
              };
              const newStatus = statusMap[cardType] || 'all';
              setSelectedStatus(newStatus);
            }}
          />
        )}

        {/* Empty State for Needs Grading Tab */}
        {activeTab === 'needs_grading' && needsGradingCount === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <PartyPopper className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">All Caught Up!</h3>
                <p className="text-gray-500 mt-1">No pending items to grade. Great work!</p>
              </div>
              <button
                onClick={() => setActiveTab('all_records')}
                className="mt-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
              >
                View All Records →
              </button>
            </div>
          </div>
        )}

        {/* Empty State for Escalations Tab */}
        {activeTab === 'escalations' && escalationCount === 0 && !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <PartyPopper className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-800">No Escalations</h3>
                <p className="text-gray-500 mt-1">All teams are progressing smoothly. No blockers reported.</p>
              </div>
              <button
                onClick={() => setActiveTab('all_records')}
                className="mt-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800 underline"
              >
                View All Records →
              </button>
            </div>
          </div>
        )}

        {/* Escalation List View - Card-based layout */}
        {activeTab === 'escalations' && escalationCount > 0 && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">Management Escalations</h2>
                  <p className="text-sm text-gray-500">{escalationPlans.length} item{escalationPlans.length !== 1 ? 's' : ''} requiring attention</p>
                </div>
              </div>
            </div>

            {/* Escalation Cards */}
            <div className="grid gap-3">
              {escalationPlans.map((item) => {
                const isInstructed = instructedPlanIds.has(item.id);
                return (
                <div 
                  key={item.id} 
                  className={`rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow ${
                    isInstructed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Left: Avatar + PIC Info */}
                    <div className="flex items-center gap-3 flex-shrink-0 min-w-[180px]">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 ${
                        isInstructed ? 'bg-gradient-to-br from-gray-400 to-gray-600' : 'bg-gradient-to-br from-slate-600 to-slate-800'
                      }`}>
                        {(item.pic || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{item.pic || 'Unknown'}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-700">
                            {item.department_code}
                          </span>
                          <span className="text-xs text-gray-400">{item.month}</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Plan Name + Reason + Status Badge */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">{item.action_plan || 'Untitled Plan'}</p>
                        {isInstructed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 flex-shrink-0">
                            <CheckCircle className="w-3 h-3" />
                            Instruction Sent
                          </span>
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Pending review" />
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline-block mr-1 -mt-0.5" />
                        {item.blocker_reason || 'No reason provided'}
                      </p>
                    </div>

                    {/* Right: Action Area */}
                    <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isExecutive ? (
                        isInstructed ? (
                          <button
                            onClick={() => setViewPlan(item)}
                            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 bg-white rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                          >
                            <Eye className="w-4 h-4" />
                            View Progress
                          </button>
                        ) : (
                          <button
                            onClick={() => setViewPlan(item)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-sm font-medium shadow-sm"
                          >
                            <Megaphone className="w-4 h-4" />
                            Review & Instruct
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            onClick={() => setViewPlan(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleMarkResolved(item)}
                            disabled={escalationUpdating === item.id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                          >
                            {escalationUpdating === item.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ArrowRight className="w-4 h-4" />
                            )}
                            Resolve
                          </button>
                          <button
                            onClick={() => handleCloseAsFailed(item)}
                            disabled={escalationUpdating === item.id}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            {escalationUpdating === item.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                            Failed
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Data Table with Department Column */}
        {(activeTab === 'all_records' || (activeTab === 'needs_grading' && needsGradingCount > 0)) && (
          <DataTable
            data={filteredPlans}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onCompletionStatusChange={handleCompletionStatusChange}
            onGrade={handleOpenGradeModal}
            onQuickReset={handleQuickReset}
            onRefresh={refetch}
            showDepartmentColumn={true}
            visibleColumns={visibleColumns}
            columnOrder={columnOrder}
            isReadOnly={isExecutive}
            highlightPlanId={highlightPlanId}
            onEditModalClosed={editModalClosedCounter}
          />
        )}
      </main>

      <ActionPlanModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditData(null);
          // Signal to DataTable that edit modal closed (for return navigation)
          setEditModalClosedCounter(prev => prev + 1);
        }}
        onSave={handleSave}
        editData={editData}
        departmentCode={editData?.department_code}
      />

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => !deleting && setDeleteModal({ isOpen: false, planId: null, planTitle: '' })}
        onConfirm={confirmDelete}
        title="Delete Action Plan"
        message={`Are you sure you want to delete "${deleteModal.planTitle}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
        requireReason={true}
      />

      {/* Export Config Modal */}
      <ExportConfigModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportPDF}
        isExporting={exportingPdf}
        recordCount={filteredPlans.length}
        consolidatedCount={consolidatedCount}
        visibleColumnCount={columnOrder.filter(c => visibleColumns[c]).length + 1}
      />

      {/* Admin Grade Modal */}
      <GradeActionPlanModal
        isOpen={gradeModal.isOpen}
        onClose={() => setGradeModal({ isOpen: false, plan: null })}
        onGrade={handleGrade}
        plan={gradeModal.plan}
      />

      {/* Escalation Resolution Modal */}
      <ResolutionModal
        isOpen={resolutionModal.isOpen}
        onClose={() => !escalationUpdating && setResolutionModal({ isOpen: false, item: null })}
        onResolve={handleConfirmResolution}
        item={resolutionModal.item}
        isLoading={escalationUpdating === resolutionModal.item?.id}
      />

      {/* View Detail Modal (for escalation cards) */}
      {viewPlan && (
        <ViewDetailModal
          plan={viewPlan}
          onClose={() => {
            setViewPlan(null);
            // Re-fetch instruction status so cards update after executive sends instruction
            if (escalationPlans.length > 0) {
              const ids = escalationPlans.map(p => p.id);
              withTimeout(
                supabase
                  .from('progress_logs')
                  .select('action_plan_id, message')
                  .in('action_plan_id', ids)
                  .like('message', '%[MANAGEMENT INSTRUCTION]%'),
                5000
              ).then(({ data }) => {
                if (data) setInstructedPlanIds(new Set(data.map(r => r.action_plan_id)));
              }).catch(() => {});
            }
          }}
          onEdit={canEdit ? (plan) => { setViewPlan(null); handleEdit(plan); } : undefined}
          onUpdateStatus={canEdit ? (plan) => { setViewPlan(null); handleEdit(plan); } : undefined}
          onEscalate={undefined}
          onRefresh={refetch}
        />
      )}

      {/* Quick Reset Confirmation Modal (Individual Item) */}
      {quickResetItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Reset This Item?</h3>
                <p className="text-sm text-gray-500">Complete wipe for single item</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Action Plan:</p>
              <p className="text-sm text-gray-800 font-medium line-clamp-2">{quickResetItem.action_plan}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{quickResetItem.department_code}</span>
                <span>•</span>
                <span>{quickResetItem.month}</span>
                <span>•</span>
                <span>Score: {quickResetItem.quality_score}</span>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <p className="text-orange-800 text-sm">
                This will reset the item as if it was never submitted:
              </p>
              <ul className="text-orange-700 text-sm mt-2 space-y-1 list-disc list-inside">
                <li>Remove verification score</li>
                <li>Revert status to "Open"</li>
                <li>Clear admin feedback</li>
                <li>Clear proof of evidence link</li>
                <li>Clear staff remarks</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setQuickResetItem(null)}
                disabled={quickResetting}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmQuickReset}
                disabled={quickResetting}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {quickResetting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                {quickResetting ? 'Resetting...' : 'Reset Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
