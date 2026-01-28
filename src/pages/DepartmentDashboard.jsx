import { useState, useMemo, useEffect } from 'react';
import { Target, CheckCircle2, Clock, AlertCircle, ChevronDown, Calendar, AlertTriangle, Star, TrendingUp, TrendingDown, PieChart, RotateCcw, X } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { useActionPlans } from '../hooks/useActionPlans';
import { useAuth } from '../context/AuthContext';
import { useDepartmentContext } from '../context/DepartmentContext';
import { supabase } from '../lib/supabase';
import { useDepartments } from '../hooks/useDepartments';
import PerformanceChart from '../components/dashboard/PerformanceChart';
import PriorityFocusWidget from '../components/dashboard/PriorityFocusWidget';
import GlobalStatsGrid from '../components/dashboard/GlobalStatsGrid';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

// Sort months chronologically
const MONTH_ORDER = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sortByMonth = (a, b) => (MONTH_ORDER[a.name] ?? 99) - (MONTH_ORDER[b.name] ?? 99);

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
// Sort descending (newest first) for the comparison dropdown
const COMPARISON_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].sort((a, b) => b - a);

// Map months to quarters
const getQuarter = (month) => {
  const idx = MONTH_ORDER[month];
  if (idx === undefined) return 'Unknown';
  if (idx <= 2) return 'Q1';
  if (idx <= 5) return 'Q2';
  if (idx <= 8) return 'Q3';
  return 'Q4';
};

// Get bar color based on rate
const getBarColor = (value) => {
  if (value >= 90) return '#15803d';
  if (value >= 70) return '#b45309';
  return '#b91c1c';
};

