import { useState, useMemo, useEffect } from 'react';
import { 
  Target, TrendingUp, CheckCircle2, Trophy, Medal, Award, Calendar, 
  X, Users, Upload, Download, ChevronDown, AlertTriangle, Star, Send 
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import Papa from 'papaparse';
import { useActionPlans } from '../hooks/useActionPlans';
import { DEPARTMENTS, supabase } from '../lib/supabase';
import ImportModal from './ImportModal';
import PerformanceChart from './PerformanceChart';
import StrategyComboChart from './StrategyComboChart';
import BottleneckChart from './BottleneckChart';
import KPICard, { TargetGapTooltip, ContributionTooltip, FailureRateTooltip, BreakdownTooltip } from './KPICard';

const MONTH_MAP = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const COMPARISON_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

// Strict quarter-to-month mapping for ReferenceArea (no calculation, just lookup)
const QUARTER_RANGES = {
  Q1: { start: 'Jan', end: 'Mar' },
  Q2: { start: 'Apr', end: 'Jun' },
  Q3: { start: 'Jul', end: 'Sep' },
  Q4: { start: 'Oct', end: 'Dec' },
};

const monthToDate = (monthStr, year = CURRENT_YEAR) => {
  const monthIndex = MONTH_MAP[monthStr];
  if (monthIndex === undefined) return null;
  return new Date(year, monthIndex, 1);
};

const formatDateForInput = (date) => date ? date.toISOString().split('T')[0] : '';

const getQuarterPreset = (quarter, year) => {
  const quarters = {
    Q1: { start: new Date(year, 0, 1), end: new Date(year, 2, 31) },
    Q2: { start: new Date(year, 3, 1), end: new Date(year, 5, 30) },
    Q3: { start: new Date(year, 6, 1), end: new Date(year, 8, 30) },
    Q4: { start: new Date(year, 9, 1), end: new Date(year, 11, 31) },
  };
  return quarters[quarter];
};

// Convert date string to month abbreviation for ReferenceArea
const dateToMonth = (dateStr) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const monthIndex = date.getMonth();
  return MONTHS_ORDER[monthIndex];
};

// Detect which quarter a date range represents (for strict lookup)
const detectQuarter = (startDate, endDate, year) => {
  if (!startDate || !endDate) return null;
  
  // Check each quarter to see if dates match
  for (const [quarter, range] of Object.entries(QUARTER_RANGES)) {
    const quarterStart = getQuarterPreset(quarter, year);
    const startMatch = formatDateForInput(quarterStart.start) === startDate;
    const endMatch = formatDateForInput(quarterStart.end) === endDate;
    if (startMatch && endMatch) {
      return quarter;
    }
  }
  return null; // Custom date range, not a quarter preset
};

function ChartDropdown({ value, onChange, options }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-xs text-gray-600 font-medium cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500">
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
}


