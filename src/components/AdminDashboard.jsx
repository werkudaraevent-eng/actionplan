import { useState, useMemo, useEffect } from 'react';
import { 
  Target, TrendingUp, TrendingDown, CheckCircle2, Trophy, Medal, Award, Calendar, 
  X, Users, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Star, RotateCcw, Layers, PieChart as PieChartIcon, Activity, Clock
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine, BarChart, Bar, PieChart, Pie, Cell, LabelList } from 'recharts';
import { useActionPlans } from '../hooks/useActionPlans';
import { DEPARTMENTS, supabase } from '../lib/supabase';
import PerformanceChart from './PerformanceChart';
import StrategyComboChart from './StrategyComboChart';
import BottleneckChart from './BottleneckChart';
import KPICard, { TargetGapTooltip, ContributionTooltip, FailureRateTooltip, BreakdownTooltip } from './KPICard';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const MONTH_MAP = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
  'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
// Sort descending (newest first) for the comparison dropdown
const COMPARISON_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].sort((a, b) => b - a);

// Strict quarter-to-month mapping for ReferenceArea (no calculation, just lookup)
const QUARTER_RANGES = {
  Q1: { start: 'Jan', end: 'Mar' },
  Q2: { start: 'Apr', end: 'Jun' },
  Q3: { start: 'Jul', end: 'Sep' },
  Q4: { start: 'Oct', end: 'Dec' },
};

// Helper: Calculate start and end of week (Monday-Sunday) for a given date
function getWeekRange(date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return { startOfWeek: start, endOfWeek: end };
}

// Helper: Get ISO week number for a date
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Helper: Format date as "MMM d" (e.g., "Jan 13")
function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Helper: Format date as "MMM d, yyyy" (e.g., "Jan 19, 2026")
function formatFullDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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

// Sort dropdown for charts
function SortDropdown({ value, onChange }) {
  return (
    <div className="relative">
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 pr-6 text-xs text-gray-500 cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="high-low">↓ Highest</option>
        <option value="low-high">↑ Lowest</option>
        <option value="a-z">A → Z</option>
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
    </div>
  );
}