// Dropdown component for chart dimension switching
function ChartDropdown({ value, onChange, options, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-xs text-gray-600 font-medium cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
      >
        {children || options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
    </div>
  );
}

// Custom tooltip for composed chart - Dynamic based on metric with YoY Gap analysis
const BenchmarkTooltip = ({ active, payload, label, currentYear, comparisonLabel, metricType }) => {
  if (active && payload && payload.length) {
    const currentValue = payload.find(p => p.dataKey === 'current')?.value;
    const compValue = payload.find(p => p.dataKey === 'comparison')?.value;
    const data = payload[0]?.payload;
    const metricLabel = metricType === 'score' ? 'Avg Score' : 'Completion';

    // Calculate YoY Gap
    const hasGap = currentValue != null && compValue != null;
    const gap = hasGap ? Number((currentValue - compValue).toFixed(1)) : null;
    const gapFormatted = gap !== null ? (gap >= 0 ? `+${gap}%` : `${gap}%`) : null;
    const gapColor = gap !== null ? (gap >= 0 ? '#15803d' : '#b91c1c') : null; // green-700 or red-700

    return (
      <div className="bg-white px-3 py-2 shadow-lg rounded-lg border border-gray-200 max-w-[220px]">
        <p className="font-medium text-gray-800 mb-1">{label}</p>
        <p className="text-sm" style={{ color: getBarColor(currentValue || 0) }}>
          {currentYear} {metricLabel}: <span className="font-bold">{currentValue !== null ? `${currentValue}%` : 'No data'}</span>
        </p>
        {metricType === 'score' && data?.graded != null && (
          <p className="text-xs text-gray-400">{data.graded} graded of {data.total} total</p>
        )}
        {metricType === 'completion' && data?.achieved != null && (
          <p className="text-xs text-gray-400">{data.achieved} of {data.total} achieved</p>
        )}
        {compValue !== null && compValue !== undefined && (
          <p className="text-sm text-gray-500 mt-1">
            {comparisonLabel}: <span className="font-bold">{compValue}%</span>
          </p>
        )}
        {/* YoY Gap Analysis */}
        {hasGap && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              YoY Gap: <span className="font-bold" style={{ color: gapColor }}>{gapFormatted}</span>
            </p>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function DepartmentDashboard({ departmentCode, onNavigate }) {
  // Use global department context
  const { currentDept } = useDepartmentContext();
  const { profile, isStaff } = useAuth();
  
  // Use currentDept from context (falls back to prop for compatibility)
  const activeDepartmentCode = currentDept || departmentCode;
  
  const { plans, loading, refetch } = useActionPlans(activeDepartmentCode);
  const { departments } = useDepartments();

  // Staff users should not navigate from KPI cards - they can only view
  const canNavigate = onNavigate && !isStaff;

  // Year and dimension switching states
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [breakdownMetric, setBreakdownMetric] = useState('goal_strategy');
  const [timeMetric, setTimeMetric] = useState('monthly');
  const [comparisonYear, setComparisonYear] = useState('prev_year');

  // Month range filter states
  const [selectedPeriod, setSelectedPeriod] = useState('FY'); // 'FY', 'Q1', 'Q2', 'Q3', 'Q4', 'Custom'
  const [startMonth, setStartMonth] = useState('Jan');
  const [endMonth, setEndMonth] = useState('Dec');
  const [isCompletionView, setIsCompletionView] = useState(true); // false = Verification Score, true = Completion Rate

  // Priority filter and refresh states
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Computed chartMetric based on isCompletionView toggle (for chart compatibility)
  const chartMetric = isCompletionView ? 'completion' : 'score';

  // Historical stats for selected year (hybrid data source)
  const [historicalStats, setHistoricalStats] = useState([]);

  // Fetch historical stats when year changes
  useEffect(() => {
    const fetchHistoricalStats = async () => {
      const { data } = await supabase
        .from('historical_stats')
        .select('*')
        .eq('year', selectedYear)
        .eq('department_code', activeDepartmentCode);

      setHistoricalStats(data || []);
    };

    fetchHistoricalStats();
  }, [selectedYear, activeDepartmentCode]);

  // Get department info
  const deptInfo = departments.find((d) => d.code === activeDepartmentCode);
  const deptName = deptInfo?.name || activeDepartmentCode;
  
  // Helper functions for filter management
  const clearDateFilters = () => { setStartMonth('Jan'); setEndMonth('Dec'); setSelectedPeriod('FY'); };

  const resetFilters = () => {
    setSelectedYear(CURRENT_YEAR);
    setSelectedPeriod('FY');
    setStartMonth('Jan');
    setEndMonth('Dec');
    setSelectedCategory('All'); // Reset priority filter
  };

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

  // Soft refresh handler - re-fetches data without page reload
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      await new Promise(resolve => setTimeout(resolve, 400));
    } finally {
      setIsRefreshing(false);
    }
  };

  const clearCategoryFilter = () => setSelectedCategory('All');

  const getFilterRangeLabel = () => {
    if (startMonth === 'Jan' && endMonth === 'Dec') return 'Full Year';
    if (startMonth === endMonth) return startMonth;
    return `${startMonth} – ${endMonth}`;
  };

  const hasActiveFilters = (startMonth !== 'Jan' || endMonth !== 'Dec') || selectedYear !== CURRENT_YEAR || selectedPeriod !== 'FY' || selectedCategory !== 'All';

  // Filter plans by selected year, month range, and priority
  const yearFilteredPlans = useMemo(() => {
    let filtered = plans.filter((plan) => (plan.year || CURRENT_YEAR) === selectedYear);

    // Apply month range filter
    const startIdx = MONTH_ORDER[startMonth] ?? 0;
    const endIdx = MONTH_ORDER[endMonth] ?? 11;

    filtered = filtered.filter((plan) => {
      const planMonthIdx = MONTH_ORDER[plan.month];
      if (planMonthIdx === undefined) return true; // Include plans without month
      return planMonthIdx >= startIdx && planMonthIdx <= endIdx;
    });

    // Apply priority/category filter - use startsWith for safe matching
    // DB may store "UH (Ultra High)" but we filter by "UH"
    if (selectedCategory && selectedCategory !== 'All') {
      filtered = filtered.filter((plan) => {
        const planCategory = (plan.category || '').toUpperCase();
        return planCategory.startsWith(selectedCategory);
      });
    }

    return filtered;
  }, [plans, selectedYear, startMonth, endMonth, selectedCategory]);

  // Check if viewing historical data (no real plans but has historical stats)
  const isHistoricalView = yearFilteredPlans.length === 0 && historicalStats.length > 0;

  // Calculate comparison year value
  const comparisonYearValue = useMemo(() => {
    if (comparisonYear === 'none') return null;
    if (comparisonYear === 'prev_year') return selectedYear - 1;
    return parseInt(comparisonYear, 10);
  }, [comparisonYear, selectedYear]);

  // Comparison year plans for benchmark
  const comparisonPlans = useMemo(() => {
    if (!comparisonYearValue) return [];
    return plans.filter((plan) => (plan.year || CURRENT_YEAR) === comparisonYearValue);
  }, [plans, comparisonYearValue]);

  // Historical data for comparison (monthly)
  const [comparisonHistorical, setComparisonHistorical] = useState([]);

  useEffect(() => {
    const fetchComparisonHistory = async () => {
      if (!comparisonYearValue) {
        setComparisonHistorical([]);
        return;
      }

      const { data } = await supabase
        .from('historical_stats')
        .select('*')
        .eq('year', comparisonYearValue)
        .eq('department_code', activeDepartmentCode);

      setComparisonHistorical(data || []);
    };

    fetchComparisonHistory();
  }, [comparisonYearValue, activeDepartmentCode]);

  const hasComparisonData = comparisonPlans.length > 0 || comparisonHistorical.length > 0;
  const hasCurrentData = yearFilteredPlans.length > 0 || historicalStats.length > 0;
  const comparisonLabel = comparisonYearValue ? `${comparisonYearValue}` : null;

  // Current month index for YTD calculations
  const currentMonthIndex = new Date().getMonth(); // 0 = Jan, 11 = Dec

  // Determine if we're in YTD mode (Full Year + Current Year)
  // YTD mode: Only count plans up to current month
  // Period mode: Respect the selected range without YTD cutoff
  const isYTDMode = selectedPeriod === 'FY' && selectedYear === CURRENT_YEAR;

  // Calculate stats from year-filtered plans (with historical fallback)
  const stats = useMemo(() => {
    // If we have real plans, calculate from them
    if (yearFilteredPlans.length > 0) {
      const total = yearFilteredPlans.length;
      const achieved = yearFilteredPlans.filter((p) => p.status === 'Achieved').length;
      const inProgress = yearFilteredPlans.filter((p) => p.status === 'On Progress').length;
      const pending = yearFilteredPlans.filter((p) => p.status === 'Open').length;
      const notAchieved = yearFilteredPlans.filter((p) => p.status === 'Not Achieved').length;
      const rate = total > 0 ? parseFloat(((achieved / total) * 100).toFixed(1)) : 0;

      // FILTER MODE LOGIC:
      // - YTD Mode (FY + Current Year): Only count plans where month <= current month
      // - Period Mode (Q1, Q2, Custom, etc.): Use all plans in the selected range (no YTD cutoff)
      let statsPlans = yearFilteredPlans;
      if (isYTDMode) {
        // YTD: Filter to plans due on or before current month
        statsPlans = yearFilteredPlans.filter(p => {
          const planMonthIdx = MONTH_ORDER[p.month];
          return planMonthIdx !== undefined && planMonthIdx <= currentMonthIndex;
        });
      }
      // If not YTD mode, use yearFilteredPlans as-is (already filtered by selected period)

      const statsTotal = statsPlans.length;
      const statsAchieved = statsPlans.filter((p) => p.status === 'Achieved').length;
      const completionRate = statsTotal > 0 ? Number(((statsAchieved / statsTotal) * 100).toFixed(1)) : 0;

      // Verification Score: Average of graded items
      // Apply same filter logic
      const gradedItems = statsPlans.filter(p =>
        p.submission_status === 'submitted' && p.quality_score != null
      );
      const qualityScore = gradedItems.length > 0
        ? Number((gradedItems.reduce((sum, p) => sum + p.quality_score, 0) / gradedItems.length).toFixed(1))
        : null;
      const gradedCount = gradedItems.length;

      return {
        total, achieved, inProgress, pending, notAchieved, rate,
        completionRate, qualityScore, gradedCount,
        isHistorical: false,
        // YTD specific stats
        isYTD: isYTDMode,
        ytdTotal: statsTotal,
        ytdAchieved: statsAchieved,
        ytdMonthName: MONTHS_ORDER[currentMonthIndex]
      };
    }

    // Fallback to historical stats - assign to COMPLETION RATE (Verification Score didn't exist pre-2026)
    if (historicalStats.length > 0) {
      const avgRate = Number(
        (historicalStats.reduce((sum, h) => sum + h.completion_rate, 0) / historicalStats.length).toFixed(1)
      );
      return {
        total: 0,
        achieved: 0,
        inProgress: 0,
        pending: 0,
        notAchieved: 0,
        rate: avgRate,
        completionRate: avgRate, // Historical completion rate (FIXED - was incorrectly assigned to qualityScore)
        qualityScore: null,      // Verification Score system didn't exist pre-2026
        gradedCount: 0,          // No graded items for historical years
        isHistorical: true,
        isYTD: false,
        ytdTotal: 0,
        ytdAchieved: 0,
        ytdMonthName: null
      };
    }

    return {
      total: 0, achieved: 0, inProgress: 0, pending: 0, notAchieved: 0, rate: 0,
      completionRate: 0, qualityScore: null, gradedCount: 0, isHistorical: false,
      isYTD: false, ytdTotal: 0, ytdAchieved: 0, ytdMonthName: null
    };
  }, [yearFilteredPlans, historicalStats, selectedYear, startMonth, endMonth, currentMonthIndex]);

  // Previous Year Verification Score (for YoY comparison)
  const prevYearQualityScore = useMemo(() => {
    // Calculate from comparison plans if available
    if (comparisonPlans.length > 0) {
      const gradedItems = comparisonPlans.filter(p =>
        p.submission_status === 'submitted' && p.quality_score != null
      );
      if (gradedItems.length > 0) {
        return Number((gradedItems.reduce((sum, p) => sum + p.quality_score, 0) / gradedItems.length).toFixed(1));
      }
    }
    // Fallback to comparison historical data
    if (comparisonHistorical.length > 0) {
      const avgRate = comparisonHistorical.reduce((sum, h) => sum + h.completion_rate, 0) / comparisonHistorical.length;
      return Number(avgRate.toFixed(1));
    }
    return null;
  }, [comparisonPlans, comparisonHistorical]);

  // Verification Score Target (company standard)
  const qualityScoreTarget = 80;

  // Completion Rate Target (company standard)
  const completionTarget = 80;

  // Failure Analysis: Extract and aggregate failure reasons from action_plans
  const failureAnalysis = useMemo(() => {
    // Filter plans where status === 'Not Achieved'
    const failedPlans = yearFilteredPlans.filter((p) => p.status === 'Not Achieved');

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
        percentage: Number(((count / failedPlans.length) * 100).toFixed(1))
      }))
      .sort((a, b) => b.count - a.count);

    // Identify top blocker
    const topBlocker = sortedReasons.length > 0 ? sortedReasons[0] : null;

    return {
      reasons: sortedReasons,
      topBlocker,
      totalFailed: failedPlans.length
    };
  }, [yearFilteredPlans]);

  // Helper: Generate date range label for tooltips based on current filters
  const getDateRangeLabel = () => {
    const year = selectedYear;

    // Case 1: Custom Range Filter (startMonth and/or endMonth set)
    if (startMonth || endMonth) {
      const start = startMonth || 'Jan';
      const end = endMonth || 'Dec';
      if (start === end) return `${start} ${year}`;
      return `${start} - ${end} ${year}`;
    }

    // Case 2: Default Logic (YTD for current year, Full Year for past)
    if (year === CURRENT_YEAR) {
      const currentMonthName = MONTHS_ORDER[new Date().getMonth()];
      return `Jan - ${currentMonthName} ${year} (YTD)`;
    }

    // Case 3: Past Year Default
    return `Jan - Dec ${year}`;
  };

  const dateRangeLabel = getDateRangeLabel();

  // YTD-filtered plans for charts (only plans where month <= current month when in YTD mode)
  const ytdFilteredPlans = useMemo(() => {
    if (!isYTDMode) return yearFilteredPlans;
    
    return yearFilteredPlans.filter(p => {
      const planMonthIdx = MONTH_ORDER[p.month];
      return planMonthIdx !== undefined && planMonthIdx <= currentMonthIndex;
    });
  }, [yearFilteredPlans, isYTDMode, currentMonthIndex]);

  // Chart 1: Performance Breakdown (by Strategy or PIC) - Respects chartMetric toggle
  // Uses YTD-filtered plans when in YTD mode to ensure fair comparison
  const breakdownChartData = useMemo(() => {
    const dataMap = {};
    
    // Use YTD-filtered plans for breakdown chart
    const plansToUse = isYTDMode ? ytdFilteredPlans : yearFilteredPlans;

    plansToUse.forEach((plan) => {
      let key;
      if (breakdownMetric === 'goal_strategy') {
        key = plan.goal_strategy?.trim() || 'Uncategorized';
      } else {
        key = plan.pic?.trim() || 'Unassigned';
      }

      const shortName = key.length > 25 ? key.substring(0, 22) + '...' : key;

      if (!dataMap[shortName]) {
        dataMap[shortName] = { total: 0, achieved: 0, scores: [], fullName: key };
      }
      dataMap[shortName].total++;

      // Track achieved count for completion metric
      if (plan.status === 'Achieved') {
        dataMap[shortName].achieved++;
      }

      // Track quality scores for graded items (score metric)
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        dataMap[shortName].scores.push(plan.quality_score);
      }
    });

    return Object.entries(dataMap)
      .map(([name, s]) => {
        // Calculate rate based on selected metric
        let rate;
        if (chartMetric === 'score') {
          rate = s.scores.length > 0
            ? parseFloat((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1))
            : 0;
        } else {
          // Completion rate: achieved / total * 100
          rate = s.total > 0 ? parseFloat(((s.achieved / s.total) * 100).toFixed(1)) : 0;
        }

        return {
          name,
          fullName: s.fullName,
          rate,
          total: s.total,
          achieved: s.achieved,
          graded: s.scores.length,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [yearFilteredPlans, ytdFilteredPlans, isYTDMode, breakdownMetric, chartMetric]);

  // Chart 2: Time Analysis (Monthly or Quarterly) - Respects chartMetric toggle
  const timeChartData = useMemo(() => {
    // If we have real plans, use them
    if (yearFilteredPlans.length > 0) {
      const dataMap = {};

      yearFilteredPlans.forEach((plan) => {
        let key;
        if (timeMetric === 'monthly') {
          key = plan.month || 'Unknown';
        } else {
          key = getQuarter(plan.month);
        }

        if (!dataMap[key]) {
          dataMap[key] = { total: 0, achieved: 0, scores: [] };
        }
        dataMap[key].total++;

        // Track achieved count for completion metric
        if (plan.status === 'Achieved') {
          dataMap[key].achieved++;
        }

        // Track quality scores for graded items (score metric)
        if (plan.submission_status === 'submitted' && plan.quality_score != null) {
          dataMap[key].scores.push(plan.quality_score);
        }
      });

      const result = Object.entries(dataMap)
        .map(([name, s]) => {
          // Calculate rate based on selected metric
          let rate;
          if (chartMetric === 'score') {
            rate = s.scores.length > 0
              ? parseFloat((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1))
              : 0;
          } else {
            // Completion rate: achieved / total * 100
            rate = s.total > 0 ? parseFloat(((s.achieved / s.total) * 100).toFixed(1)) : 0;
          }

          return {
            name,
            fullName: name,
            rate,
            total: s.total,
            achieved: s.achieved,
            graded: s.scores.length,
          };
        });

      // Sort appropriately
      if (timeMetric === 'monthly') {
        return result.sort(sortByMonth);
      } else {
        return result.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    // Fallback for historical years (pre-2026)
    // Fetch from historical_stats table - Quality Score system didn't exist pre-2026
    if (selectedYear < 2026 && historicalStats.length > 0) {
      if (timeMetric === 'monthly') {
        return MONTHS_ORDER.map((month, idx) => {
          const hist = historicalStats.find(h => h.month === idx + 1);
          const completionRate = hist ? Number(hist.completion_rate.toFixed(1)) : 0;

          return {
            name: month,
            fullName: month,
            // If viewing Score metric: show 0 (system didn't exist pre-2026)
            // If viewing Completion metric: show historical completion_rate from database
            rate: chartMetric === 'score' ? 0 : completionRate,
            total: 0,
            graded: 0,
            isHistorical: true,
          };
        });
      } else {
        // Quarterly aggregation from database historical_stats
        const quarterData = { Q1: [], Q2: [], Q3: [], Q4: [] };

        MONTHS_ORDER.forEach((month, idx) => {
          const quarter = getQuarter(month);
          const hist = historicalStats.find(h => h.month === idx + 1);
          const completionRate = hist ? hist.completion_rate : 0;

          if (quarterData[quarter]) {
            quarterData[quarter].push(completionRate);
          }
        });

        return ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter) => ({
          name: quarter,
          fullName: quarter,
          // If viewing Score metric: show 0 (system didn't exist pre-2026)
          // If viewing Completion metric: show historical completion_rate average
          rate: chartMetric === 'score' ? 0 : (quarterData[quarter].length > 0
            ? Number((quarterData[quarter].reduce((a, b) => a + b, 0) / quarterData[quarter].length).toFixed(1))
            : 0),
          total: 0,
          graded: 0,
          isHistorical: true,
        }));
      }
    }

    return [];
  }, [yearFilteredPlans, historicalStats, timeMetric, chartMetric, selectedYear]);

  // Benchmark chart data for Monthly view (current year bars + comparison year line) - Respects chartMetric
  const benchmarkMonthlyData = useMemo(() => {
    // Build current year data by month from real plans
    const currentMap = {};
    yearFilteredPlans.forEach((plan) => {
      const month = plan.month || 'Unknown';
      if (!currentMap[month]) currentMap[month] = { total: 0, achieved: 0, scores: [] };
      currentMap[month].total++;
      if (plan.status === 'Achieved') currentMap[month].achieved++;
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        currentMap[month].scores.push(plan.quality_score);
      }
    });

    // Build historical data map for current year (month number to rate) from database
    const currentHistoricalMap = {};
    historicalStats.forEach((h) => {
      const monthName = MONTHS_ORDER[h.month - 1];
      currentHistoricalMap[monthName] = h.completion_rate;
    });

    // Build comparison year data by month from real plans
    const compMap = {};
    comparisonPlans.forEach((plan) => {
      const month = plan.month || 'Unknown';
      if (!compMap[month]) compMap[month] = { total: 0, achieved: 0, scores: [] };
      compMap[month].total++;
      if (plan.status === 'Achieved') compMap[month].achieved++;
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        compMap[month].scores.push(plan.quality_score);
      }
    });

    // Build historical comparison map (month number to rate) from database
    const compHistoricalMap = {};
    comparisonHistorical.forEach((h) => {
      const monthName = MONTHS_ORDER[h.month - 1];
      compHistoricalMap[monthName] = h.completion_rate;
    });

    // Combine into chart data for all months (ALWAYS generate full year skeleton)
    const chartData = MONTHS_ORDER.map((month) => {
      const curr = currentMap[month];
      const comp = compMap[month];

      // Current year value based on chartMetric
      let currentValue = null;

      // For historical years (pre-2026), use database historical_stats
      if (selectedYear < 2026) {
        if (chartMetric === 'score') {
          // Quality Score system didn't exist pre-2026
          currentValue = 0;
        } else {
          // Use completion data from database historical_stats
          if (currentHistoricalMap[month] !== undefined) {
            currentValue = Number(currentHistoricalMap[month].toFixed(1));
          }
        }
      } else {
        // Current year (2026+) - use real plan data
        if (curr && curr.total > 0) {
          if (chartMetric === 'score') {
            currentValue = curr.scores.length > 0
              ? Number((curr.scores.reduce((a, b) => a + b, 0) / curr.scores.length).toFixed(1))
              : null;
          } else {
            currentValue = Number(((curr.achieved / curr.total) * 100).toFixed(1));
          }
        }
        // Fall back to historical if no real data
        if (currentValue === null && currentHistoricalMap[month] !== undefined) {
          currentValue = Number(currentHistoricalMap[month].toFixed(1));
        }
      }

      // Comparison value based on chartMetric
      let comparisonValue = null;

      // For historical comparison years (pre-2026), use database historical_stats
      if (comparisonYearValue && comparisonYearValue < 2026) {
        if (chartMetric === 'score') {
          // Quality Score system didn't exist pre-2026
          comparisonValue = 0;
        } else {
          // Use completion data from database historical_stats
          if (compHistoricalMap[month] !== undefined) {
            comparisonValue = Number(compHistoricalMap[month].toFixed(1));
          }
        }
      } else if (comparisonYearValue) {
        // Comparison year (2026+) - use real plan data
        if (comp && comp.total > 0) {
          if (chartMetric === 'score') {
            comparisonValue = comp.scores.length > 0
              ? Number((comp.scores.reduce((a, b) => a + b, 0) / comp.scores.length).toFixed(1))
              : null;
          } else {
            comparisonValue = Number(((comp.achieved / comp.total) * 100).toFixed(1));
          }
        }
        // Fall back to historical if no real data
        if (comparisonValue === null && compHistoricalMap[month] !== undefined) {
          comparisonValue = Number(compHistoricalMap[month].toFixed(1));
        }
      }

      return {
        name: month,
        current: currentValue,
        comparison: comparisonValue,
        achieved: curr?.achieved || 0,
        graded: curr?.scores.length || 0,
        total: curr?.total || 0,
      };
    });

    // ZERO-FILL FALLBACK: If all values are null/0, ensure we still have skeleton data for X-axis
    const hasAnyData = chartData.some(d => d.current !== null || d.comparison !== null);
    if (!hasAnyData) {
      // Return skeleton data with 0 values to ensure chart renders with X-axis and target line
      return MONTHS_ORDER.map(month => ({
        name: month,
        current: 0,
        comparison: null,
        achieved: 0,
        graded: 0,
        total: 0,
      }));
    }

    return chartData;
  }, [yearFilteredPlans, comparisonPlans, historicalStats, comparisonHistorical, chartMetric, selectedYear, comparisonYearValue]);

  // Benchmark chart data for Quarterly view - Respects chartMetric
  const benchmarkQuarterlyData = useMemo(() => {
    const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

    // Build current year data by quarter from real plans
    const currentMap = {};
    yearFilteredPlans.forEach((plan) => {
      const quarter = getQuarter(plan.month);
      if (!currentMap[quarter]) currentMap[quarter] = { total: 0, achieved: 0, scores: [] };
      currentMap[quarter].total++;
      if (plan.status === 'Achieved') currentMap[quarter].achieved++;
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        currentMap[quarter].scores.push(plan.quality_score);
      }
    });

    // Build historical data for current year by quarter from database
    const currentHistoricalByQuarter = { Q1: [], Q2: [], Q3: [], Q4: [] };
    historicalStats.forEach((h) => {
      const quarter = getQuarter(MONTHS_ORDER[h.month - 1]);
      if (currentHistoricalByQuarter[quarter]) {
        currentHistoricalByQuarter[quarter].push(h.completion_rate);
      }
    });

    // Build comparison year data by quarter from real plans
    const compMap = {};
    comparisonPlans.forEach((plan) => {
      const quarter = getQuarter(plan.month);
      if (!compMap[quarter]) compMap[quarter] = { total: 0, achieved: 0, scores: [] };
      compMap[quarter].total++;
      if (plan.status === 'Achieved') compMap[quarter].achieved++;
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        compMap[quarter].scores.push(plan.quality_score);
      }
    });

    // Build historical comparison by quarter from database
    const compHistoricalByQuarter = { Q1: [], Q2: [], Q3: [], Q4: [] };
    comparisonHistorical.forEach((h) => {
      const quarter = getQuarter(MONTHS_ORDER[h.month - 1]);
      if (compHistoricalByQuarter[quarter]) {
        compHistoricalByQuarter[quarter].push(h.completion_rate);
      }
    });

    // Combine into chart data for all quarters (ALWAYS generate full skeleton)
    const chartData = QUARTERS.map((quarter) => {
      const curr = currentMap[quarter];
      const comp = compMap[quarter];

      // Current year value based on chartMetric
      let currentValue = null;

      // For historical years (pre-2026), use database historical_stats
      if (selectedYear < 2026) {
        if (chartMetric === 'score') {
          // Quality Score system didn't exist pre-2026
          currentValue = 0;
        } else {
          // Use completion data from database historical_stats
          if (currentHistoricalByQuarter[quarter].length > 0) {
            const avg = currentHistoricalByQuarter[quarter].reduce((a, b) => a + b, 0) / currentHistoricalByQuarter[quarter].length;
            currentValue = Number(avg.toFixed(1));
          }
        }
      } else {
        // Current year (2026+) - use real plan data
        if (curr && curr.total > 0) {
          if (chartMetric === 'score') {
            currentValue = curr.scores.length > 0
              ? Number((curr.scores.reduce((a, b) => a + b, 0) / curr.scores.length).toFixed(1))
              : null;
          } else {
            currentValue = Number(((curr.achieved / curr.total) * 100).toFixed(1));
          }
        }
        // Fall back to historical if no real data
        if (currentValue === null && currentHistoricalByQuarter[quarter].length > 0) {
          const avg = currentHistoricalByQuarter[quarter].reduce((a, b) => a + b, 0) / currentHistoricalByQuarter[quarter].length;
          currentValue = Number(avg.toFixed(1));
        }
      }

      // Comparison value based on chartMetric
      let comparisonValue = null;

      // For historical comparison years (pre-2026), use database historical_stats
      if (comparisonYearValue && comparisonYearValue < 2026) {
        if (chartMetric === 'score') {
          // Quality Score system didn't exist pre-2026
          comparisonValue = 0;
        } else {
          // Use completion data from database historical_stats
          if (compHistoricalByQuarter[quarter].length > 0) {
            const avg = compHistoricalByQuarter[quarter].reduce((a, b) => a + b, 0) / compHistoricalByQuarter[quarter].length;
            comparisonValue = Number(avg.toFixed(1));
          }
        }
      } else if (comparisonYearValue) {
        // Comparison year (2026+) - use real plan data
        if (comp && comp.total > 0) {
          if (chartMetric === 'score') {
            comparisonValue = comp.scores.length > 0
              ? Number((comp.scores.reduce((a, b) => a + b, 0) / comp.scores.length).toFixed(1))
              : null;
          } else {
            comparisonValue = Number(((comp.achieved / comp.total) * 100).toFixed(1));
          }
        }
        // Fall back to historical if no real data
        if (comparisonValue === null && compHistoricalByQuarter[quarter].length > 0) {
          const avg = compHistoricalByQuarter[quarter].reduce((a, b) => a + b, 0) / compHistoricalByQuarter[quarter].length;
          comparisonValue = Number(avg.toFixed(1));
        }
      }

      return {
        name: quarter,
        current: currentValue,
        comparison: comparisonValue,
        achieved: curr?.achieved || 0,
        graded: curr?.scores.length || 0,
        total: curr?.total || 0,
      };
    });

    // ZERO-FILL FALLBACK: If all values are null/0, ensure we still have skeleton data for X-axis
    const hasAnyData = chartData.some(d => d.current !== null || d.comparison !== null);
    if (!hasAnyData) {
      // Return skeleton data with 0 values to ensure chart renders with X-axis and target line
      return QUARTERS.map(quarter => ({
        name: quarter,
        current: 0,
        comparison: null,
        achieved: 0,
        graded: 0,
        total: 0,
      }));
    }

    return chartData;
  }, [yearFilteredPlans, comparisonPlans, historicalStats, comparisonHistorical, chartMetric, selectedYear, comparisonYearValue]);

  // Select the right benchmark data based on timeMetric
  const benchmarkChartData = timeMetric === 'monthly' ? benchmarkMonthlyData : benchmarkQuarterlyData;

  // Chart titles based on selected metric - Dynamic based on chartMetric toggle
  const metricLabel = chartMetric === 'score' ? 'Verification Score' : 'Completion Rate';
  const breakdownTitle = breakdownMetric === 'goal_strategy'
    ? `${metricLabel} by Strategy`
    : `${metricLabel} by PIC`;
  const breakdownSubtitle = breakdownMetric === 'goal_strategy'
    ? `${breakdownChartData.length} strategies tracked`
    : `${breakdownChartData.length} team members`;

  const timeTitle = timeMetric === 'monthly'
    ? `Monthly ${metricLabel} Trend`
    : `Quarterly ${metricLabel} Trend`;
  const timeSubtitle = chartMetric === 'score'
    ? (timeMetric === 'monthly' ? 'Average verification score by month' : 'Average verification score by quarter')
    : (timeMetric === 'monthly' ? 'Achieved plans percentage by month' : 'Achieved plans percentage by quarter');

  if (loading) {
    return (
      <div className="flex-1 bg-gray-50 min-h-screen p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="h-80 bg-gray-200 rounded-xl"></div>
            <div className="h-80 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 min-h-screen">
      {/* --- REDESIGNED DEPARTMENT DASHBOARD HEADER --- */}
      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 sticky top-0 z-[100]">
        <div className="space-y-4">

          {/* TOP ROW: TITLE & REFRESH BUTTON */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{deptName}</h1>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                <span>Performance Overview — FY {selectedYear}</span>
                <span className="hidden sm:inline-block">•</span>
                <span className="text-emerald-600 font-medium">Welcome back, {profile?.full_name}</span>
              </div>
            </div>

            {/* REFRESH BUTTON (Prominent & Clear) */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <RotateCcw size={16} className={isRefreshing ? "animate-spin text-emerald-600" : "text-gray-500"} />
              <span className="font-medium text-sm">{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
            </button>
          </div>

          {/* BOTTOM ROW: FILTERS & CONTROLS (The Control Bar) */}
          <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4 bg-gray-50/70 p-3 rounded-xl border border-gray-100">

            {/* LEFT: DATA FILTERS (Grouped) */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Year Selector */}
              <Select
                value={selectedYear.toString()}
                onValueChange={(val) => { setSelectedYear(parseInt(val)); clearDateFilters(); }}
              >
                <SelectTrigger className="w-[100px] h-9 text-sm bg-white">
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

              {/* Priority Selector (NEW) */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[130px] h-9 text-sm bg-white">
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Priorities</SelectItem>
                  <SelectItem value="UH">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Ultra High
                    </span>
                  </SelectItem>
                  <SelectItem value="H">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                      High
                    </span>
                  </SelectItem>
                  <SelectItem value="M">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Medium
                    </span>
                  </SelectItem>
                  <SelectItem value="L">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                      Low
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Period Selector */}
              <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-[120px] h-9 text-sm bg-white">
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
                    <SelectTrigger className="w-[70px] h-9 text-sm bg-white">
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
                    <SelectTrigger className="w-[70px] h-9 text-sm bg-white">
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

              {/* Reset Filters Button (Only show when filters are active) */}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Reset all filters"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            {/* RIGHT: VIEW MODE TOGGLE */}
            <div className="flex items-center gap-3 border-t xl:border-t-0 xl:border-l border-gray-200 pt-3 xl:pt-0 xl:pl-4">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">View:</span>
              <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                <button
                  onClick={() => setIsCompletionView(false)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${!isCompletionView ? 'bg-purple-100 text-purple-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Score
                </button>
                <button
                  onClick={() => setIsCompletionView(true)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${isCompletionView ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                  Completion
                </button>
              </div>
            </div>
          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gray-500">Active:</span>
              {selectedYear !== CURRENT_YEAR && (
                <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-full">
                  {selectedYear}
                </span>
              )}
              {selectedCategory !== 'All' && (
                <span className="px-2 py-1 bg-rose-50 text-rose-700 rounded-full flex items-center gap-1">
                  Priority: {selectedCategory === 'UH' ? 'Ultra High' : selectedCategory === 'H' ? 'High' : selectedCategory === 'M' ? 'Medium' : 'Low'}
                  <button onClick={clearCategoryFilter} className="hover:text-rose-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              {selectedPeriod !== 'FY' && (
                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full flex items-center gap-1">
                  {selectedPeriod === 'Custom' ? getFilterRangeLabel() : selectedPeriod}
                  <button onClick={clearDateFilters} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              <span className="text-gray-400 ml-auto">{yearFilteredPlans.length} plans</span>
            </div>
          )}
        </div>
      </header >

      <main className="p-6">
        {/* Stats Grid - Unified Component */}
        <GlobalStatsGrid
          plans={yearFilteredPlans.filter(p => {
            // Apply month range filter
            const monthIdx = MONTH_ORDER[p.month];
            if (monthIdx === undefined) return false;
            const startIdx = MONTH_ORDER[startMonth] ?? 0;
            const endIdx = MONTH_ORDER[endMonth] ?? 11;
            if (monthIdx < startIdx || monthIdx > endIdx) return false;
            
            // Apply YTD cutoff if in YTD mode
            if (isYTDMode) {
              const currentMonthIndex = new Date().getMonth();
              if (monthIdx > currentMonthIndex) return false;
            }
            
            return true;
          })}
          scope="department"
          loading={loading}
          dateContext={(() => {
            // When YTD mode is active, data is filtered to current month - label must say "YTD"
            if (isYTDMode) return 'YTD';
            // Specific period selected
            if (selectedPeriod === 'Q1') return 'Q1';
            if (selectedPeriod === 'Q2') return 'Q2';
            if (selectedPeriod === 'Q3') return 'Q3';
            if (selectedPeriod === 'Q4') return 'Q4';
            // Full year (past year) or custom range
            if (selectedPeriod === 'FY') return `FY ${selectedYear}`;
            // Custom range
            if (startMonth === endMonth) return startMonth;
            return `${startMonth} - ${endMonth}`;
          })()}
          periodLabel=""
          onCardClick={canNavigate ? (cardType) => {
            const statusMap = {
              'all': '',
              'achieved': 'Achieved',
              'in-progress': 'On Progress',
              'open': 'Open',
              'not-achieved': 'Not Achieved',
              'completion': '',
              'verification': ''
            };
            const statusFilter = statusMap[cardType] || '';
            onNavigate(`dept-${activeDepartmentCode}`, { statusFilter });
          } : undefined}
        />

        {/* 2x2 Matrix Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* QUADRANT 1 (Top Left): Strategy/PIC Breakdown Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800">{breakdownTitle}</h3>
                {/* Subtitle: Dynamic date context - clean gray text, no badges */}
                <p className="text-xs font-medium text-gray-500 mt-1">
                  {isYTDMode 
                    ? `Jan - ${MONTHS_ORDER[currentMonthIndex]} ${selectedYear} (Year to Date)`
                    : selectedPeriod === 'Custom' 
                      ? `Period: ${startMonth}${startMonth !== endMonth ? ` - ${endMonth}` : ''} ${selectedYear}`
                      : selectedPeriod !== 'FY'
                        ? `${selectedPeriod === 'Q1' ? 'Jan - Mar' : selectedPeriod === 'Q2' ? 'Apr - Jun' : selectedPeriod === 'Q3' ? 'Jul - Sep' : 'Oct - Dec'} ${selectedYear} (${selectedPeriod})`
                        : `Jan - Dec ${selectedYear} (Full Year)`
                  }
                </p>
              </div>
              <ChartDropdown
                value={breakdownMetric}
                onChange={setBreakdownMetric}
                options={[
                  { value: 'goal_strategy', label: 'Goal/Strategy' },
                  { value: 'pic', label: 'PIC' },
                ]}
              />
            </div>
            <div className="flex-1 min-h-0">
              {isHistoricalView ? (
                <div className="h-full flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
                  <div className="text-center px-6">
                    <Target className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm font-medium">
                      {breakdownMetric === 'goal_strategy' ? 'Strategy' : 'PIC'} breakdown not available
                    </p>
                    <p className="text-gray-400 text-xs mt-1">Historical data is stored at department level only</p>
                  </div>
                </div>
              ) : (
                <PerformanceChart
                  data={breakdownChartData}
                  xKey="name"
                  yKey="rate"
                  height={300}
                  hideHeader
                  layout="horizontal"
                  mode={chartMetric}
                />
              )}
            </div>
          </div>

          {/* QUADRANT 2 (Top Right): Monthly/Quarterly Trend Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-800">{timeTitle}</h3>
                {/* Subtitle: Dynamic date context - clean gray text, no badges */}
                <p className="text-xs font-medium text-gray-500 mt-1">
                  {timeMetric === 'monthly' ? 'Jan - Dec' : 'Q1 - Q4'} {selectedYear} (Full Year)
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-medium text-gray-500 hidden sm:block">Compare:</span>
                <ChartDropdown
                  value={comparisonYear}
                  onChange={setComparisonYear}
                >
                  <option value="none">No Compare</option>
                  <option value="prev_year">{selectedYear - 1}</option>
                  {COMPARISON_YEARS.filter(y => y !== selectedYear && y !== selectedYear - 1).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </ChartDropdown>
                <ChartDropdown
                  value={timeMetric}
                  onChange={setTimeMetric}
                  options={[
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'quarterly', label: 'Quarterly' },
                  ]}
                />
              </div>
            </div>

            {/* Warning if no comparison data */}
            {comparisonYear !== 'none' && !hasComparisonData && (
              <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                ⚠️ No data for {comparisonLabel}
              </div>
            )}

            {/* Legend - fixed height container to prevent layout shift */}
            <div className="h-5 mb-2 flex items-center">
              {comparisonYear !== 'none' && (
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-teal-500"></span>
                    {selectedYear}
                  </span>
                  {hasComparisonData && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-0.5 bg-amber-500 rounded"></span>
                      {comparisonLabel}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Chart wrapper - fixed height to prevent axis shift */}
            <div className="h-[220px] w-[99%]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={comparisonYear !== 'none' ? benchmarkChartData : timeChartData.map(d => ({ ...d, current: d.rate, comparison: null }))}
                  margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d9488" stopOpacity={1} />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    height={50}
                    tickMargin={10}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    domain={[0, 100]}
                    padding={{ top: 50, bottom: 20 }}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickFormatter={(v) => `${v}%`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<BenchmarkTooltip currentYear={selectedYear} comparisonLabel={comparisonLabel} metricType={chartMetric} />}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar
                    dataKey="current"
                    radius={[4, 4, 0, 0]}
                    barSize={32}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="current"
                      position="top"
                      formatter={(val) => val != null ? `${val}%` : ''}
                      style={{ fill: '#374151', fontSize: '12px', fontWeight: 700 }}
                      offset={5}
                    />
                    {(comparisonYear !== 'none' ? benchmarkChartData : timeChartData).map((entry, index) => {
                      const value = entry.current ?? entry.rate ?? 0;
                      const fillColor = value >= 80 ? '#15803d' : value >= 60 ? '#b45309' : '#b91c1c';
                      return (
                        <Cell key={`cell-${index}`} fill={fillColor} />
                      );
                    })}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="comparison"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    strokeDasharray="4 4"
                    dot={{ fill: '#f59e0b', r: 4, strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                    connectNulls
                    isAnimationActive={false}
                    hide={comparisonYear === 'none' || !hasComparisonData}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* QUADRANT 3 (Bottom Left): Priority Focus - Only show for current year with data */}
          {selectedYear === CURRENT_YEAR && yearFilteredPlans.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-[350px] flex flex-col">
              <div className="flex items-center gap-2 mb-4 flex-shrink-0 border-b border-gray-100 pb-3">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-bold text-gray-800">Priority Focus</h3>
              </div>
              <p className="text-xs font-medium text-gray-500 -mt-2 mb-3">Due & Overdue Items</p>
              <div className="flex-1 overflow-y-auto pr-2">
                {(() => {
                  const currentMonth = new Date().getMonth();
                  const priorityItems = yearFilteredPlans
                    .filter((plan) => {
                      const status = plan.status?.toLowerCase();
                      if (status === 'achieved') return false;
                      const planMonthIndex = MONTH_ORDER[plan.month];
                      if (planMonthIndex === undefined) return false;
                      return planMonthIndex <= currentMonth;
                    })
                    .sort((a, b) => {
                      const aMonth = MONTH_ORDER[a.month] ?? 99;
                      const bMonth = MONTH_ORDER[b.month] ?? 99;
                      const aIsOverdue = aMonth < currentMonth;
                      const bIsOverdue = bMonth < currentMonth;
                      if (aIsOverdue && !bIsOverdue) return -1;
                      if (!aIsOverdue && bIsOverdue) return 1;
                      return aMonth - bMonth;
                    })
                    .slice(0, 8)
                    .map((plan) => ({
                      ...plan,
                      isOverdue: MONTH_ORDER[plan.month] < currentMonth
                    }));

                  if (priorityItems.length === 0) {
                    return (
                      <div className="h-full flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <p className="text-green-700 font-medium">All caught up!</p>
                        <p className="text-gray-400 text-sm mt-1">No overdue items</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {priorityItems.map((item) => (
                        <div
                          key={item.id}
                          className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${item.isOverdue
                            ? 'bg-red-50 border-red-200'
                            : 'bg-amber-50 border-amber-200'
                            }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${item.isOverdue ? 'text-red-800' : 'text-amber-800'}`} title={item.action_plan || item.goal_strategy}>
                              {(item.action_plan || item.goal_strategy || 'Untitled').substring(0, 60)}{(item.action_plan || item.goal_strategy || '').length > 60 ? '...' : ''}
                            </p>
                            {item.pic && (
                              <p className="text-xs text-gray-500 mt-1">PIC: {item.pic}</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.isOverdue
                              ? 'bg-red-200 text-red-800'
                              : 'bg-amber-200 text-amber-800'
                              }`}>
                              {item.isOverdue ? '⚠️ ' : '⏰ '}{item.month}
                            </span>
                            <span className="text-xs text-gray-500">{item.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* QUADRANT 4 (Bottom Right): Failure Analysis - Only show for current year with data */}
          {selectedYear === CURRENT_YEAR && yearFilteredPlans.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-[350px] flex flex-col">
              <div className="flex items-center gap-2 mb-2 flex-shrink-0 border-b border-gray-100 pb-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-bold text-gray-800">Failure Analysis</h3>
              </div>
              <p className="text-xs font-medium text-gray-500 mb-3">Root cause breakdown for unachieved plans</p>

              {failureAnalysis.totalFailed === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-green-700 font-medium">No Critical Issues</p>
                  <p className="text-gray-500 text-sm mt-1">All plans are on track</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2">
                  <p className="text-sm text-gray-500 mb-4">
                    {failureAnalysis.totalFailed} plan{failureAnalysis.totalFailed > 1 ? 's' : ''} not achieved
                  </p>
                  <div className="space-y-4">
                    {(() => {
                      const maxCount = Math.max(...failureAnalysis.reasons.map(r => r.count));

                      return failureAnalysis.reasons.slice(0, 6).map((item) => {
                        const isTop = item.count === maxCount;
                        return (
                          <div key={item.reason} className="space-y-1.5">
                            <div className="flex items-center justify-between text-sm">
                              <span className={`${isTop ? 'font-semibold text-red-700' : 'text-gray-700'}`} title={item.reason}>
                                {isTop && '🔥 '}{item.reason}
                              </span>
                              <span className={`font-medium ${isTop ? 'text-red-600' : 'text-gray-600'}`}>
                                {item.count} ({item.percentage}%)
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full transition-all ${isTop ? 'bg-red-500' : 'bg-gray-400'}`}
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty State - only show if no real plans AND no historical data */}
        {yearFilteredPlans.length === 0 && historicalStats.length === 0 && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-amber-800 mb-1">No Action Plans for {selectedYear}</h3>
            <p className="text-amber-600 text-sm">
              {plans.length > 0
                ? `Try selecting a different year. You have ${plans.length} plans in other years.`
                : 'Contact your administrator to add action plans for your department.'}
            </p>
          </div>
        )}

        {/* Historical Data Notice */}
        {isHistoricalView && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <p className="text-blue-700 text-sm">
              📊 Showing historical data for {selectedYear}. Strategy/PIC breakdown is not available for historical years.
            </p>
          </div>
        )}
      </main>
    </div >
  );
}