export default function AdminDashboard({ onNavigate }) {
  const { plans, loading, refetch } = useActionPlans(null);
  
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedQuarter, setSelectedQuarter] = useState(null); // Track active quarter
  const [orgMetric, setOrgMetric] = useState('department_code');
  const [stratMetric, setStratMetric] = useState('goal_strategy');
  const [showImportModal, setShowImportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [comparisonYear, setComparisonYear] = useState('prev_year');
  
  // Hybrid data: annual targets and historical stats (monthly)
  const [annualTarget, setAnnualTarget] = useState(null);
  const [historicalStats, setHistoricalStats] = useState([]);
  const [comparisonHistorical, setComparisonHistorical] = useState([]);

  // Calculate comparison year value FIRST (before useEffects that depend on it)
  const comparisonYearValue = useMemo(() => {
    if (comparisonYear === 'none') return null;
    if (comparisonYear === 'prev_year') return selectedYear - 1;
    return parseInt(comparisonYear, 10);
  }, [comparisonYear, selectedYear]);

  // Fetch annual target and historical stats when year changes
  useEffect(() => {
    const fetchTargetAndHistory = async () => {
      // Fetch annual target for selected year
      const { data: targetData } = await supabase
        .from('annual_targets')
        .select('target_percentage')
        .eq('year', selectedYear)
        .single();
      
      setAnnualTarget(targetData?.target_percentage || null);

      // Fetch historical stats for selected year (monthly data)
      const { data: histData } = await supabase
        .from('historical_stats')
        .select('*')
        .eq('year', selectedYear);
      
      setHistoricalStats(histData || []);
    };

    fetchTargetAndHistory();
  }, [selectedYear]);

  // Fetch comparison year historical data
  useEffect(() => {
    const fetchComparisonHistory = async () => {
      if (!comparisonYearValue) {
        setComparisonHistorical([]);
        return;
      }

      const { data } = await supabase
        .from('historical_stats')
        .select('*')
        .eq('year', comparisonYearValue);
      
      setComparisonHistorical(data || []);
    };

    fetchComparisonHistory();
  }, [comparisonYearValue]);

  // Filter plans by year first, then by date range
  const yearFilteredPlans = useMemo(() => {
    return plans.filter((plan) => (plan.year || CURRENT_YEAR) === selectedYear);
  }, [plans, selectedYear]);

  // Filter by date range
  const dateFilteredPlans = useMemo(() => {
    if (!startDate && !endDate) return yearFilteredPlans;
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    return yearFilteredPlans.filter((plan) => {
      const planDate = monthToDate(plan.month, selectedYear);
      if (!planDate) return true;
      if (start && planDate < start) return false;
      if (end && planDate > end) return false;
      return true;
    });
  }, [yearFilteredPlans, startDate, endDate, selectedYear]);

  // Filter by department - exact match when a specific department is selected
  const filteredPlans = useMemo(() => {
    if (selectedDept === 'All') return dateFilteredPlans;
    return dateFilteredPlans.filter((plan) => plan.department_code === selectedDept);
  }, [dateFilteredPlans, selectedDept]);

  // Also filter historical stats by department
  const filteredHistoricalStats = useMemo(() => {
    if (selectedDept === 'All') return historicalStats;
    return historicalStats.filter((h) => h.department_code === selectedDept);
  }, [historicalStats, selectedDept]);

  // Filter comparison historical stats by department
  const filteredComparisonHistorical = useMemo(() => {
    if (selectedDept === 'All') return comparisonHistorical;
    return comparisonHistorical.filter((h) => h.department_code === selectedDept);
  }, [comparisonHistorical, selectedDept]);

  // comparisonYearValue is already defined above

  const comparisonPlans = useMemo(() => {
    if (!comparisonYearValue) return [];
    let filtered = plans.filter((plan) => (plan.year || CURRENT_YEAR) === comparisonYearValue);
    
    // Also apply department filter to comparison plans
    if (selectedDept !== 'All') {
      filtered = filtered.filter((plan) => plan.department_code === selectedDept);
    }
    
    return filtered;
  }, [plans, comparisonYearValue, selectedDept]);

  // Get available years from data for dropdown
  const availableYearsInData = useMemo(() => {
    const years = new Set();
    plans.forEach((plan) => years.add(plan.year || CURRENT_YEAR));
    return Array.from(years).sort((a, b) => b - a);
  }, [plans]);

  // Helper: Extract and aggregate failure reasons from action_plans
  const failureAnalysis = useMemo(() => {
    // Filter plans where status === 'Not Achieved'
    const failedPlans = filteredPlans.filter((p) => p.status === 'Not Achieved');
    
    if (failedPlans.length === 0) {
      return { reasons: [], topBlocker: null, totalFailed: 0 };
    }
    
    // Parse reasons from remark field: [Cause: ...]
    const reasonCounts = {};
    failedPlans.forEach((plan) => {
      const match = plan.remark?.match(/\[Cause: (.*?)\]/);
      const reason = match?.[1]?.trim() || 'Unspecified';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });
    
    // Convert to sorted array
    const sortedReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: Math.round((count / failedPlans.length) * 100)
      }))
      .sort((a, b) => b.count - a.count);
    
    // Identify top blocker
    const topBlocker = sortedReasons.length > 0 ? sortedReasons[0] : null;
    
    return {
      reasons: sortedReasons,
      topBlocker,
      totalFailed: failedPlans.length
    };
  }, [filteredPlans]);

  // Calculate stats with hybrid data support
  const stats = useMemo(() => {
    const total = filteredPlans.length;
    const achieved = filteredPlans.filter((p) => p.status === 'Achieved').length;
    const inProgress = filteredPlans.filter((p) => p.status === 'On Progress').length;
    const pending = filteredPlans.filter((p) => p.status === 'Pending').length;
    const notAchieved = filteredPlans.filter((p) => p.status === 'Not Achieved').length;

    // Build department stats from real data
    const deptMap = {};
    filteredPlans.forEach((plan) => {
      if (!deptMap[plan.department_code]) deptMap[plan.department_code] = { total: 0, achieved: 0 };
      deptMap[plan.department_code].total++;
      if (plan.status === 'Achieved') deptMap[plan.department_code].achieved++;
    });

    // Hybrid: For departments with no real data, use filtered historical stats
    const byDepartment = [];
    const processedDepts = new Set();

    // First, add departments with real data
    Object.entries(deptMap).forEach(([code, s]) => {
      byDepartment.push({
        code,
        name: code,
        total: s.total,
        achieved: s.achieved,
        rate: s.total > 0 ? Math.round((s.achieved / s.total) * 100) : 0,
        isHistorical: false,
      });
      processedDepts.add(code);
    });

    // Then, add historical data for departments without real data
    // Group and average by department_code first
    const historicalByDept = {};
    filteredHistoricalStats.forEach((hist) => {
      if (!processedDepts.has(hist.department_code)) {
        if (!historicalByDept[hist.department_code]) {
          historicalByDept[hist.department_code] = { sum: 0, count: 0 };
        }
        historicalByDept[hist.department_code].sum += hist.completion_rate;
        historicalByDept[hist.department_code].count++;
      }
    });

    // Add aggregated historical departments
    Object.entries(historicalByDept).forEach(([code, data]) => {
      byDepartment.push({
        code,
        name: code,
        total: 0,
        achieved: 0,
        rate: Math.round(data.sum / data.count),
        isHistorical: true,
      });
    });

    // Sort by rate descending
    byDepartment.sort((a, b) => b.rate - a.rate);

    // Calculate overdue count (status != 'Achieved' AND month < current month)
    const currentMonthIndex = new Date().getMonth();
    const overdue = filteredPlans.filter((p) => {
      if (p.status === 'Achieved') return false;
      const monthIndex = MONTH_MAP[p.month];
      if (monthIndex === undefined) return false;
      return monthIndex < currentMonthIndex;
    }).length;

    return { total, achieved, inProgress, pending, notAchieved, byDepartment, overdue };
  }, [filteredPlans, filteredHistoricalStats]);

  // Quality Score and Submission Progress stats (separate for clarity)
  const qualityStats = useMemo(() => {
    // Submission Progress: How many items have been finalized/submitted
    const submittedItems = filteredPlans.filter(p => p.submission_status === 'submitted').length;
    const submissionProgress = filteredPlans.length > 0 
      ? parseFloat(((submittedItems / filteredPlans.length) * 100).toFixed(0)) 
      : 0;
    
    // Quality Score: Average of graded items (THE HERO METRIC)
    const gradedItems = filteredPlans.filter(p => 
      p.submission_status === 'submitted' && p.quality_score != null
    );
    const qualityScore = gradedItems.length > 0 
      ? parseFloat((gradedItems.reduce((sum, p) => sum + p.quality_score, 0) / gradedItems.length).toFixed(0))
      : null;
    const gradedCount = gradedItems.length;
    
    return { submissionProgress, qualityScore, gradedCount };
  }, [filteredPlans]);

  // Helper: Find department with most items of a given status (for KPI drill-down)
  const getDeptWithMostStatus = useMemo(() => {
    return (status) => {
      const deptCounts = {};
      filteredPlans.forEach((plan) => {
        if (status === 'all' || plan.status === status) {
          deptCounts[plan.department_code] = (deptCounts[plan.department_code] || 0) + 1;
        }
      });
      
      let maxDept = null;
      let maxCount = 0;
      Object.entries(deptCounts).forEach(([dept, count]) => {
        if (count > maxCount) {
          maxDept = dept;
          maxCount = count;
        }
      });
      
      return maxDept;
    };
  }, [filteredPlans]);

  // YoY Line Chart Data with dynamic comparison and historical fallback
  const yoyChartData = useMemo(() => {
    // Build current year data from real plans (already filtered by dept search)
    const currentYearMap = {};
    filteredPlans.forEach((plan) => {
      const month = plan.month;
      if (!currentYearMap[month]) currentYearMap[month] = { total: 0, achieved: 0 };
      currentYearMap[month].total++;
      if (plan.status === 'Achieved') currentYearMap[month].achieved++;
    });
    
    // Build comparison year data from real plans (already filtered by dept search)
    const comparisonMap = {};
    comparisonPlans.forEach((plan) => {
      const month = plan.month;
      if (!comparisonMap[month]) comparisonMap[month] = { total: 0, achieved: 0 };
      comparisonMap[month].total++;
      if (plan.status === 'Achieved') comparisonMap[month].achieved++;
    });

    // Build historical data maps (month number to rate) - using filtered historical stats
    const historicalMap = {};
    filteredHistoricalStats.forEach((h) => {
      const monthName = MONTHS_ORDER[h.month - 1];
      if (!historicalMap[monthName]) {
        historicalMap[monthName] = { sum: 0, count: 0 };
      }
      historicalMap[monthName].sum += h.completion_rate;
      historicalMap[monthName].count++;
    });

    const compHistoricalMap = {};
    filteredComparisonHistorical.forEach((h) => {
      const monthName = MONTHS_ORDER[h.month - 1];
      if (!compHistoricalMap[monthName]) {
        compHistoricalMap[monthName] = { sum: 0, count: 0 };
      }
      compHistoricalMap[monthName].sum += h.completion_rate;
      compHistoricalMap[monthName].count++;
    });

    return MONTHS_ORDER.map((month) => {
      const curr = currentYearMap[month];
      const comp = comparisonMap[month];
      
      // Use real data if available, otherwise fall back to historical (averaged if multiple depts)
      let mainValue = null;
      if (curr && curr.total > 0) {
        mainValue = Math.round((curr.achieved / curr.total) * 100);
      } else if (historicalMap[month]) {
        mainValue = Math.round(historicalMap[month].sum / historicalMap[month].count);
      }

      let compareValue = null;
      if (comp && comp.total > 0) {
        compareValue = Math.round((comp.achieved / comp.total) * 100);
      } else if (compHistoricalMap[month]) {
        compareValue = Math.round(compHistoricalMap[month].sum / compHistoricalMap[month].count);
      }

      return {
        month,
        main_value: mainValue,
        compare_value: compareValue,
      };
    });
  }, [filteredPlans, comparisonPlans, filteredHistoricalStats, filteredComparisonHistorical]);

  // Check if we have any comparison data (real or historical)
  const hasComparisonData = comparisonPlans.length > 0 || filteredComparisonHistorical.length > 0;
  const comparisonLabel = comparisonYearValue ? `${comparisonYearValue}` : null;

  // Calculate highlight range for ReferenceArea using strict quarter lookup
  const highlightRange = useMemo(() => {
    if (!startDate && !endDate) return null;
    
    // First, check if this is a quarter preset (use strict lookup)
    const detectedQuarter = detectQuarter(startDate, endDate, selectedYear);
    if (detectedQuarter) {
      // Use the strict quarter range mapping
      return { 
        x1: QUARTER_RANGES[detectedQuarter].start, 
        x2: QUARTER_RANGES[detectedQuarter].end 
      };
    }
    
    // For custom date ranges, convert dates to months
    const startMonth = startDate ? dateToMonth(startDate) : 'Jan';
    const endMonth = endDate ? dateToMonth(endDate) : 'Dec';
    return { x1: startMonth, x2: endMonth };
  }, [startDate, endDate, selectedYear]);

  // Org Chart Data - with historical fallback
  const orgChartData = useMemo(() => {
    // If we have real plans, use them - Score-centric
    if (filteredPlans.length > 0) {
      const dataMap = {};
      filteredPlans.forEach((plan) => {
        let key = orgMetric === 'department_code' ? (plan.department_code || 'Unknown') : (plan.pic?.trim() || 'Unassigned');
        const shortName = key.length > 20 ? key.substring(0, 17) + '...' : key;
        if (!dataMap[shortName]) dataMap[shortName] = { total: 0, scores: [], fullName: orgMetric === 'department_code' ? getDeptName(key) : key };
        dataMap[shortName].total++;
        // Track quality scores for graded items
        if (plan.submission_status === 'submitted' && plan.quality_score != null) {
          dataMap[shortName].scores.push(plan.quality_score);
        }
      });
      return Object.entries(dataMap).map(([name, s]) => ({ 
        name, 
        fullName: s.fullName, 
        rate: s.scores.length > 0 ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0, 
        total: s.total, 
        graded: s.scores.length 
      })).sort((a, b) => b.rate - a.rate);
    }
    
    // Fallback to filtered historical stats (only for department view, not PIC)
    if (orgMetric === 'department_code' && filteredHistoricalStats.length > 0) {
      // Calculate average completion rate per department from monthly data
      const deptAvgMap = {};
      filteredHistoricalStats.forEach((h) => {
        if (!deptAvgMap[h.department_code]) {
          deptAvgMap[h.department_code] = { sum: 0, count: 0 };
        }
        deptAvgMap[h.department_code].sum += h.completion_rate;
        deptAvgMap[h.department_code].count++;
      });
      
      return Object.entries(deptAvgMap).map(([code, data]) => ({
        name: code,
        fullName: getDeptName(code),
        rate: Math.round(data.sum / data.count),
        total: 0,
        graded: 0,
        isHistorical: true,
      })).sort((a, b) => b.rate - a.rate);
    }
    
    return [];
  }, [filteredPlans, orgMetric, filteredHistoricalStats]);

  // Strategy Chart Data - Score-centric (no historical fallback)
  const stratChartData = useMemo(() => {
    const dataMap = {};
    filteredPlans.forEach((plan) => {
      let key = stratMetric === 'goal_strategy' ? (plan.goal_strategy?.trim() || 'Uncategorized') : (plan.report_format?.trim() || 'No Format');
      const shortName = key.length > 20 ? key.substring(0, 17) + '...' : key;
      if (!dataMap[shortName]) dataMap[shortName] = { total: 0, scores: [], fullName: key };
      dataMap[shortName].total++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        dataMap[shortName].scores.push(plan.quality_score);
      }
    });
    return Object.entries(dataMap).map(([name, s]) => ({ 
      name, 
      fullName: s.fullName, 
      rate: s.scores.length > 0 ? Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length) : 0, 
      total: s.total, 
      graded: s.scores.length 
    })).sort((a, b) => b.rate - a.rate);
  }, [filteredPlans, stratMetric]);

  // Check if viewing historical year with no real data
  const isHistoricalView = filteredPlans.length === 0 && filteredHistoricalStats.length > 0;

  // Leaderboard is now just the stats.byDepartment (filtering is done at the data level)
  const filteredLeaderboard = stats.byDepartment;

  function getDeptName(code) { const dept = DEPARTMENTS.find((d) => d.code === code); return dept ? dept.name : code; }
  const getRankIcon = (index) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-gray-400 font-medium">{index + 1}</span>;
  };

  const hasActiveFilters = startDate || endDate || selectedDept !== 'All';
  const clearDateFilters = () => { setStartDate(''); setEndDate(''); setSelectedQuarter(null); };
  const clearDeptFilter = () => { setSelectedDept('All'); };
  const applyQuarterPreset = (quarter) => { 
    const preset = getQuarterPreset(quarter, selectedYear); 
    setStartDate(formatDateForInput(preset.start)); 
    setEndDate(formatDateForInput(preset.end)); 
    setSelectedQuarter(quarter); 
  };
  const getDateRangeLabel = () => {
    if (!startDate && !endDate) return 'Year to Date';
    if (startDate && endDate) return `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    if (startDate) return `From ${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    return `Until ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const orgTitle = orgMetric === 'department_code' ? 'Quality Score by Department' : 'Quality Score by PIC';
  const stratTitle = stratMetric === 'goal_strategy' ? 'Quality Score by Strategy' : 'Quality Score by Report Format';

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportData = filteredPlans.map((plan) => ({
        year: plan.year || selectedYear, department_code: plan.department_code, department_name: getDeptName(plan.department_code),
        month: plan.month, goal_strategy: plan.goal_strategy, action_plan: plan.action_plan, indicator: plan.indicator,
        pic: plan.pic, report_format: plan.report_format, status: plan.status, outcome_link: plan.outcome_link || '', remark: plan.remark || '', created_at: plan.created_at,
      }));
      const csv = Papa.unparse(exportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `werkudara_${selectedYear}_data_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (error) { console.error('Export error:', error); alert('Failed to export data.'); }
    finally { setExporting(false); }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-gray-50 min-h-screen p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map((i) => <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>)}</div>
          <div className="grid grid-cols-2 gap-6"><div className="h-80 bg-gray-200 rounded-xl"></div><div className="h-80 bg-gray-200 rounded-xl"></div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Company Dashboard</h1>
            <p className="text-gray-500 text-sm">Executive Performance Overview — FY {selectedYear}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleExport} disabled={exporting || filteredPlans.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <Download className="w-4 h-4" />{exporting ? 'Exporting...' : 'Export CSV'}
            </button>
            <button onClick={() => setShowImportModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700">
              <Upload className="w-4 h-4" />Import CSV
            </button>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* Filter Bar with Year Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Year Selector */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600 font-medium">Fiscal Year:</span>
                <div className="flex gap-1">
                  {AVAILABLE_YEARS.map((year) => (
                    <button key={year} onClick={() => { setSelectedYear(year); clearDateFilters(); }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${selectedYear === year ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {year}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-6 w-px bg-gray-200"></div>
              {/* Department Dropdown */}
              <div className="relative">
                <select 
                  value={selectedDept} 
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm text-gray-700 font-medium cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 min-w-[200px]"
                >
                  <option value="All">All Departments</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.code} value={dept.code}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                {['Q1','Q2','Q3','Q4'].map((q) => (
                  <button 
                    key={q} 
                    onClick={() => applyQuarterPreset(q)} 
                    className={`px-2.5 py-1.5 text-xs font-medium rounded border transition-colors ${
                      selectedQuarter === q 
                        ? 'bg-teal-600 text-white border-teal-600' 
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="h-6 w-px bg-gray-200"></div>
              <div className="flex items-center gap-2">
                <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setSelectedQuarter(null); }} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setSelectedQuarter(null); }} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
                {(startDate || endDate) && <button onClick={clearDateFilters} className="p-1.5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>}
              </div>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500">Viewing {selectedYear}:</span>
              {(startDate || endDate) && <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">{getDateRangeLabel()}</span>}
              {selectedDept !== 'All' && (
                <span className="px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-full flex items-center gap-1">
                  {getDeptName(selectedDept)} ({selectedDept})
                  <button onClick={clearDeptFilter} className="hover:text-teal-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">{filteredPlans.length} plans</span>
            </div>
          )}
        </div>

        {/* KPI Cards - Score-Centric Layout */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          {/* Total Action Plans */}
          <KPICard
            gradient="from-teal-500 to-teal-600"
            icon={Target}
            value={stats.total}
            label="Total Action Plans"
            labelColor="text-teal-100"
            tooltipContent={<BreakdownTooltip ongoing={stats.inProgress + stats.pending} finalized={stats.achieved + stats.notAchieved} />}
            onClick={onNavigate && stats.total > 0 ? () => onNavigate('all-plans', { statusFilter: '' }) : undefined}
            size="compact"
          />
          
          {/* Quality Score - THE HERO METRIC */}
          <KPICard
            gradient={qualityStats.qualityScore === null ? 'from-gray-400 to-gray-500' : 
              qualityStats.qualityScore >= 80 ? 'from-purple-500 to-purple-600' : 
              qualityStats.qualityScore >= 60 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600'}
            icon={Star}
            value={qualityStats.qualityScore !== null ? `${qualityStats.qualityScore}%` : '—'}
            label="Quality Score"
            labelColor="text-white/90"
            size="compact"
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Performance Quality</p>
                <p>Avg Score: <span className={`font-bold ${qualityStats.qualityScore >= 80 ? 'text-green-400' : qualityStats.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {qualityStats.qualityScore !== null ? `${qualityStats.qualityScore}%` : 'N/A'}
                </span></p>
                <p className="text-xs text-gray-400">{qualityStats.gradedCount} items graded</p>
              </div>
            }
          />
          
          {/* Submission Progress - Administrative/Compliance metric */}
          <KPICard
            gradient="from-slate-500 to-slate-600"
            icon={Send}
            value={`${qualityStats.submissionProgress}%`}
            label="Submission Progress"
            labelColor="text-slate-100"
            size="compact"
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Compliance Status</p>
                <p>Submitted: <span className="font-bold">{qualityStats.submissionProgress}%</span></p>
                <p className="text-xs text-gray-400">Tracks finalized items (not quality)</p>
              </div>
            }
            progressBar={{ value: qualityStats.submissionProgress, target: 100 }}
          />
          
          {/* Achieved Plans */}
          <KPICard
            gradient="from-green-500 to-green-600"
            icon={CheckCircle2}
            value={stats.achieved}
            label="Achieved Plans"
            labelColor="text-green-100"
            tooltipContent={<ContributionTooltip achieved={stats.achieved} total={stats.total} />}
            onClick={onNavigate && stats.achieved > 0 ? () => onNavigate('all-plans', { statusFilter: 'Achieved' }) : undefined}
            size="compact"
          />
          
          {/* In Progress */}
          <KPICard
            gradient="from-amber-500 to-amber-600"
            icon={TrendingUp}
            value={stats.inProgress}
            label="In Progress"
            labelColor="text-amber-100"
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Work in Progress</p>
                <p>Active: <span className="font-bold text-amber-400">{stats.total > 0 ? ((stats.inProgress / stats.total) * 100).toFixed(1) : 0}%</span></p>
                <p className="text-xs text-gray-400">{stats.inProgress} tasks being worked on</p>
              </div>
            }
            onClick={onNavigate && stats.inProgress > 0 ? () => onNavigate('all-plans', { statusFilter: 'On Progress' }) : undefined}
            size="compact"
          />
          
          {/* Critical / Not Achieved */}
          <KPICard
            gradient="from-red-500 to-red-600"
            icon={AlertTriangle}
            value={stats.notAchieved + stats.overdue}
            label="Critical / Not Achieved"
            labelColor="text-red-100"
            tooltipContent={<FailureRateTooltip failed={stats.notAchieved + stats.overdue} total={stats.total} breakdown={{ notAchieved: stats.notAchieved, overdue: stats.overdue }} />}
            onClick={onNavigate && stats.notAchieved > 0 ? () => onNavigate('all-plans', { statusFilter: 'Not Achieved' }) : undefined}
            topBlocker={failureAnalysis.topBlocker ? `⚠️ Top Issue: ${failureAnalysis.topBlocker.reason} (${failureAnalysis.topBlocker.count})` : null}
            size="compact"
          />
        </div>

        {/* Decision Layer: YoY Trend (2/3) + Bottleneck Radar (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        
        {/* YoY Trend Chart - Left Column (Span 2) */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-[320px] flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Performance Trend (YoY)</h3>
              <p className="text-sm text-gray-500">
                Monthly quality score comparison
                {highlightRange && (
                  <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                    Viewing: {highlightRange.x1}{highlightRange.x1 !== highlightRange.x2 ? ` – ${highlightRange.x2}` : ''}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Comparison Year Dropdown with Label */}
              <div className="flex items-center">
                <span className="text-sm text-gray-500 mr-2">Compare with:</span>
                <select
                  value={comparisonYear}
                  onChange={(e) => setComparisonYear(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-600 font-medium cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="none">None</option>
                  <option value="prev_year">{selectedYear - 1}</option>
                  {COMPARISON_YEARS.filter(y => y !== selectedYear && y !== selectedYear - 1).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 text-xs border-l border-gray-200 pl-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-teal-600 rounded"></span>
                  {selectedYear}
                </span>
                {comparisonYear !== 'none' && hasComparisonData && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-amber-500 rounded"></span>
                    {comparisonLabel}
                  </span>
                )}
                {annualTarget && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 bg-red-500 rounded"></span>
                    Target {annualTarget}%
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* No comparison data warning */}
          {comparisonYear !== 'none' && !hasComparisonData && (
            <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              ⚠️ No data available for {comparisonLabel}
            </div>
          )}
          
          <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yoyChartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => `${v}%`} width={40} />
              <Tooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    // Extract values for gap calculations
                    const currentVal = payload[0]?.value ?? null;
                    const prevVal = payload[1]?.value ?? null;
                    const targetRate = annualTarget || 80; // Use dynamic target or default to 80%
                    
                    // Calculate gaps
                    const canShowYoYGap = currentVal !== null && prevVal !== null && payload.length > 1;
                    const yoyGap = canShowYoYGap ? currentVal - prevVal : 0;
                    const targetGap = currentVal !== null ? currentVal - targetRate : null;
                    
                    // Helper for trend styling
                    const getTrend = (val) => ({
                      color: val >= 0 ? 'text-emerald-600' : 'text-red-600',
                      icon: val >= 0 ? '▲' : '▼',
                      prefix: val >= 0 ? '+' : ''
                    });
                    
                    const yoyTrend = getTrend(yoyGap);
                    const targetTrend = targetGap !== null ? getTrend(targetGap) : null;
                    
                    return (
                      <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg min-w-[180px]">
                        <p className="font-bold text-gray-700 mb-2 border-b pb-1">{`Month: ${label}`}</p>
                        {/* Individual year values */}
                        {payload.map((entry, index) => (
                          entry.value !== null && (
                            <div key={index} className="flex justify-between items-center text-sm mb-1">
                              <span style={{ color: entry.color }} className="font-medium mr-3">{entry.name}:</span>
                              <span className="font-bold">{entry.value}%</span>
                            </div>
                          )
                        ))}
                        {/* Target reference line */}
                        <div className="flex justify-between items-center text-sm mb-1 opacity-60">
                          <span className="font-medium mr-3 text-red-500">Target:</span>
                          <span className="font-bold text-red-500">{targetRate}%</span>
                        </div>
                        {/* Gap metrics */}
                        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                          {canShowYoYGap && (
                            <div className={`flex justify-between items-center text-sm font-bold ${yoyTrend.color}`}>
                              <span className="text-xs uppercase text-gray-500">YoY Gap:</span>
                              <span>{yoyTrend.prefix}{yoyGap.toFixed(0)}% {yoyTrend.icon}</span>
                            </div>
                          )}
                          {targetTrend && (
                            <div className={`flex justify-between items-center text-sm font-bold ${targetTrend.color}`}>
                              <span className="text-xs uppercase text-gray-500">vs Target:</span>
                              <span>{targetTrend.prefix}{targetGap.toFixed(0)}% {targetTrend.icon}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {/* Reference Area to highlight selected date range */}
              {highlightRange && (
                <ReferenceArea
                  x1={highlightRange.x1}
                  x2={highlightRange.x2}
                  fill="#dcfce7"
                  fillOpacity={0.5}
                  stroke="#86efac"
                  strokeOpacity={0.8}
                />
              )}
              {/* Target Reference Line */}
              {annualTarget && (
                <ReferenceLine
                  y={annualTarget}
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="8 4"
                  label={{ value: `Target ${annualTarget}%`, position: 'right', fill: '#ef4444', fontSize: 11 }}
                />
              )}
              <Line 
                type="monotone" 
                dataKey="main_value" 
                stroke="#0d9488" 
                strokeWidth={2.5} 
                dot={{ fill: '#0d9488', r: 4 }} 
                connectNulls 
                name={`${selectedYear}`} 
              />
              {comparisonYear !== 'none' && hasComparisonData && (
                <Line 
                  type="monotone" 
                  dataKey="compare_value" 
                  stroke="#f59e0b" 
                  strokeWidth={2} 
                  strokeDasharray="5 5" 
                  dot={{ fill: '#f59e0b', r: 3 }} 
                  connectNulls 
                  name={comparisonLabel} 
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          </div>
        </div>

        {/* Bottleneck Radar - Right Column */}
        <BottleneckChart 
          plans={!isHistoricalView ? filteredPlans : []} 
          getDeptName={getDeptName} 
          failureReasons={failureAnalysis.reasons}
        />
        </div>

        {/* Strategy Analysis - Combo Chart (Volume + Completion) */}
        {!isHistoricalView && filteredPlans.length > 0 && (
          <div className="mb-6">
            <StrategyComboChart plans={filteredPlans} />
          </div>
        )}

        {/* Performance by Department/PIC */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{orgTitle}</h3>
              <p className="text-sm text-gray-500">
                {orgChartData.length} items
                {isHistoricalView && orgMetric === 'department_code' && (
                  <span className="ml-2 text-amber-600 italic">(Historical avg.)</span>
                )}
              </p>
            </div>
            <ChartDropdown value={orgMetric} onChange={setOrgMetric} options={[{ value: 'department_code', label: 'Department' }, { value: 'pic', label: 'PIC' }]} />
          </div>
          {isHistoricalView && orgMetric === 'pic' ? (
            <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <div className="text-center px-6">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm font-medium">PIC breakdown not available</p>
                <p className="text-gray-400 text-xs mt-1">Historical data is stored at department level only</p>
              </div>
            </div>
          ) : (
            <PerformanceChart data={orgChartData} xKey="name" yKey="rate" height={300} hideHeader />
          )}
        </div>

        {/* Department Leaderboard */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />Department Leaderboard — {selectedYear}
              </h2>
              <p className="text-gray-500 text-sm">Ranked by quality score</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-700"></span> ≥90%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-700"></span> 70-89%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-700"></span> &lt;70%</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {filteredLeaderboard.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {selectedDept !== 'All' 
                  ? `No data for ${getDeptName(selectedDept)} in ${selectedYear}` 
                  : `No data for ${selectedYear}`}
              </div>
            ) : (
              filteredLeaderboard.map((dept, index) => (
                <div key={dept.code} className={`p-4 flex items-center gap-4 ${index < 3 && selectedDept === 'All' ? 'bg-gradient-to-r from-yellow-50/50 to-transparent' : ''}`}>
                  <div className="w-8 flex justify-center">{getRankIcon(index)}</div>
                  <div className="w-14 text-center"><span className="font-mono text-sm font-semibold bg-teal-100 text-teal-700 px-2 py-1 rounded">{dept.code}</span></div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{getDeptName(dept.code)}</p>
                    <p className="text-sm text-gray-500">
                      {dept.isHistorical 
                        ? <span className="text-amber-600 italic">Historical data</span>
                        : `${dept.achieved} of ${dept.total} achieved`
                      }
                    </p>
                  </div>
                  <div className="w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden relative">
                        {/* Target marker */}
                        {annualTarget && (
                          <div 
                            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" 
                            style={{ left: `${annualTarget}%` }}
                          />
                        )}
                        <div className="h-full rounded-full" style={{ width: `${dept.rate}%`, backgroundColor: dept.rate >= 90 ? '#15803d' : dept.rate >= 70 ? '#b45309' : '#b91c1c' }} />
                      </div>
                      <span className="text-sm font-bold w-12 text-right" style={{ color: dept.rate >= 90 ? '#15803d' : dept.rate >= 70 ? '#b45309' : '#b91c1c' }}>{dept.rate}%</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
      <ImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} onImportComplete={refetch} />
    </div>
  );
}
