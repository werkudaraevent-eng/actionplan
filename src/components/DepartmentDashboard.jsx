import { useState, useMemo, useEffect } from 'react';
import { Target, CheckCircle2, Clock, AlertCircle, ChevronDown, Calendar, AlertTriangle, Star, Send } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { useActionPlans } from '../hooks/useActionPlans';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENTS, supabase } from '../lib/supabase';
import PerformanceChart from './PerformanceChart';
import PriorityFocusWidget from './PriorityFocusWidget';
import KPICard, { TargetGapTooltip, ContributionTooltip, FailureRateTooltip, BreakdownTooltip } from './KPICard';

// Sort months chronologically
const MONTH_ORDER = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 };
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sortByMonth = (a, b) => (MONTH_ORDER[a.name] ?? 99) - (MONTH_ORDER[b.name] ?? 99);

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const COMPARISON_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

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

// Custom tooltip for composed chart - Score-centric
const BenchmarkTooltip = ({ active, payload, label, currentYear, comparisonLabel }) => {
  if (active && payload && payload.length) {
    const currentValue = payload.find(p => p.dataKey === 'current')?.value;
    const compValue = payload.find(p => p.dataKey === 'comparison')?.value;
    const data = payload[0]?.payload;
    return (
      <div className="bg-white px-3 py-2 shadow-lg rounded-lg border border-gray-200">
        <p className="font-medium text-gray-800 mb-1">{label}</p>
        <p className="text-sm" style={{ color: getBarColor(currentValue || 0) }}>
          {currentYear} Avg Score: <span className="font-bold">{currentValue !== null ? `${currentValue}%` : 'No data'}</span>
        </p>
        {data?.graded != null && (
          <p className="text-xs text-gray-400">{data.graded} graded of {data.total} total</p>
        )}
        {compValue !== null && compValue !== undefined && (
          <p className="text-sm text-gray-500 mt-1">
            {comparisonLabel}: <span className="font-bold">{compValue}%</span>
          </p>
        )}
      </div>
    );
  }
  return null;
};