export default function AdminDashboard({ onNavigate }) {
  const { plans, loading, refetch } = useActionPlans(null);
  
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [startMonth, setStartMonth] = useState('Jan');
  const [endMonth, setEndMonth] = useState('Dec');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All'); // Category/Priority filter
  const [selectedPeriod, setSelectedPeriod] = useState('FY'); // 'FY', 'Q1', 'Q2', 'Q3', 'Q4', 'Custom'
  const [orgMetric, setOrgMetric] = useState('department_code');
  const [stratMetric, setStratMetric] = useState('goal_strategy');
  const [comparisonYear, setComparisonYear] = useState('prev_year');
  const [isCompletionView, setIsCompletionView] = useState(true); // false = Quality Score, true = Completion Rate
  
  // Weekly Activity Chart state
  const [currentDate, setCurrentDate] = useState(new Date()); // Reference date for week selection
  const [activityViewMode, setActivityViewMode] = useState('dept'); // 'dept' | 'daily'
  
  // Chart sorting state
  const [orgChartSort, setOrgChartSort] = useState('high-low'); // 'high-low' | 'low-high' | 'a-z'
  const [stratChartSort, setStratChartSort] = useState('high-low');
  const [focusAreaSort, setFocusAreaSort] = useState('high-low');
  const [categorySort, setCategorySort] = useState('high-low');
  
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

  // Filter by month range
  const dateFilteredPlans = useMemo(() => {
    const startIdx = MONTH_MAP[startMonth] ?? 0;
    const endIdx = MONTH_MAP[endMonth] ?? 11;
    return yearFilteredPlans.filter((plan) => {
      const planMonthIdx = MONTH_MAP[plan.month];
      if (planMonthIdx === undefined) return true;
      return planMonthIdx >= startIdx && planMonthIdx <= endIdx;
    });
  }, [yearFilteredPlans, startMonth, endMonth]);

  // Filter by department and category - exact match when specific values are selected
  const filteredPlans = useMemo(() => {
    return dateFilteredPlans.filter((plan) => {
      // Department filter
      if (selectedDept !== 'All' && plan.department_code !== selectedDept) return false;
      // Category/Priority filter - extract code from full category string
      if (selectedCategory !== 'All') {
        const planCategory = (plan.category || '').toUpperCase();
        const planCategoryCode = planCategory.split(/[\s(]/)[0];
        if (planCategoryCode !== selectedCategory.toUpperCase()) return false;
      }
      return true;
    });
  }, [dateFilteredPlans, selectedDept, selectedCategory]);

  // Also filter historical stats by department AND month range
  const filteredHistoricalStats = useMemo(() => {
    const startIdx = MONTH_MAP[startMonth] ?? 0;
    const endIdx = MONTH_MAP[endMonth] ?? 11;
    
    return historicalStats.filter((h) => {
      // Filter by department
      if (selectedDept !== 'All' && h.department_code !== selectedDept) return false;
      // Filter by month range (h.month is 1-12, convert to 0-11 for comparison)
      const monthIdx = h.month - 1;
      return monthIdx >= startIdx && monthIdx <= endIdx;
    });
  }, [historicalStats, selectedDept, startMonth, endMonth]);

  // Filter comparison historical stats by department AND month range
  const filteredComparisonHistorical = useMemo(() => {
    const startIdx = MONTH_MAP[startMonth] ?? 0;
    const endIdx = MONTH_MAP[endMonth] ?? 11;
    
    return comparisonHistorical.filter((h) => {
      // Filter by department
      if (selectedDept !== 'All' && h.department_code !== selectedDept) return false;
      // Filter by month range (h.month is 1-12, convert to 0-11 for comparison)
      const monthIdx = h.month - 1;
      return monthIdx >= startIdx && monthIdx <= endIdx;
    });
  }, [comparisonHistorical, selectedDept, startMonth, endMonth]);

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
        percentage: Number(((count  / failedPlans.length) * 100).toFixed(1))
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

  // Determine if we're in YTD mode (Full Year + Current Year)
  // YTD mode: Only count plans up to current month
  // Period mode: Respect the selected range without YTD cutoff
  const isYTDMode = selectedPeriod === 'FY' && selectedYear === CURRENT_YEAR;

  // Current month index for YTD calculations
  const currentMonthIndex = new Date().getMonth(); // 0 = Jan, 11 = Dec

  // EFFECTIVE PLANS: Apply YTD filtering for charts when in YTD mode
  // This ensures all charts show data only up to current month when viewing current year full year
  const effectivePlans = useMemo(() => {
    if (!isYTDMode) {
      // Period mode: use filteredPlans as-is (already filtered by selected period)
      return filteredPlans;
    }
    
    // YTD Mode: Filter to plans due on or before current month
    return filteredPlans.filter(p => {
      const planMonthIndex = MONTH_MAP[p.month];
      if (planMonthIndex === undefined) return true; // Include if month is unknown
      return planMonthIndex <= currentMonthIndex;
    });
  }, [filteredPlans, isYTDMode, currentMonthIndex]);

  // Calculate stats with hybrid data support - uses effectivePlans for YTD consistency
  const stats = useMemo(() => {
    const total = effectivePlans.length;
    const achieved = effectivePlans.filter((p) => p.status === 'Achieved').length;
    const inProgress = effectivePlans.filter((p) => p.status === 'On Progress').length;
    const pending = effectivePlans.filter((p) => p.status === 'Pending').length;
    const notAchieved = effectivePlans.filter((p) => p.status === 'Not Achieved').length;

    // Build department stats from real data - include both completion and score
    const deptMap = {};
    effectivePlans.forEach((plan) => {
      if (!deptMap[plan.department_code]) deptMap[plan.department_code] = { total: 0, achieved: 0, scores: [] };
      deptMap[plan.department_code].total++;
      if (plan.status === 'Achieved') deptMap[plan.department_code].achieved++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        deptMap[plan.department_code].scores.push(plan.quality_score);
      }
    });

    // Hybrid: For departments with no real data, use filtered historical stats
    const byDepartment = [];
    const processedDepts = new Set();

    // First, add departments with real data
    Object.entries(deptMap).forEach(([code, s]) => {
      const completion = s.total > 0 ? Number(((s.achieved / s.total) * 100).toFixed(1)) : 0;
      const score = s.scores.length > 0 ? Number((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1)) : 0;
      byDepartment.push({
        code,
        name: code,
        total: s.total,
        achieved: s.achieved,
        completion, // Completion rate
        score,      // Quality score
        rate: isCompletionView ? completion : score, // Dynamic based on toggle
        graded: s.scores.length,
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
      const completion = Number((data.sum / data.count).toFixed(1));
      byDepartment.push({
        code,
        name: code,
        total: 0,
        achieved: 0,
        completion, // Historical completion rate
        score: 0,   // No score data for historical
        rate: isCompletionView ? completion : 0, // Dynamic based on toggle
        graded: 0,
        isHistorical: true,
      });
    });

    // Sort by rate descending (rate is already dynamic based on isCompletionView)
    byDepartment.sort((a, b) => b.rate - a.rate);

    // Calculate overdue count (status != 'Achieved' AND month < current month)
    const overdue = effectivePlans.filter((p) => {
      if (p.status === 'Achieved') return false;
      const monthIndex = MONTH_MAP[p.month];
      if (monthIndex === undefined) return false;
      return monthIndex < currentMonthIndex;
    }).length;

    return { total, achieved, inProgress, pending, notAchieved, byDepartment, overdue };
  }, [effectivePlans, filteredHistoricalStats, isCompletionView, currentMonthIndex]);

  // Dynamic period label for UI display
  const periodLabel = useMemo(() => {
    // Specific period selected (Q1, Q2, etc. or custom range)
    if (selectedPeriod !== 'FY') {
      if (startMonth === endMonth) {
        return `${startMonth} ${selectedYear}`;
      }
      return `${startMonth} - ${endMonth} ${selectedYear}`;
    }
    
    // Full Year mode
    if (isYTDMode) {
      const currentMonthName = MONTHS_ORDER[currentMonthIndex];
      return `Jan - ${currentMonthName} ${selectedYear} (YTD)`;
    }
    
    // Past year - full year
    return `Full Year ${selectedYear}`;
  }, [selectedPeriod, selectedYear, startMonth, endMonth, isYTDMode, currentMonthIndex]);

  // Quality Score and Action Plan Completion stats
  // Uses effectivePlans which already has YTD filtering applied
  const qualityStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    
    // --- 1. COMPLETION RATE ---
    const achieved = effectivePlans.filter(p => p.status === 'Achieved').length;
    const statsTotal = effectivePlans.length;
    let completionRate = statsTotal > 0 
      ? Number(((achieved / statsTotal) * 100).toFixed(1)) 
      : 0;
    
    // --- 2. QUALITY SCORE ---
    const gradedItems = effectivePlans.filter(p => 
      p.submission_status === 'submitted' && p.quality_score != null
    );
    let qualityScore = gradedItems.length > 0 
      ? Number((gradedItems.reduce((sum, p) => sum + p.quality_score, 0) / gradedItems.length).toFixed(1))
      : null;
    let gradedCount = gradedItems.length;
    
    // --- 3. HISTORICAL FALLBACK (From database historical_stats table) ---
    // When no real data exists AND viewing a past year, calculate from fetched historical_stats
    // NOTE: Quality Score system did not exist prior to 2026, so NO score data for past years
    if (statsTotal === 0 && selectedYear < currentYear && filteredHistoricalStats.length > 0) {
      // Calculate company-wide average completion rate from historical_stats
      const avgCompletion = filteredHistoricalStats.reduce((sum, h) => sum + h.completion_rate, 0) / filteredHistoricalStats.length;
      completionRate = Number(avgCompletion.toFixed(1));
      // qualityScore remains null for historical years (displays as "—" in UI)
    }
    
    return { 
      completionRate, // Will use database historical_stats for historical years
      qualityScore,   // Will be null for historical years (no score system existed)
      gradedCount, 
      achievedCount: achieved,
      ytdTotal: statsTotal,
      isYTD: isYTDMode && statsTotal > 0 // Flag to show (YTD) label in UI
    };
  }, [effectivePlans, selectedYear, filteredHistoricalStats, isYTDMode]);

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
  // Supports both Completion Rate and Quality Score metrics
  const yoyChartData = useMemo(() => {
    // Build current year data from real plans (already filtered by dept search)
    const currentYearMap = {};
    filteredPlans.forEach((plan) => {
      const month = plan.month;
      if (!currentYearMap[month]) currentYearMap[month] = { total: 0, achieved: 0, scores: [] };
      currentYearMap[month].total++;
      if (plan.status === 'Achieved') currentYearMap[month].achieved++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        currentYearMap[month].scores.push(plan.quality_score);
      }
    });
    
    // Build comparison year data from real plans (already filtered by dept search)
    const comparisonMap = {};
    comparisonPlans.forEach((plan) => {
      const month = plan.month;
      if (!comparisonMap[month]) comparisonMap[month] = { total: 0, achieved: 0, scores: [] };
      comparisonMap[month].total++;
      if (plan.status === 'Achieved') comparisonMap[month].achieved++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        comparisonMap[month].scores.push(plan.quality_score);
      }
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
      
      // COMPLETION RATE: Use real data if available, otherwise fall back to historical
      let mainCompletion = null;
      if (curr && curr.total > 0) {
        mainCompletion = Number(((curr.achieved / curr.total) * 100).toFixed(1));
      } else if (historicalMap[month]) {
        mainCompletion = Number((historicalMap[month].sum / historicalMap[month].count).toFixed(1));
      }

      let compareCompletion = null;
      if (comp && comp.total > 0) {
        compareCompletion = Number(((comp.achieved / comp.total) * 100).toFixed(1));
      } else if (compHistoricalMap[month]) {
        compareCompletion = Number((compHistoricalMap[month].sum / compHistoricalMap[month].count).toFixed(1));
      }

      // QUALITY SCORE: Only from real data (no historical quality scores exist pre-2026)
      let mainScore = null;
      if (curr && curr.scores.length > 0) {
        mainScore = Number((curr.scores.reduce((a, b) => a + b, 0) / curr.scores.length).toFixed(1));
      }

      let compareScore = null;
      if (comp && comp.scores.length > 0) {
        compareScore = Number((comp.scores.reduce((a, b) => a + b, 0) / comp.scores.length).toFixed(1));
      }

      return {
        month,
        // Completion Rate values
        main_completion: mainCompletion,
        compare_completion: compareCompletion,
        // Quality Score values
        main_score: mainScore,
        compare_score: compareScore,
        // Legacy keys for backward compatibility (will be removed after chart update)
        main_value: mainCompletion,
        compare_value: compareCompletion,
      };
    });
  }, [filteredPlans, comparisonPlans, filteredHistoricalStats, filteredComparisonHistorical]);

  // Check if we have any comparison data (real or historical)
  const hasComparisonData = comparisonPlans.length > 0 || filteredComparisonHistorical.length > 0;
  const comparisonLabel = comparisonYearValue ? `${comparisonYearValue}` : null;

  // Calculate highlight range for ReferenceArea using month range
  const highlightRange = useMemo(() => {
    // If full year selected (Jan-Dec), no highlight needed
    if (startMonth === 'Jan' && endMonth === 'Dec') return null;
    return { x1: startMonth, x2: endMonth };
  }, [startMonth, endMonth]);

  // Org Chart Data - with historical fallback - Now includes both completion and score
  // Uses effectivePlans to respect YTD filtering
  const orgChartData = useMemo(() => {
    // If we have real plans, use them
    if (effectivePlans.length > 0) {
      const dataMap = {};
      effectivePlans.forEach((plan) => {
        let key = orgMetric === 'department_code' ? (plan.department_code || 'Unknown') : (plan.pic?.trim() || 'Unassigned');
        const shortName = key.length > 20 ? key.substring(0, 17) + '...' : key;
        if (!dataMap[shortName]) dataMap[shortName] = { total: 0, achieved: 0, scores: [], fullName: orgMetric === 'department_code' ? getDeptName(key) : key };
        dataMap[shortName].total++;
        if (plan.status === 'Achieved') dataMap[shortName].achieved++;
        // Track quality scores for graded items
        if (plan.submission_status === 'submitted' && plan.quality_score != null) {
          dataMap[shortName].scores.push(plan.quality_score);
        }
      });
      return Object.entries(dataMap).map(([name, s]) => ({ 
        name, 
        fullName: s.fullName, 
        // Score metric
        score: s.scores.length > 0 ? Number((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1)) : 0,
        // Completion metric
        completion: s.total > 0 ? Number(((s.achieved / s.total) * 100).toFixed(1)) : 0,
        // Rate is dynamic based on isCompletionView
        rate: isCompletionView 
          ? (s.total > 0 ? Number(((s.achieved / s.total) * 100).toFixed(1)) : 0)
          : (s.scores.length > 0 ? Number((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1)) : 0),
        total: s.total, 
        achieved: s.achieved,
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
        completion: Number((data.sum / data.count).toFixed(1)),
        score: 0, // No score data for historical
        rate: isCompletionView ? Number((data.sum / data.count).toFixed(1)) : 0,
        total: 0,
        achieved: 0,
        graded: 0,
        isHistorical: true,
      })).sort((a, b) => b.rate - a.rate);
    }
    
    return [];
  }, [effectivePlans, orgMetric, filteredHistoricalStats, isCompletionView]);

  // Strategy Chart Data - Now includes both completion and score
  // Uses effectivePlans to respect YTD filtering
  const stratChartData = useMemo(() => {
    const dataMap = {};
    effectivePlans.forEach((plan) => {
      let key = stratMetric === 'goal_strategy' ? (plan.goal_strategy?.trim() || 'Uncategorized') : (plan.report_format?.trim() || 'No Format');
      const shortName = key.length > 20 ? key.substring(0, 17) + '...' : key;
      if (!dataMap[shortName]) dataMap[shortName] = { total: 0, achieved: 0, scores: [], fullName: key };
      dataMap[shortName].total++;
      if (plan.status === 'Achieved') dataMap[shortName].achieved++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        dataMap[shortName].scores.push(plan.quality_score);
      }
    });
    return Object.entries(dataMap).map(([name, s]) => ({ 
      name, 
      fullName: s.fullName, 
      // Score metric
      score: s.scores.length > 0 ? Number((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1)) : 0,
      // Completion metric
      completion: s.total > 0 ? Number(((s.achieved / s.total) * 100).toFixed(1)) : 0,
      // Rate is dynamic based on isCompletionView
      rate: isCompletionView 
        ? (s.total > 0 ? Number(((s.achieved / s.total) * 100).toFixed(1)) : 0)
        : (s.scores.length > 0 ? Number((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1)) : 0),
      total: s.total, 
      achieved: s.achieved,
      graded: s.scores.length 
    })).sort((a, b) => b.rate - a.rate);
  }, [effectivePlans, stratMetric, isCompletionView]);

  // Strategic Performance Stats - Focus Area and Category (Performance-based, not just volume)
  // Uses effectivePlans to respect YTD filtering
  const focusAreaStats = useMemo(() => {
    const areaMap = {};
    effectivePlans.forEach((plan) => {
      const area = plan.area_focus?.trim() || 'Unspecified';
      if (!areaMap[area]) areaMap[area] = { total: 0, achieved: 0, scores: [] };
      areaMap[area].total++;
      if (plan.status === 'Achieved') areaMap[area].achieved++;
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        areaMap[area].scores.push(plan.quality_score);
      }
    });
    
    // Convert to array with performance metrics
    const sorted = Object.entries(areaMap)
      .map(([name, data]) => ({ 
        name: name.length > 28 ? name.substring(0, 25) + '...' : name, 
        fullName: name,
        volume: data.total,
        achieved: data.achieved,
        completionRate: data.total > 0 ? Number(((data.achieved / data.total) * 100).toFixed(1)) : 0,
        avgScore: data.scores.length > 0 ? Number((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1)) : null,
        graded: data.scores.length,
        // Dynamic rate based on view mode
        rate: isCompletionView 
          ? (data.total > 0 ? Number(((data.achieved / data.total) * 100).toFixed(1)) : 0)
          : (data.scores.length > 0 ? Number((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1)) : 0)
      }))
      .sort((a, b) => b.rate - a.rate); // Sort by performance, not volume
    
    // Take top 7 items
    return sorted.slice(0, 7);
  }, [effectivePlans, isCompletionView]);

  // Category/Priority Performance Stats
  const CATEGORY_COLORS = {
    'UH': '#e11d48', // Rose-600 (Ultra High)
    'H': '#f97316',  // Orange-500 (High)
    'M': '#3b82f6',  // Blue-500 (Medium)
    'L': '#64748b',  // Slate-500 (Low)
    'Unspecified': '#d1d5db' // Gray-300
  };
  
  const categoryStats = useMemo(() => {
    const catMap = {};
    effectivePlans.forEach((plan) => {
      // Extract category code from full string (e.g., "UH (Ultra High)" -> "UH")
      const rawCat = (plan.category || '').toUpperCase().trim();
      const cat = rawCat.split(/[\s(]/)[0] || 'Unspecified';
      
      if (!catMap[cat]) catMap[cat] = { total: 0, achieved: 0, scores: [] };
      catMap[cat].total++;
      if (plan.status === 'Achieved') catMap[cat].achieved++;
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        catMap[cat].scores.push(plan.quality_score);
      }
    });
    
    // Define priority order (UH at top, L at bottom)
    const priorityOrder = ['UH', 'H', 'M', 'L', 'UNSPECIFIED'];
    
    return priorityOrder
      .filter(cat => catMap[cat] && catMap[cat].total > 0)
      .map(cat => {
        const data = catMap[cat];
        const displayName = cat === 'UH' ? 'Ultra High' : cat === 'H' ? 'High' : cat === 'M' ? 'Medium' : cat === 'L' ? 'Low' : 'Unspecified';
        return {
          name: displayName,
          shortName: cat,
          volume: data.total,
          achieved: data.achieved,
          completionRate: data.total > 0 ? Number(((data.achieved / data.total) * 100).toFixed(1)) : 0,
          avgScore: data.scores.length > 0 ? Number((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1)) : null,
          graded: data.scores.length,
          color: CATEGORY_COLORS[cat] || '#d1d5db',
          // Dynamic rate based on view mode
          rate: isCompletionView 
            ? (data.total > 0 ? Number(((data.achieved / data.total) * 100).toFixed(1)) : 0)
            : (data.scores.length > 0 ? Number((data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(1)) : 0)
        };
      });
  }, [effectivePlans, isCompletionView]);

  // Check if viewing historical year with no real data
  const isHistoricalView = effectivePlans.length === 0 && filteredHistoricalStats.length > 0;

  // Weekly Activity Pulse - Track updates for selected week with view mode support
  // Uses filteredPlans to respect global filters (Dept, Priority, Month)
  const weeklyActivityData = useMemo(() => {
    const { startOfWeek, endOfWeek } = getWeekRange(currentDate);
    
    // Filter plans updated within the selected week range (from already filtered data)
    const weekPlans = filteredPlans.filter(p => {
      if (!p.updated_at) return false;
      const updateDate = new Date(p.updated_at);
      return updateDate >= startOfWeek && updateDate <= endOfWeek;
    });
    
    let chartData;
    
    if (activityViewMode === 'dept') {
      // Group by department
      const deptActivity = {};
      weekPlans.forEach(plan => {
        const dept = plan.department_code || 'Unknown';
        deptActivity[dept] = (deptActivity[dept] || 0) + 1;
      });
      
      // Convert to chart data and sort by activity count
      chartData = Object.entries(deptActivity)
        .map(([name, value]) => ({
          name,
          value,
          fill: value >= 10 ? '#059669' : value >= 5 ? '#3b82f6' : value > 0 ? '#f59e0b' : '#d1d5db'
        }))
        .sort((a, b) => b.value - a.value);
    } else {
      // Group by day of week (daily trend view)
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayActivity = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
      
      weekPlans.forEach(plan => {
        const updateDate = new Date(plan.updated_at);
        const dayIndex = (updateDate.getDay() + 6) % 7; // Convert to Mon=0
        const dayName = dayNames[dayIndex];
        dayActivity[dayName]++;
      });
      
      chartData = dayNames.map(day => ({
        name: day,
        value: dayActivity[day],
        fill: dayActivity[day] >= 10 ? '#059669' : dayActivity[day] >= 5 ? '#3b82f6' : dayActivity[day] > 0 ? '#f59e0b' : '#d1d5db'
      }));
    }
    
    // Get top 5 most recent updates for the feed
    const recentUpdates = [...weekPlans]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5);
    
    return {
      chartData,
      recentUpdates,
      totalUpdates: weekPlans.length,
      activeDepts: new Set(weekPlans.map(p => p.department_code)).size,
      startOfWeek,
      endOfWeek
    };
  }, [filteredPlans, currentDate, activityViewMode]);

  // Helper: Format relative time (e.g., "2 hours ago")
  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Leaderboard is now just the stats.byDepartment (filtering is done at the data level)
  const filteredLeaderboard = stats.byDepartment;

  function getDeptName(code) { const dept = DEPARTMENTS.find((d) => d.code === code); return dept ? dept.name : code; }
  const getRankIcon = (index) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-gray-400 font-medium">{index + 1}</span>;
  };

  const hasActiveFilters = (startMonth !== 'Jan' || endMonth !== 'Dec') || selectedDept !== 'All' || selectedCategory !== 'All' || selectedYear !== CURRENT_YEAR || selectedPeriod !== 'FY';
  const clearDateFilters = () => { setStartMonth('Jan'); setEndMonth('Dec'); setSelectedPeriod('FY'); };
  const clearDeptFilter = () => { setSelectedDept('All'); };
  const clearCategoryFilter = () => { setSelectedCategory('All'); };
  
  // Reset all filters to default state
  const resetFilters = () => {
    setSelectedYear(CURRENT_YEAR);
    setSelectedDept('All');
    setSelectedCategory('All');
    setSelectedPeriod('FY');
    setStartMonth('Jan');
    setEndMonth('Dec');
  };
  
  // Period change handler - updates month range based on selection
  const handlePeriodChange = (period) => {
    setSelectedPeriod(period);
    if (period === 'FY') {
      setStartMonth('Jan');
      setEndMonth('Dec');
    } else if (period === 'Q1') {
      setStartMonth('Jan');
      setEndMonth('Mar');
    } else if (period === 'Q2') {
      setStartMonth('Apr');
      setEndMonth('Jun');
    } else if (period === 'Q3') {
      setStartMonth('Jul');
      setEndMonth('Sep');
    } else if (period === 'Q4') {
      setStartMonth('Oct');
      setEndMonth('Dec');
    }
    // 'Custom' - don't change months, let user pick manually
  };

  // Week navigation handlers for Activity Chart
  const handlePrevWeek = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 7);
      return newDate;
    });
  };

  const handleNextWeek = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 7);
      return newDate;
    });
  };
  
  const getDateRangeLabel = () => {
    if (startMonth === 'Jan' && endMonth === 'Dec') return 'Full Year';
    if (startMonth === endMonth) return startMonth;
    return `${startMonth} – ${endMonth}`;
  };

  // Helper: Sort chart data by different criteria
  const sortChartData = (data, sortMode) => {
    const sorted = [...data]; // Copy array to avoid mutations
    switch (sortMode) {
      case 'high-low':
        return sorted.sort((a, b) => b.rate - a.rate);
      case 'low-high':
        return sorted.sort((a, b) => a.rate - b.rate);
      case 'a-z':
        return sorted.sort((a, b) => (a.fullName || a.name).localeCompare(b.fullName || b.name));
      default:
        return sorted;
    }
  };

  // Apply sorting to chart data
  const sortedOrgChartData = useMemo(() => sortChartData(orgChartData, orgChartSort), [orgChartData, orgChartSort]);
  const sortedStratChartData = useMemo(() => sortChartData(stratChartData, stratChartSort), [stratChartData, stratChartSort]);
  const sortedFocusAreaStats = useMemo(() => sortChartData(focusAreaStats, focusAreaSort), [focusAreaStats, focusAreaSort]);
  const sortedCategoryStats = useMemo(() => sortChartData(categoryStats, categorySort), [categoryStats, categorySort]);

  // Dynamic titles based on isCompletionView toggle
  const activeMetricLabel = isCompletionView ? 'Completion Rate' : 'Quality Score';
  const orgTitle = orgMetric === 'department_code' ? `${activeMetricLabel} by Department` : `${activeMetricLabel} by PIC`;
  const stratTitle = stratMetric === 'goal_strategy' ? `${activeMetricLabel} by Strategy` : `${activeMetricLabel} by Report Format`;

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
      {/* Unified Sticky Header - Title + All Filters */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Left: Title */}
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Company Dashboard</h1>
            <p className="text-gray-500 text-sm">
              Executive Performance Overview — FY {selectedYear}
              <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
                📅 {periodLabel}
              </span>
            </p>
          </div>
          
          {/* Right: All Filters - Compact Layout */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Year Selector */}
            <Select 
              value={selectedYear.toString()} 
              onValueChange={(val) => { setSelectedYear(parseInt(val)); clearDateFilters(); }}
            >
              <SelectTrigger className="w-[120px] h-8 text-sm pl-3">
                <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {AVAILABLE_YEARS.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Department Selector */}
            <Select value={selectedDept} onValueChange={setSelectedDept}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue placeholder="All Depts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Departments</SelectItem>
                {DEPARTMENTS.map((dept) => (
                  <SelectItem key={dept.code} value={dept.code}>
                    {dept.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Category/Priority Selector */}
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-[130px] h-8 text-sm">
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Priorities</SelectItem>
                <SelectItem value="UH">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    UH (Ultra High)
                  </span>
                </SelectItem>
                <SelectItem value="H">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    H (High)
                  </span>
                </SelectItem>
                <SelectItem value="M">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    M (Medium)
                  </span>
                </SelectItem>
                <SelectItem value="L">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                    L (Low)
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            
            {/* Period Selector (Unified) */}
            <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[120px] h-8 text-sm bg-slate-50">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FY">Full Year</SelectItem>
                <SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem>
                <SelectItem value="Q2">Q2 (Apr-Jun)</SelectItem>
                <SelectItem value="Q3">Q3 (Jul-Sep)</SelectItem>
                <SelectItem value="Q4">Q4 (Oct-Dec)</SelectItem>
                <SelectItem value="Custom">Custom...</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Custom Month Pickers (Only show if Custom) */}
            {selectedPeriod === 'Custom' && (
              <div className="flex items-center gap-1">
                <Select value={startMonth} onValueChange={setStartMonth}>
                  <SelectTrigger className="w-[70px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS_ORDER.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-gray-400 text-sm">–</span>
                <Select value={endMonth} onValueChange={setEndMonth}>
                  <SelectTrigger className="w-[70px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS_ORDER.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="h-6 w-px bg-gray-200"></div>
            
            {/* Global View Mode Toggle (Switch) */}
            <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-gray-200">
              <Label 
                htmlFor="view-mode-switch" 
                className={`text-xs font-medium cursor-pointer transition-colors ${!isCompletionView ? 'text-purple-600' : 'text-gray-400'}`}
                onClick={() => setIsCompletionView(false)}
              >
                Score
              </Label>
              <Switch 
                id="view-mode-switch" 
                checked={isCompletionView}
                onCheckedChange={setIsCompletionView}
                className={isCompletionView ? 'bg-emerald-500' : 'bg-purple-500'}
              />
              <Label 
                htmlFor="view-mode-switch" 
                className={`text-xs font-medium cursor-pointer transition-colors ${isCompletionView ? 'text-emerald-600' : 'text-gray-400'}`}
                onClick={() => setIsCompletionView(true)}
              >
                Completion
              </Label>
            </div>
            
            {/* Reset Filters Button (Only show when filters are active) */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                title="Reset all filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>
        
        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Filters:</span>
            {selectedYear !== CURRENT_YEAR && (
              <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full">
                {selectedYear}
              </span>
            )}
            {selectedDept !== 'All' && (
              <span className="px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-full flex items-center gap-1">
                {getDeptName(selectedDept)} ({selectedDept})
                <button onClick={clearDeptFilter} className="hover:text-teal-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedCategory !== 'All' && (
              <span className="px-2 py-1 bg-rose-50 text-rose-700 text-xs rounded-full flex items-center gap-1">
                Priority: {selectedCategory === 'UH' ? 'Ultra High' : selectedCategory === 'H' ? 'High' : selectedCategory === 'M' ? 'Medium' : 'Low'}
                <button onClick={clearCategoryFilter} className="hover:text-rose-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            {selectedPeriod !== 'FY' && (
              <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full flex items-center gap-1">
                {selectedPeriod === 'Custom' ? getDateRangeLabel() : selectedPeriod}
                <button onClick={clearDateFilters} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            )}
            <span className="text-xs text-gray-400 ml-auto">{filteredPlans.length} plans</span>
          </div>
        )}
      </header>

      <main className="p-6">
        {/* KPI Cards - Executive View Layout with Premium Design */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          {/* 1. Completion Rate - THE HERO METRIC */}
          <KPICard
            gradient="from-green-500 to-green-600"
            icon={CheckCircle2}
            value={`${qualityStats.completionRate}%`}
            label={`Completion${qualityStats.isYTD ? ' (YTD)' : ''}`}
            labelColor="text-green-100"
            size="compact"
            footerContent={(() => {
              const target = 80;
              const gap = Number((qualityStats.completionRate - target).toFixed(1));
              const isPositive = gap >= 0;
              return (
                <div className="space-y-2">
                  <div className="w-full bg-black/10 rounded-full h-1.5 relative">
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-white/60 z-10" 
                      style={{ left: `${target}%` }}
                    />
                    <div 
                      className="bg-white/80 h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min(qualityStats.completionRate, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[8px] uppercase text-white/50">Target: {target}%</span>
                    <div className={`flex items-center gap-0.5 font-bold ${isPositive ? 'text-emerald-100' : 'text-rose-100'}`}>
                      {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      <span>{isPositive ? '+' : ''}{gap}%</span>
                      <span className="text-[8px] uppercase text-white/50 ml-0.5">Gap</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">
                  Action Plan Completion {qualityStats.isYTD ? '(YTD)' : ''}
                </p>
                <p><span className="font-bold text-green-400">{qualityStats.achievedCount} of {qualityStats.ytdTotal}</span> plans achieved</p>
                <p className="text-xs text-gray-400">Company Target: 80%</p>
                <p className="text-xs text-gray-500 mt-1">Formula: {qualityStats.achievedCount} ÷ {qualityStats.ytdTotal} × 100</p>
              </div>
            }
          />
          
          {/* 2. Quality Score */}
          <KPICard
            gradient={qualityStats.qualityScore === null ? 'from-gray-400 to-gray-500' : 
              qualityStats.qualityScore >= 80 ? 'from-purple-500 to-purple-600' : 
              qualityStats.qualityScore >= 60 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600'}
            icon={Star}
            value={qualityStats.qualityScore !== null ? `${qualityStats.qualityScore}%` : '—'}
            label={`Quality Score${qualityStats.isYTD ? ' (YTD)' : ''}`}
            labelColor="text-white/90"
            size="compact"
            comparison={qualityStats.qualityScore !== null ? {
              prevValue: 72, // Mock previous year (replace with real data)
              target: 80
            } : undefined}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">
                  Performance Quality {qualityStats.isYTD ? '(YTD)' : ''}
                </p>
                <p>Average: <span className={`font-bold ${qualityStats.qualityScore >= 80 ? 'text-green-400' : qualityStats.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {qualityStats.qualityScore !== null ? `${qualityStats.qualityScore}%` : 'N/A'}
                </span></p>
                <p className="text-xs text-gray-400">Based on {qualityStats.gradedCount} graded items</p>
                <p className="text-xs text-gray-400 mt-1">Previous year: 72%</p>
              </div>
            }
          />
          
          {/* 3. Total Plans */}
          <KPICard
            gradient="from-teal-500 to-teal-600"
            icon={Target}
            value={stats.total}
            label="Total Plans"
            labelColor="text-teal-100"
            size="compact"
            footerContent={(
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-200" />
                  <span className="font-bold text-white/90">{stats.achieved + stats.notAchieved}</span>
                  <span className="text-[8px] uppercase text-white/50">Done</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-2.5 h-2.5 text-amber-200" />
                  <span className="font-bold text-white/90">{stats.inProgress + stats.pending}</span>
                  <span className="text-[8px] uppercase text-white/50">Open</span>
                </div>
              </div>
            )}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Total Action Plans</p>
                <p><span className="font-bold text-teal-400">{stats.total}</span> plans for this period</p>
                <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                  <p>• Ongoing: {stats.inProgress + stats.pending} ({stats.inProgress} active, {stats.pending} pending)</p>
                  <p>• Finalized: {stats.achieved + stats.notAchieved} ({stats.achieved} achieved, {stats.notAchieved} failed)</p>
                </div>
              </div>
            }
            onClick={onNavigate && stats.total > 0 ? () => onNavigate('all-plans', { statusFilter: '' }) : undefined}
          />
          
          {/* 4. Achieved */}
          <KPICard
            gradient="from-emerald-500 to-emerald-600"
            icon={CheckCircle2}
            value={stats.achieved}
            label="Achieved"
            labelColor="text-emerald-100"
            size="compact"
            footerContent={stats.total > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Users className="w-2.5 h-2.5 text-emerald-200" />
                <span className="font-bold text-white/90">{Number(((stats.achieved  / stats.total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            )}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Achieved Plans</p>
                <p><span className="font-bold text-green-400">{stats.achieved} of {stats.total}</span> plans achieved</p>
                <p className="text-xs text-gray-400">Contribution: {stats.total > 0 ? ((stats.achieved / stats.total) * 100).toFixed(1) : 0}% of total</p>
                {onNavigate && stats.achieved > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to view details →</p>
                )}
              </div>
            }
            onClick={onNavigate && stats.achieved > 0 ? () => onNavigate('all-plans', { statusFilter: 'Achieved' }) : undefined}
          />
          
          {/* 5. In Progress */}
          <KPICard
            gradient="from-amber-500 to-amber-600"
            icon={TrendingUp}
            value={stats.inProgress}
            label="In Progress"
            labelColor="text-amber-100"
            size="compact"
            footerContent={stats.total > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <Users className="w-2.5 h-2.5 text-amber-200" />
                <span className="font-bold text-white/90">{Number(((stats.inProgress  / stats.total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            )}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Work in Progress</p>
                <p><span className="font-bold text-amber-400">{stats.inProgress} of {stats.total}</span> plans active</p>
                <p className="text-xs text-gray-400">Contribution: {stats.total > 0 ? ((stats.inProgress / stats.total) * 100).toFixed(1) : 0}% of total</p>
                {onNavigate && stats.inProgress > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to view details →</p>
                )}
              </div>
            }
            onClick={onNavigate && stats.inProgress > 0 ? () => onNavigate('all-plans', { statusFilter: 'On Progress' }) : undefined}
          />
          
          {/* 6. Not Achieved */}
          <KPICard
            gradient={stats.notAchieved > 0 ? 'from-red-500 to-red-600' : 'from-gray-400 to-gray-500'}
            icon={AlertTriangle}
            value={stats.notAchieved}
            label="Not Achieved"
            labelColor={stats.notAchieved > 0 ? 'text-red-100' : 'text-gray-200'}
            size="compact"
            footerContent={stats.total > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <AlertTriangle className="w-2.5 h-2.5 text-rose-200" />
                <span className="font-bold text-white/90">{Number(((stats.notAchieved  / stats.total) * 100).toFixed(1))}%</span>
                <span className="text-[8px] uppercase text-white/50">of Total</span>
              </div>
            )}
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Failed Plans</p>
                <p><span className="font-bold text-red-400">{stats.notAchieved} of {stats.total}</span> plans not achieved</p>
                <p className="text-xs text-gray-400">Contribution: {stats.total > 0 ? ((stats.notAchieved / stats.total) * 100).toFixed(1) : 0}% of total</p>
                {failureAnalysis.topBlocker && (
                  <p className="text-xs text-red-300 mt-1">⚠️ Top Issue: {failureAnalysis.topBlocker.reason}</p>
                )}
                {onNavigate && stats.notAchieved > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to view details →</p>
                )}
              </div>
            }
            onClick={onNavigate && stats.notAchieved > 0 ? () => onNavigate('all-plans', { statusFilter: 'Not Achieved' }) : undefined}
          />
        </div>

        {/* Weekly Activity Pulse - Real-time department engagement tracking */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* CHART: Department Activity Bar Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-800">Department Activity Pulse</h3>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {formatShortDate(weeklyActivityData.startOfWeek)} - {formatFullDate(weeklyActivityData.endOfWeek)}
                  <span className="ml-2 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full font-medium">
                    {weeklyActivityData.totalUpdates} updates
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 p-1 rounded-lg border border-gray-200">
                {/* VIEW TOGGLE */}
                <div className="flex bg-white rounded shadow-sm">
                  <button 
                    onClick={() => setActivityViewMode('dept')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-l ${activityViewMode === 'dept' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    By Dept
                  </button>
                  <button 
                    onClick={() => setActivityViewMode('daily')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-r border-l ${activityViewMode === 'daily' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    Daily Trend
                  </button>
                </div>
                {/* WEEK NAVIGATOR */}
                <div className="flex items-center gap-1">
                  <button onClick={handlePrevWeek} className="p-1 hover:bg-gray-200 rounded">
                    <ChevronLeft size={16} className="text-gray-600" />
                  </button>
                  <span className="text-xs font-bold w-16 text-center text-gray-700">Week {getWeekNumber(currentDate)}</span>
                  <button onClick={handleNextWeek} className="p-1 hover:bg-gray-200 rounded">
                    <ChevronRight size={16} className="text-gray-600" />
                  </button>
                </div>
              </div>
            </div>
            
            {/* Color Legend */}
            <div className="flex items-center gap-3 text-xs mb-4">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600"></span> ≥10</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500"></span> 5-9</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500"></span> 1-4</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-300"></span> 0</span>
            </div>
            
            {weeklyActivityData.chartData.length > 0 ? (
              <div className="h-[220px] w-full">
                <ResponsiveContainer>
                  <BarChart data={weeklyActivityData.chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis 
                      allowDecimals={false} 
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      width={30}
                    />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const label = activityViewMode === 'dept' 
                            ? `${getDeptName(data.name)} (${data.name})`
                            : data.name;
                          return (
                            <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg">
                              <p className="font-medium text-gray-800">{label}</p>
                              <p className="text-sm text-gray-600 mt-1">
                                <span className="font-bold text-blue-600">{data.value}</span> updates
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                      {weeklyActivityData.chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                      <LabelList dataKey="value" position="top" fill="#374151" fontSize={11} fontWeight={600} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <div className="text-center">
                  <Activity className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm font-medium">No activity recorded</p>
                  <p className="text-gray-400 text-xs mt-1">No plan updates for this week</p>
                </div>
              </div>
            )}
          </div>

          {/* LIST: Recent Activity Feed */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-gray-500" />
              <h3 className="text-lg font-semibold text-gray-800">Latest Updates</h3>
            </div>
            
            <div className="space-y-3 overflow-y-auto max-h-[250px] pr-2 custom-scrollbar">
              {weeklyActivityData.recentUpdates.length > 0 ? (
                weeklyActivityData.recentUpdates.map((plan) => (
                  <div key={plan.id} className="flex gap-3 items-start border-b border-gray-50 pb-3 last:border-0">
                    <div className={`w-2 h-2 mt-2 rounded-full shrink-0 ${
                      plan.status === 'Achieved' ? 'bg-emerald-500' :
                      plan.status === 'On Progress' ? 'bg-amber-500' :
                      plan.status === 'Not Achieved' ? 'bg-red-500' : 'bg-gray-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800 truncate">{plan.pic || 'Unknown'}</p>
                        <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded font-medium shrink-0">
                          {plan.department_code}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5" title={plan.action_plan}>
                        {plan.action_plan || plan.goal_strategy || 'Untitled plan'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-400">{formatRelativeTime(plan.updated_at)}</span>
                        <span className="text-[10px] text-gray-300">•</span>
                        <span className={`text-[10px] font-medium ${
                          plan.status === 'Achieved' ? 'text-emerald-600' :
                          plan.status === 'On Progress' ? 'text-amber-600' :
                          plan.status === 'Not Achieved' ? 'text-red-600' : 'text-gray-500'
                        }`}>
                          {plan.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center">
                  <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 italic">No activity recorded this week</p>
                </div>
              )}
            </div>
            
            {weeklyActivityData.recentUpdates.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">
                  {weeklyActivityData.activeDepts} active department{weeklyActivityData.activeDepts !== 1 ? 's' : ''} this week
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Decision Layer: YoY Trend (2/3) + Bottleneck Radar (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        
        {/* YoY Trend Chart - Left Column (Span 2) */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5 h-[340px] flex flex-col">
          {/* Chart Header */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Performance Trend (YoY)</h3>
              <p className="text-sm text-gray-500">
                Monthly {isCompletionView ? 'completion rate' : 'quality score'} comparison
                {highlightRange && (
                  <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                    Viewing: {highlightRange.x1}{highlightRange.x1 !== highlightRange.x2 ? ` – ${highlightRange.x2}` : ''}
                  </span>
                )}
              </p>
            </div>
            
            {/* Comparison Year Dropdown + Legend */}
            <div className="flex items-center gap-3">
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
          
          {/* Quality Score not available for historical years warning */}
          {!isCompletionView && selectedYear < 2026 && (
            <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              ℹ️ Quality Score system was introduced in 2026. No score data available for {selectedYear}.
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
                    
                    // Calculate gaps with precision formatting
                    const canShowYoYGap = currentVal !== null && prevVal !== null && payload.length > 1;
                    const yoyGap = canShowYoYGap ? Number((currentVal - prevVal).toFixed(1)) : 0;
                    const targetGap = currentVal !== null ? Number((currentVal - targetRate).toFixed(1)) : null;
                    
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
                              <span>{yoyTrend.prefix}{yoyGap.toFixed(1)}% {yoyTrend.icon}</span>
                            </div>
                          )}
                          {targetTrend && (
                            <div className={`flex justify-between items-center text-sm font-bold ${targetTrend.color}`}>
                              <span className="text-xs uppercase text-gray-500">vs Target:</span>
                              <span>{targetTrend.prefix}{targetGap.toFixed(1)}% {targetTrend.icon}</span>
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
                dataKey={isCompletionView ? 'main_completion' : 'main_score'} 
                stroke="#0d9488" 
                strokeWidth={2.5} 
                dot={{ fill: '#0d9488', r: 4 }} 
                connectNulls 
                name={`${selectedYear}`} 
              />
              {comparisonYear !== 'none' && hasComparisonData && (
                <Line 
                  type="monotone" 
                  dataKey={isCompletionView ? 'compare_completion' : 'compare_score'} 
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

        {/* Strategic Performance - Focus Area & Priority Execution */}
        {!isHistoricalView && filteredPlans.length > 0 && (focusAreaStats.length > 0 || categoryStats.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Focus Area Performance - Horizontal Bar Chart */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-slate-600" />
                  <h3 className="text-lg font-semibold text-gray-800">Success Rate by Focus Area</h3>
                </div>
                <SortDropdown value={focusAreaSort} onChange={setFocusAreaSort} />
              </div>
              <p className="text-sm text-gray-500 mb-4">Which strategic areas are we actually delivering on?</p>
              {sortedFocusAreaStats.length > 0 ? (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer>
                    <BarChart 
                      layout="vertical" 
                      data={sortedFocusAreaStats} 
                      margin={{ left: 10, right: 50, top: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f0f0f0" />
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={150} 
                        tick={{ fontSize: 11, fill: '#4b5563' }}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                      />
                      <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg min-w-[180px]">
                                <p className="font-medium text-gray-800 text-sm mb-2">{data.fullName}</p>
                                <div className="space-y-1">
                                  <p className="flex justify-between">
                                    <span className="text-gray-500">{isCompletionView ? 'Completion:' : 'Avg Score:'}</span>
                                    <span className={`font-bold ${data.rate >= 80 ? 'text-emerald-600' : data.rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                      {data.rate}%
                                    </span>
                                  </p>
                                  <p className="flex justify-between">
                                    <span className="text-gray-500">Volume:</span>
                                    <span className="font-medium">{data.volume} plans</span>
                                  </p>
                                  {isCompletionView && (
                                    <p className="flex justify-between text-xs">
                                      <span className="text-gray-400">Achieved:</span>
                                      <span className="text-gray-600">{data.achieved} of {data.volume}</span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="rate" 
                        radius={[0, 4, 4, 0]} 
                        barSize={24}
                      >
                        {sortedFocusAreaStats.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.rate >= 80 ? '#059669' : entry.rate >= 50 ? '#f59e0b' : '#ef4444'} 
                          />
                        ))}
                        <LabelList 
                          dataKey="rate" 
                          position="right" 
                          formatter={(val) => `${val}%`}
                          fill="#374151"
                          fontSize={11}
                          fontWeight={600}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center bg-gray-50 rounded-lg">
                  <p className="text-gray-400 text-sm">No focus area data available</p>
                </div>
              )}
            </div>

            {/* Priority Execution - Horizontal Bar Chart */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-slate-600" />
                  <h3 className="text-lg font-semibold text-gray-800">Execution by Priority</h3>
                </div>
                <SortDropdown value={categorySort} onChange={setCategorySort} />
              </div>
              <p className="text-sm text-gray-500 mb-4">Are we hitting our "Ultra High" targets?</p>
              {sortedCategoryStats.length > 0 ? (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer>
                    <BarChart 
                      layout="vertical" 
                      data={sortedCategoryStats} 
                      margin={{ left: 10, right: 50, top: 5, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} stroke="#f0f0f0" />
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        width={100} 
                        tick={{ fontSize: 12, fill: '#374151', fontWeight: 600 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg min-w-[180px]">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }}></span>
                                  <p className="font-medium text-gray-800">{data.name} ({data.shortName})</p>
                                </div>
                                <div className="space-y-1">
                                  <p className="flex justify-between">
                                    <span className="text-gray-500">{isCompletionView ? 'Completion:' : 'Avg Score:'}</span>
                                    <span className="font-bold" style={{ color: data.color }}>{data.rate}%</span>
                                  </p>
                                  <p className="flex justify-between">
                                    <span className="text-gray-500">Volume:</span>
                                    <span className="font-medium">{data.volume} plans</span>
                                  </p>
                                  {isCompletionView && (
                                    <p className="flex justify-between text-xs">
                                      <span className="text-gray-400">Achieved:</span>
                                      <span className="text-gray-600">{data.achieved} of {data.volume}</span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="rate" 
                        radius={[0, 4, 4, 0]} 
                        barSize={32}
                      >
                        {sortedCategoryStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        <LabelList 
                          dataKey="rate" 
                          position="right" 
                          formatter={(val) => `${val}%`}
                          fill="#374151"
                          fontSize={12}
                          fontWeight={600}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center bg-gray-50 rounded-lg">
                  <p className="text-gray-400 text-sm">No category data available</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Strategy Analysis - Combo Chart (Volume + Completion) */}
        {!isHistoricalView && filteredPlans.length > 0 && (
          <div className="mb-6">
            <StrategyComboChart 
              plans={filteredPlans} 
              isCompletionView={isCompletionView} 
              sortMode={stratChartSort}
              onSortChange={setStratChartSort}
            />
          </div>
        )}

        {/* Performance by Department/PIC */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">{orgTitle}</h3>
              <p className="text-sm text-gray-500">
                {sortedOrgChartData.length} items
                {isHistoricalView && orgMetric === 'department_code' && (
                  <span className="ml-2 text-amber-600 italic">(Historical avg.)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <SortDropdown value={orgChartSort} onChange={setOrgChartSort} />
              <ChartDropdown value={orgMetric} onChange={setOrgMetric} options={[{ value: 'department_code', label: 'Department' }, { value: 'pic', label: 'PIC' }]} />
            </div>
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
            <PerformanceChart data={sortedOrgChartData} xKey="name" yKey="rate" height={300} hideHeader />
          )}
        </div>

        {/* Department Leaderboard */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />Department Leaderboard — {selectedYear}
              </h2>
              <p className="text-gray-500 text-sm">Ranked by {isCompletionView ? 'completion rate' : 'quality score'}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {isCompletionView ? (
                <>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600"></span> ≥90%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400"></span> 70-89%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-300"></span> &lt;70%</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-600"></span> ≥90%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500"></span> 70-89%</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400"></span> &lt;70%</span>
                </>
              )}
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
              filteredLeaderboard.map((dept, index) => {
                // Dynamic color based on isCompletionView
                const progressColor = isCompletionView 
                  ? (dept.rate >= 90 ? '#059669' : dept.rate >= 70 ? '#34d399' : '#6ee7b7') // Emerald shades
                  : (dept.rate >= 90 ? '#d97706' : dept.rate >= 70 ? '#f59e0b' : '#fbbf24'); // Amber shades
                const textColor = isCompletionView
                  ? (dept.rate >= 90 ? '#059669' : dept.rate >= 70 ? '#10b981' : '#34d399')
                  : (dept.rate >= 90 ? '#d97706' : dept.rate >= 70 ? '#f59e0b' : '#fbbf24');
                
                return (
                  <div key={dept.code} className={`p-4 flex items-center gap-4 ${index < 3 && selectedDept === 'All' ? 'bg-gradient-to-r from-yellow-50/50 to-transparent' : ''}`}>
                    <div className="w-8 flex justify-center">{getRankIcon(index)}</div>
                    <div className="w-14 text-center"><span className="font-mono text-sm font-semibold bg-teal-100 text-teal-700 px-2 py-1 rounded">{dept.code}</span></div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{getDeptName(dept.code)}</p>
                      <p className="text-sm text-gray-500">
                        {dept.isHistorical 
                          ? <span className="text-amber-600 italic">Historical data</span>
                          : isCompletionView 
                            ? `${dept.achieved} of ${dept.total} achieved`
                            : `${dept.graded} graded of ${dept.total} total`
                        }
                      </p>
                    </div>
                    <div className="w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden relative">
                          {/* Target marker */}
                          {annualTarget && isCompletionView && (
                            <div 
                              className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" 
                              style={{ left: `${annualTarget}%` }}
                            />
                          )}
                          <div className="h-full rounded-full" style={{ width: `${Math.min(dept.rate, 100)}%`, backgroundColor: progressColor }} />
                        </div>
                        <span className="text-sm font-bold w-12 text-right" style={{ color: textColor }}>{dept.rate}%</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}