export default function DepartmentDashboard({ departmentCode, onNavigate }) {
  const { profile, isStaff } = useAuth();
  const { plans, loading } = useActionPlans(departmentCode);
  
  // Staff users should not navigate from KPI cards - they can only view
  const canNavigate = onNavigate && !isStaff;
  
  // Year and dimension switching states
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [breakdownMetric, setBreakdownMetric] = useState('goal_strategy');
  const [timeMetric, setTimeMetric] = useState('monthly');
  const [comparisonYear, setComparisonYear] = useState('prev_year');
  
  // Month range filter states
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');

  // Historical stats for selected year (hybrid data source)
  const [historicalStats, setHistoricalStats] = useState([]);

  // Fetch historical stats when year changes
  useEffect(() => {
    const fetchHistoricalStats = async () => {
      const { data } = await supabase
        .from('historical_stats')
        .select('*')
        .eq('year', selectedYear)
        .eq('department_code', departmentCode);
      
      setHistoricalStats(data || []);
    };

    fetchHistoricalStats();
  }, [selectedYear, departmentCode]);

  // Get department info
  const deptInfo = DEPARTMENTS.find((d) => d.code === departmentCode);
  const deptName = deptInfo?.name || departmentCode;

  // Filter plans by selected year and month range
  const yearFilteredPlans = useMemo(() => {
    let filtered = plans.filter((plan) => (plan.year || CURRENT_YEAR) === selectedYear);
    
    // Apply month range filter if set
    if (startMonth || endMonth) {
      const startIdx = startMonth ? MONTH_ORDER[startMonth] : 0;
      const endIdx = endMonth ? MONTH_ORDER[endMonth] : 11;
      
      filtered = filtered.filter((plan) => {
        const planMonthIdx = MONTH_ORDER[plan.month];
        if (planMonthIdx === undefined) return true; // Include plans without month
        return planMonthIdx >= startIdx && planMonthIdx <= endIdx;
      });
    }
    
    return filtered;
  }, [plans, selectedYear, startMonth, endMonth]);

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
        .eq('department_code', departmentCode);
      
      setComparisonHistorical(data || []);
    };

    fetchComparisonHistory();
  }, [comparisonYearValue, departmentCode]);

  const hasComparisonData = comparisonPlans.length > 0 || comparisonHistorical.length > 0;
  const hasCurrentData = yearFilteredPlans.length > 0 || historicalStats.length > 0;
  const comparisonLabel = comparisonYearValue ? `${comparisonYearValue}` : null;

  // Calculate stats from year-filtered plans (with historical fallback)
  const stats = useMemo(() => {
    // If we have real plans, calculate from them
    if (yearFilteredPlans.length > 0) {
      const total = yearFilteredPlans.length;
      const achieved = yearFilteredPlans.filter((p) => p.status === 'Achieved').length;
      const inProgress = yearFilteredPlans.filter((p) => p.status === 'On Progress').length;
      const pending = yearFilteredPlans.filter((p) => p.status === 'Pending').length;
      const notAchieved = yearFilteredPlans.filter((p) => p.status === 'Not Achieved').length;
      const rate = total > 0 ? parseFloat(((achieved / total) * 100).toFixed(1)) : 0;
      
      // Submission Progress: How many items have been finalized/submitted
      const submittedItems = yearFilteredPlans.filter(p => p.submission_status === 'submitted').length;
      const submissionProgress = total > 0 ? parseFloat(((submittedItems / total) * 100).toFixed(0)) : 0;
      
      // Quality Score: Average of graded items (THE HERO METRIC)
      const gradedItems = yearFilteredPlans.filter(p => 
        p.submission_status === 'submitted' && p.quality_score != null
      );
      const qualityScore = gradedItems.length > 0 
        ? parseFloat((gradedItems.reduce((sum, p) => sum + p.quality_score, 0) / gradedItems.length).toFixed(0))
        : null;
      const gradedCount = gradedItems.length;

      return { total, achieved, inProgress, pending, notAchieved, rate, submissionProgress, qualityScore, gradedCount, isHistorical: false };
    }

    // Fallback to historical stats - calculate average completion rate
    if (historicalStats.length > 0) {
      const avgRate = parseFloat(
        (historicalStats.reduce((sum, h) => sum + h.completion_rate, 0) / historicalStats.length).toFixed(1)
      );
      return { 
        total: 0, 
        achieved: 0, 
        inProgress: 0, 
        pending: 0, 
        notAchieved: 0, 
        rate: avgRate,
        submissionProgress: 0,
        qualityScore: null,
        gradedCount: 0,
        isHistorical: true 
      };
    }

    return { total: 0, achieved: 0, inProgress: 0, pending: 0, notAchieved: 0, rate: 0, submissionProgress: 0, qualityScore: null, gradedCount: 0, isHistorical: false };
  }, [yearFilteredPlans, historicalStats]);

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
  }, [yearFilteredPlans]);

  // Chart 1: Performance Breakdown (by Strategy or PIC) - Score-centric
  const breakdownChartData = useMemo(() => {
    const dataMap = {};
    
    yearFilteredPlans.forEach((plan) => {
      let key;
      if (breakdownMetric === 'goal_strategy') {
        key = plan.goal_strategy?.trim() || 'Uncategorized';
      } else {
        key = plan.pic?.trim() || 'Unassigned';
      }
      
      const shortName = key.length > 25 ? key.substring(0, 22) + '...' : key;
      
      if (!dataMap[shortName]) {
        dataMap[shortName] = { total: 0, scores: [], fullName: key };
      }
      dataMap[shortName].total++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        dataMap[shortName].scores.push(plan.quality_score);
      }
    });

    return Object.entries(dataMap)
      .map(([name, s]) => ({
        name,
        fullName: s.fullName,
        rate: s.scores.length > 0 
          ? parseFloat((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1)) 
          : 0,
        total: s.total,
        graded: s.scores.length,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [yearFilteredPlans, breakdownMetric]);

  // Chart 2: Time Analysis (Monthly or Quarterly) - Score-centric with historical fallback
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
          dataMap[key] = { total: 0, scores: [] };
        }
        dataMap[key].total++;
        // Track quality scores for graded items
        if (plan.submission_status === 'submitted' && plan.quality_score != null) {
          dataMap[key].scores.push(plan.quality_score);
        }
      });

      const result = Object.entries(dataMap)
        .map(([name, s]) => ({
          name,
          fullName: name,
          rate: s.scores.length > 0 
            ? parseFloat((s.scores.reduce((a, b) => a + b, 0) / s.scores.length).toFixed(1)) 
            : 0,
          total: s.total,
          graded: s.scores.length,
        }));

      // Sort appropriately
      if (timeMetric === 'monthly') {
        return result.sort(sortByMonth);
      } else {
        return result.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    // Fallback to historical stats (still uses completion_rate as that's what's stored)
    if (historicalStats.length > 0) {
      if (timeMetric === 'monthly') {
        // Map historical stats to monthly chart data
        return MONTHS_ORDER.map((month, idx) => {
          const hist = historicalStats.find(h => h.month === idx + 1);
          return {
            name: month,
            fullName: month,
            rate: hist ? Math.round(hist.completion_rate) : 0,
            total: 0,
            graded: 0,
            isHistorical: true,
          };
        }).filter(d => d.rate > 0 || historicalStats.some(h => h.month === MONTH_ORDER[d.name] + 1));
      } else {
        // Aggregate historical stats by quarter
        const quarterMap = { Q1: [], Q2: [], Q3: [], Q4: [] };
        historicalStats.forEach((h) => {
          const quarter = getQuarter(MONTHS_ORDER[h.month - 1]);
          if (quarterMap[quarter]) {
            quarterMap[quarter].push(h.completion_rate);
          }
        });

        return ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter) => ({
          name: quarter,
          fullName: quarter,
          rate: quarterMap[quarter].length > 0 
            ? Math.round(quarterMap[quarter].reduce((a, b) => a + b, 0) / quarterMap[quarter].length)
            : 0,
          total: 0,
          graded: 0,
          isHistorical: true,
        }));
      }
    }

    return [];
  }, [yearFilteredPlans, historicalStats, timeMetric]);

  // Benchmark chart data for Monthly view (current year bars + comparison year line) - Score-centric
  const benchmarkMonthlyData = useMemo(() => {
    // Build current year data by month from real plans - using quality scores
    const currentMap = {};
    yearFilteredPlans.forEach((plan) => {
      const month = plan.month || 'Unknown';
      if (!currentMap[month]) currentMap[month] = { total: 0, scores: [] };
      currentMap[month].total++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        currentMap[month].scores.push(plan.quality_score);
      }
    });

    // Build historical data map for current year (month number to rate)
    const currentHistoricalMap = {};
    historicalStats.forEach((h) => {
      const monthName = MONTHS_ORDER[h.month - 1];
      currentHistoricalMap[monthName] = h.completion_rate;
    });

    // Build comparison year data by month from real plans - using quality scores
    const compMap = {};
    comparisonPlans.forEach((plan) => {
      const month = plan.month || 'Unknown';
      if (!compMap[month]) compMap[month] = { total: 0, scores: [] };
      compMap[month].total++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        compMap[month].scores.push(plan.quality_score);
      }
    });

    // Build historical comparison map (month number to rate)
    const compHistoricalMap = {};
    comparisonHistorical.forEach((h) => {
      const monthName = MONTHS_ORDER[h.month - 1];
      compHistoricalMap[monthName] = h.completion_rate;
    });

    // Combine into chart data for all months
    return MONTHS_ORDER.map((month) => {
      const curr = currentMap[month];
      const comp = compMap[month];
      
      // Current year value: prefer real quality score data, fall back to historical
      let currentValue = null;
      if (curr && curr.scores.length > 0) {
        currentValue = Math.round(curr.scores.reduce((a, b) => a + b, 0) / curr.scores.length);
      } else if (currentHistoricalMap[month] !== undefined) {
        currentValue = Math.round(currentHistoricalMap[month]);
      }

      // Comparison value: prefer real quality score data, fall back to historical
      let comparisonValue = null;
      if (comp && comp.scores.length > 0) {
        comparisonValue = Math.round(comp.scores.reduce((a, b) => a + b, 0) / comp.scores.length);
      } else if (compHistoricalMap[month] !== undefined) {
        comparisonValue = Math.round(compHistoricalMap[month]);
      }

      return {
        name: month,
        current: currentValue,
        comparison: comparisonValue,
        graded: curr?.scores.length || 0,
        total: curr?.total || 0,
      };
    });
  }, [yearFilteredPlans, comparisonPlans, historicalStats, comparisonHistorical]);

  // Benchmark chart data for Quarterly view - Score-centric
  const benchmarkQuarterlyData = useMemo(() => {
    const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
    
    // Build current year data by quarter from real plans - using quality scores
    const currentMap = {};
    yearFilteredPlans.forEach((plan) => {
      const quarter = getQuarter(plan.month);
      if (!currentMap[quarter]) currentMap[quarter] = { total: 0, scores: [] };
      currentMap[quarter].total++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        currentMap[quarter].scores.push(plan.quality_score);
      }
    });

    // Build historical data for current year by quarter
    const currentHistoricalByQuarter = { Q1: [], Q2: [], Q3: [], Q4: [] };
    historicalStats.forEach((h) => {
      const quarter = getQuarter(MONTHS_ORDER[h.month - 1]);
      if (currentHistoricalByQuarter[quarter]) {
        currentHistoricalByQuarter[quarter].push(h.completion_rate);
      }
    });

    // Build comparison year data by quarter from real plans - using quality scores
    const compMap = {};
    comparisonPlans.forEach((plan) => {
      const quarter = getQuarter(plan.month);
      if (!compMap[quarter]) compMap[quarter] = { total: 0, scores: [] };
      compMap[quarter].total++;
      // Track quality scores for graded items
      if (plan.submission_status === 'submitted' && plan.quality_score != null) {
        compMap[quarter].scores.push(plan.quality_score);
      }
    });

    // Build historical comparison by quarter
    const compHistoricalByQuarter = { Q1: [], Q2: [], Q3: [], Q4: [] };
    comparisonHistorical.forEach((h) => {
      const quarter = getQuarter(MONTHS_ORDER[h.month - 1]);
      if (compHistoricalByQuarter[quarter]) {
        compHistoricalByQuarter[quarter].push(h.completion_rate);
      }
    });

    // Combine into chart data for all quarters
    return QUARTERS.map((quarter) => {
      const curr = currentMap[quarter];
      const comp = compMap[quarter];
      
      // Current year value: prefer real quality score data, fall back to historical average
      let currentValue = null;
      if (curr && curr.scores.length > 0) {
        currentValue = Math.round(curr.scores.reduce((a, b) => a + b, 0) / curr.scores.length);
      } else if (currentHistoricalByQuarter[quarter].length > 0) {
        const avg = currentHistoricalByQuarter[quarter].reduce((a, b) => a + b, 0) / currentHistoricalByQuarter[quarter].length;
        currentValue = Math.round(avg);
      }

      // Comparison value: prefer real quality score data, fall back to historical average
      let comparisonValue = null;
      if (comp && comp.scores.length > 0) {
        comparisonValue = Math.round(comp.scores.reduce((a, b) => a + b, 0) / comp.scores.length);
      } else if (compHistoricalByQuarter[quarter].length > 0) {
        const avg = compHistoricalByQuarter[quarter].reduce((a, b) => a + b, 0) / compHistoricalByQuarter[quarter].length;
        comparisonValue = Math.round(avg);
      }

      return {
        name: quarter,
        current: currentValue,
        comparison: comparisonValue,
        graded: curr?.scores.length || 0,
        total: curr?.total || 0,
      };
    });
  }, [yearFilteredPlans, comparisonPlans, historicalStats, comparisonHistorical]);

  // Select the right benchmark data based on timeMetric
  const benchmarkChartData = timeMetric === 'monthly' ? benchmarkMonthlyData : benchmarkQuarterlyData;

  // Chart titles based on selected metric - Score-centric
  const breakdownTitle = breakdownMetric === 'goal_strategy' ? 'Quality Score by Strategy' : 'Quality Score by PIC';
  const breakdownSubtitle = breakdownMetric === 'goal_strategy' 
    ? `${breakdownChartData.length} strategies tracked`
    : `${breakdownChartData.length} team members`;
  
  const timeTitle = timeMetric === 'monthly' ? 'Monthly Quality Trend' : 'Quarterly Quality Trend';
  const timeSubtitle = timeMetric === 'monthly' 
    ? 'Average quality score by month'
    : 'Average quality score by quarter';

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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{deptName}</h1>
            <p className="text-gray-500 text-sm">
              Department Performance Dashboard — FY {selectedYear}
              {(startMonth || endMonth) && (
                <span className="ml-1 text-teal-600">
                  ({startMonth || 'Jan'} - {endMonth || 'Dec'})
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Year Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <div className="flex gap-1">
                {AVAILABLE_YEARS.map((year) => (
                  <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      selectedYear === year ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Month Range Filter */}
            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              <span className="text-xs text-gray-500">Period:</span>
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-lg px-2 py-1.5 pr-6 text-xs text-gray-600 font-medium cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">From</option>
                {MONTHS_ORDER.map((month) => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
              <span className="text-gray-400">—</span>
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="appearance-none bg-white border border-gray-200 rounded-lg px-2 py-1.5 pr-6 text-xs text-gray-600 font-medium cursor-pointer hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">To</option>
                {MONTHS_ORDER.map((month) => (
                  <option key={month} value={month}>{month}</option>
                ))}
              </select>
              {(startMonth || endMonth) && (
                <button
                  onClick={() => { setStartMonth(''); setEndMonth(''); }}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  Clear
                </button>
              )}
            </div>
            
            <div className="text-right">
              <p className="text-sm text-gray-500">Welcome back,</p>
              <p className="font-medium text-gray-800">{profile?.full_name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6">
        {/* KPI Cards - Score-Centric Layout */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          {/* Total Plans */}
          <KPICard
            gradient="from-teal-500 to-teal-600"
            icon={Target}
            value={stats.isHistorical ? '—' : stats.total}
            label="Total Plans"
            labelColor="text-teal-100"
            size="compact"
            tooltipContent={!stats.isHistorical && (
              <BreakdownTooltip ongoing={stats.inProgress + stats.pending} finalized={stats.achieved + stats.notAchieved} />
            )}
            onClick={!stats.isHistorical && canNavigate ? () => onNavigate(`dept-${departmentCode}`, { statusFilter: '' }) : undefined}
          />

          {/* Quality Score - THE HERO METRIC */}
          <KPICard
            gradient={stats.qualityScore === null ? 'from-gray-400 to-gray-500' : 
              stats.qualityScore >= 80 ? 'from-purple-500 to-purple-600' : 
              stats.qualityScore >= 60 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600'}
            icon={Star}
            value={stats.qualityScore !== null ? `${stats.qualityScore}%` : '—'}
            label="Quality Score"
            labelColor="text-white/90"
            size="compact"
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Performance Quality</p>
                <p>Avg Score: <span className={`font-bold ${stats.qualityScore >= 80 ? 'text-green-400' : stats.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {stats.qualityScore !== null ? `${stats.qualityScore}%` : 'N/A'}
                </span></p>
                <p className="text-xs text-gray-400">{stats.gradedCount} items graded</p>
              </div>
            }
          />

          {/* Submission Progress - Administrative/Compliance metric */}
          <KPICard
            gradient="from-slate-500 to-slate-600"
            icon={Send}
            value={`${stats.submissionProgress}%`}
            label={stats.isHistorical ? 'Avg. Rate (Historical)' : 'Submission Progress'}
            labelColor="text-slate-100"
            size="compact"
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Compliance Status</p>
                <p>Submitted: <span className="font-bold">{stats.submissionProgress}%</span></p>
                <p className="text-xs text-gray-400">Tracks finalized items (not quality)</p>
              </div>
            }
            progressBar={{ value: stats.submissionProgress, target: 100 }}
          />

          {/* Achieved */}
          <KPICard
            gradient="from-green-500 to-green-600"
            icon={CheckCircle2}
            value={stats.isHistorical ? '—' : stats.achieved}
            label="Achieved"
            labelColor="text-green-100"
            size="compact"
            tooltipContent={!stats.isHistorical && (
              <ContributionTooltip achieved={stats.achieved} total={stats.total} />
            )}
            onClick={!stats.isHistorical && canNavigate && stats.achieved > 0 ? () => onNavigate(`dept-${departmentCode}`, { statusFilter: 'Achieved' }) : undefined}
          />

          {/* In Progress */}
          <KPICard
            gradient="from-amber-500 to-amber-600"
            icon={Clock}
            value={stats.isHistorical ? '—' : stats.inProgress}
            label="In Progress"
            labelColor="text-amber-100"
            size="compact"
            tooltipContent={!stats.isHistorical && stats.total > 0 && (
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Work in Progress</p>
                <p>Active: <span className="font-bold text-amber-400">{((stats.inProgress / stats.total) * 100).toFixed(1)}%</span></p>
                <p className="text-xs text-gray-400">{stats.inProgress} tasks being worked on</p>
              </div>
            )}
            onClick={!stats.isHistorical && canNavigate && stats.inProgress > 0 ? () => onNavigate(`dept-${departmentCode}`, { statusFilter: 'On Progress' }) : undefined}
          />

          {/* Not Achieved */}
          <KPICard
            gradient="from-red-500 to-red-600"
            icon={AlertCircle}
            value={stats.isHistorical ? '—' : stats.notAchieved}
            label="Not Achieved"
            labelColor="text-red-100"
            size="compact"
            tooltipContent={!stats.isHistorical && (
              <FailureRateTooltip failed={stats.notAchieved} total={stats.total} />
            )}
            topBlocker={!stats.isHistorical && failureAnalysis.topBlocker ? `⚠️ Top Issue: ${failureAnalysis.topBlocker.reason} (${failureAnalysis.topBlocker.count})` : null}
            onClick={!stats.isHistorical && canNavigate && stats.notAchieved > 0 ? () => onNavigate(`dept-${departmentCode}`, { statusFilter: 'Not Achieved' }) : undefined}
          />
        </div>

        {/* Priority Focus & Failure Analysis - Only show for current year with real data */}
        {selectedYear === CURRENT_YEAR && yearFilteredPlans.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Priority Focus Widget - Span 2 columns */}
            <div className="lg:col-span-2">
              <PriorityFocusWidget plans={yearFilteredPlans} />
            </div>
            
            {/* Failure Analysis Widget - Span 1 column */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="font-semibold text-gray-800">Failure Analysis</h3>
              </div>
              
              {failureAnalysis.totalFailed === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-green-700 font-medium">No Critical Issues</p>
                  <p className="text-gray-500 text-sm mt-1">All plans are on track</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 mb-3">
                    {failureAnalysis.totalFailed} plan{failureAnalysis.totalFailed > 1 ? 's' : ''} not achieved
                  </p>
                  {(() => {
                    // Determine max count for tie-highlighting
                    const maxCount = Math.max(...failureAnalysis.reasons.map(r => r.count));
                    
                    return failureAnalysis.reasons.map((item) => {
                      const isTop = item.count === maxCount;
                      return (
                        <div key={item.reason} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className={`${isTop ? 'font-semibold text-red-700' : 'text-gray-700'}`}>
                              {isTop && '🔥 '}{item.reason}
                            </span>
                            <span className={`font-medium ${isTop ? 'text-red-600' : 'text-gray-600'}`}>
                              {item.percentage}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full transition-all ${isTop ? 'bg-red-500' : 'bg-gray-400'}`}
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400">{item.count} plan{item.count > 1 ? 's' : ''}</p>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Charts Section with Dimension Switching */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Chart: Performance Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{breakdownTitle}</h3>
                <p className="text-sm text-gray-500">{breakdownSubtitle}</p>
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
            {isHistoricalView ? (
              <div className="h-[280px] flex items-center justify-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
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
                height={280}
                hideHeader
              />
            )}
          </div>
          
          {/* Right Chart: Time Analysis */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">{timeTitle}</h3>
                <p className="text-sm text-gray-500">{timeSubtitle}</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Comparison dropdown for both monthly and quarterly */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Compare:</span>
                  <ChartDropdown
                    value={comparisonYear}
                    onChange={setComparisonYear}
                  >
                    <option value="none">None</option>
                    <option value="prev_year">Previous Year ({selectedYear - 1})</option>
                    <optgroup label="Specific Year">
                      {COMPARISON_YEARS.filter(y => y !== selectedYear).map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </optgroup>
                  </ChartDropdown>
                </div>
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
              <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                ⚠️ No data available for {comparisonLabel}. The comparison line will not be shown.
              </div>
            )}
            
            {/* Conditional chart rendering */}
            {comparisonYear !== 'none' ? (
              <>
                {/* Legend */}
                <div className="flex items-center gap-4 mb-3 text-xs">
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
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={benchmarkChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<BenchmarkTooltip currentYear={selectedYear} comparisonLabel={comparisonLabel} />} />
                    <Bar dataKey="current" radius={[4, 4, 0, 0]} maxBarSize={timeMetric === 'quarterly' ? 60 : 35}>
                      {benchmarkChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getBarColor(entry.current || 0)} />
                      ))}
                    </Bar>
                    {hasComparisonData && (
                      <Line
                        type="monotone"
                        dataKey="comparison"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: '#f59e0b', r: 4 }}
                        connectNulls
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            ) : (
              <PerformanceChart
                data={timeChartData}
                xKey="name"
                yKey="rate"
                height={280}
                hideHeader
              />
            )}
          </div>
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
    </div>
  );
}
