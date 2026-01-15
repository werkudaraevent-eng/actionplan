import { useState, useMemo, useEffect } from 'react';
import { Target, CheckCircle2, Clock, AlertCircle, ChevronDown, Calendar, AlertTriangle, Star } from 'lucide-react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts';
import { useActionPlans } from '../hooks/useActionPlans';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENTS, supabase } from '../lib/supabase';
import PerformanceChart from './PerformanceChart';
import PriorityFocusWidget from './PriorityFocusWidget';
import KPICard from './KPICard';

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
    const gap = hasGap ? currentValue - compValue : null;
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
  const { profile, isStaff } = useAuth();
  const { plans, loading } = useActionPlans(departmentCode);
  
  // Staff users should not navigate from KPI cards - they can only view
  const canNavigate = onNavigate && !isStaff;
  
  // Year and dimension switching states
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [breakdownMetric, setBreakdownMetric] = useState('goal_strategy');
  const [timeMetric, setTimeMetric] = useState('monthly');
  const [comparisonYear, setComparisonYear] = useState('prev_year');
  const [chartMetric, setChartMetric] = useState('completion'); // 'score' or 'completion'
  
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

  // Current month index for YTD calculations
  const currentMonthIndex = new Date().getMonth(); // 0 = Jan, 11 = Dec

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
      
      // YTD Logic for Action Plan Completion:
      // If viewing current year without specific month filter, only count plans due up to current month
      const isYTDActive = selectedYear === CURRENT_YEAR && !startMonth && !endMonth;
      
      let ytdPlans = yearFilteredPlans;
      if (isYTDActive) {
        ytdPlans = yearFilteredPlans.filter(p => {
          const planMonthIdx = MONTH_ORDER[p.month];
          return planMonthIdx !== undefined && planMonthIdx <= currentMonthIndex;
        });
      }
      
      const ytdTotal = ytdPlans.length;
      const ytdAchieved = ytdPlans.filter((p) => p.status === 'Achieved').length;
      const completionRate = ytdTotal > 0 ? parseFloat(((ytdAchieved / ytdTotal) * 100).toFixed(0)) : 0;
      
      // Quality Score: Average of graded items (THE HERO METRIC)
      const gradedItems = yearFilteredPlans.filter(p => 
        p.submission_status === 'submitted' && p.quality_score != null
      );
      const qualityScore = gradedItems.length > 0 
        ? parseFloat((gradedItems.reduce((sum, p) => sum + p.quality_score, 0) / gradedItems.length).toFixed(0))
        : null;
      const gradedCount = gradedItems.length;

      return { 
        total, achieved, inProgress, pending, notAchieved, rate, 
        completionRate, qualityScore, gradedCount, 
        isHistorical: false,
        // YTD specific stats
        isYTD: isYTDActive,
        ytdTotal,
        ytdAchieved,
        ytdMonthName: MONTHS_ORDER[currentMonthIndex]
      };
    }

    // Fallback to historical stats - use completion_rate as Quality Score (no item-level data)
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
        completionRate: 0, // No item-level data for historical
        qualityScore: avgRate, // Use historical rate as Quality Score
        gradedCount: historicalStats.length, // Number of months with data
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

  // Chart 1: Performance Breakdown (by Strategy or PIC) - Respects chartMetric toggle
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
  }, [yearFilteredPlans, breakdownMetric, chartMetric]);

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

    // Build historical data map for current year (month number to rate)
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
      
      // Current year value based on chartMetric
      let currentValue = null;
      if (curr && curr.total > 0) {
        if (chartMetric === 'score') {
          currentValue = curr.scores.length > 0 
            ? Math.round(curr.scores.reduce((a, b) => a + b, 0) / curr.scores.length)
            : null;
        } else {
          currentValue = Math.round((curr.achieved / curr.total) * 100);
        }
      }
      // Fall back to historical if no real data
      if (currentValue === null && currentHistoricalMap[month] !== undefined) {
        currentValue = Math.round(currentHistoricalMap[month]);
      }

      // Comparison value based on chartMetric
      let comparisonValue = null;
      if (comp && comp.total > 0) {
        if (chartMetric === 'score') {
          comparisonValue = comp.scores.length > 0 
            ? Math.round(comp.scores.reduce((a, b) => a + b, 0) / comp.scores.length)
            : null;
        } else {
          comparisonValue = Math.round((comp.achieved / comp.total) * 100);
        }
      }
      // Fall back to historical if no real data
      if (comparisonValue === null && compHistoricalMap[month] !== undefined) {
        comparisonValue = Math.round(compHistoricalMap[month]);
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
  }, [yearFilteredPlans, comparisonPlans, historicalStats, comparisonHistorical, chartMetric]);

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

    // Build historical data for current year by quarter
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
      
      // Current year value based on chartMetric
      let currentValue = null;
      if (curr && curr.total > 0) {
        if (chartMetric === 'score') {
          currentValue = curr.scores.length > 0 
            ? Math.round(curr.scores.reduce((a, b) => a + b, 0) / curr.scores.length)
            : null;
        } else {
          currentValue = Math.round((curr.achieved / curr.total) * 100);
        }
      }
      // Fall back to historical if no real data
      if (currentValue === null && currentHistoricalByQuarter[quarter].length > 0) {
        const avg = currentHistoricalByQuarter[quarter].reduce((a, b) => a + b, 0) / currentHistoricalByQuarter[quarter].length;
        currentValue = Math.round(avg);
      }

      // Comparison value based on chartMetric
      let comparisonValue = null;
      if (comp && comp.total > 0) {
        if (chartMetric === 'score') {
          comparisonValue = comp.scores.length > 0 
            ? Math.round(comp.scores.reduce((a, b) => a + b, 0) / comp.scores.length)
            : null;
        } else {
          comparisonValue = Math.round((comp.achieved / comp.total) * 100);
        }
      }
      // Fall back to historical if no real data
      if (comparisonValue === null && compHistoricalByQuarter[quarter].length > 0) {
        const avg = compHistoricalByQuarter[quarter].reduce((a, b) => a + b, 0) / compHistoricalByQuarter[quarter].length;
        comparisonValue = Math.round(avg);
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
  }, [yearFilteredPlans, comparisonPlans, historicalStats, comparisonHistorical, chartMetric]);

  // Select the right benchmark data based on timeMetric
  const benchmarkChartData = timeMetric === 'monthly' ? benchmarkMonthlyData : benchmarkQuarterlyData;

  // Chart titles based on selected metric - Dynamic based on chartMetric toggle
  const metricLabel = chartMetric === 'score' ? 'Quality Score' : 'Completion Rate';
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
    ? (timeMetric === 'monthly' ? 'Average quality score by month' : 'Average quality score by quarter')
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
      {/* Header - z-0 to allow KPI tooltips to appear above */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 relative z-0">
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

      <main className="p-6 relative z-10">
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
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Total Action Plans</p>
                <p><span className="font-bold text-teal-400">{stats.total}</span> plans for this period</p>
                <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                  <p>• Ongoing: {stats.inProgress + stats.pending} ({stats.inProgress} active, {stats.pending} pending)</p>
                  <p>• Finalized: {stats.achieved + stats.notAchieved} ({stats.achieved} achieved, {stats.notAchieved} failed)</p>
                </div>
              </div>
            )}
            onClick={!stats.isHistorical && canNavigate ? () => onNavigate(`dept-${departmentCode}`, { statusFilter: '' }) : undefined}
          />

          {/* Quality Score - THE HERO METRIC (or Historical Performance for past years) */}
          <KPICard
            gradient={stats.qualityScore === null ? 'from-gray-400 to-gray-500' : 
              stats.qualityScore >= 80 ? 'from-purple-500 to-purple-600' : 
              stats.qualityScore >= 60 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600'}
            icon={Star}
            value={stats.qualityScore !== null ? `${stats.qualityScore}%` : '—'}
            label={stats.isHistorical ? 'Historical Performance' : 'Quality Score'}
            labelColor="text-white/90"
            size="compact"
            tooltipContent={
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">
                  {stats.isHistorical ? 'Historical Performance Record' : 'Performance Quality'}
                </p>
                {stats.qualityScore !== null ? (
                  stats.isHistorical ? (
                    <>
                      <p>Average performance: <span className={`font-bold ${stats.qualityScore >= 80 ? 'text-green-400' : stats.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{stats.qualityScore}%</span></p>
                      <p className="text-xs text-gray-400">Based on <span className="font-semibold text-white">{stats.gradedCount}</span> months of data</p>
                      <p className="text-xs text-gray-500 mt-1">📊 Archived aggregate data (no item details)</p>
                    </>
                  ) : (
                    <>
                      <p>Average score: <span className={`font-bold ${stats.qualityScore >= 80 ? 'text-green-400' : stats.qualityScore >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{stats.qualityScore}%</span></p>
                      <p className="text-xs text-gray-400">Based on <span className="font-semibold text-white">{stats.gradedCount}</span> graded items</p>
                      <p className="text-xs text-gray-500 mt-1">Formula: Sum of scores ÷ {stats.gradedCount} graded</p>
                    </>
                  )
                ) : (
                  <p className="text-xs text-gray-400">No data available</p>
                )}
              </div>
            }
          />

          {/* Action Plan Completion - Operational metric (status = Achieved) - N/A for historical */}
          <KPICard
            gradient={stats.isHistorical ? 'from-gray-400 to-gray-500' : 'from-green-500 to-green-600'}
            icon={CheckCircle2}
            value={stats.isHistorical ? '—' : `${stats.completionRate}%`}
            label={stats.isHistorical ? 'Completion (N/A)' : stats.isYTD ? 'Completion (YTD)' : 'Action Plan Completion'}
            labelColor={stats.isHistorical ? 'text-gray-200' : 'text-green-100'}
            size="compact"
            tooltipContent={
              stats.isHistorical ? (
                <div className="space-y-1">
                  <p className="font-medium border-b border-gray-600 pb-1 mb-1">Action Plan Completion</p>
                  <p className="text-xs text-gray-400">No item-level data for historical years</p>
                  <p className="text-xs text-gray-500 mt-1">📊 See "Historical Performance" for aggregate data</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium border-b border-gray-600 pb-1 mb-1">
                    Action Plan Completion {stats.isYTD ? '(YTD)' : ''}
                  </p>
                  <p>
                    <span className="font-bold text-green-400">{stats.ytdAchieved} of {stats.ytdTotal}</span> plans marked Achieved
                  </p>
                  <p className="text-xs text-gray-400">Completion Rate: {stats.completionRate}%</p>
                  {stats.isYTD && (
                    <p className="text-xs text-teal-400 mt-1">
                      📅 Counting plans due up to {stats.ytdMonthName}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Formula: {stats.ytdAchieved} ÷ {stats.ytdTotal} × 100</p>
                </div>
              )
            }
            progressBar={!stats.isHistorical ? { value: stats.completionRate, target: 100 } : undefined}
          />

          {/* Achieved Count - Clickable to filter */}
          <KPICard
            gradient="from-emerald-500 to-emerald-600"
            icon={CheckCircle2}
            value={stats.isHistorical ? '—' : stats.achieved}
            label="Achieved"
            labelColor="text-emerald-100"
            size="compact"
            tooltipContent={!stats.isHistorical && (
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Achieved Plans</p>
                <p><span className="font-bold text-green-400">{stats.achieved} of {stats.total}</span> plans achieved</p>
                <p className="text-xs text-gray-400">Success Rate: {stats.total > 0 ? ((stats.achieved / stats.total) * 100).toFixed(1) : 0}%</p>
                {canNavigate && stats.achieved > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to view details →</p>
                )}
              </div>
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
            tooltipContent={!stats.isHistorical && (
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Work in Progress</p>
                <p><span className="font-bold text-amber-400">{stats.inProgress} of {stats.total}</span> plans currently active</p>
                <p className="text-xs text-gray-400">Active Rate: {stats.total > 0 ? ((stats.inProgress / stats.total) * 100).toFixed(1) : 0}%</p>
                {canNavigate && stats.inProgress > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to view details →</p>
                )}
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
              <div className="space-y-1">
                <p className="font-medium border-b border-gray-600 pb-1 mb-1">Failed Plans</p>
                <p><span className="font-bold text-red-400">{stats.notAchieved} of {stats.total}</span> plans not achieved</p>
                <p className="text-xs text-gray-400">Failure Rate: {stats.total > 0 ? ((stats.notAchieved / stats.total) * 100).toFixed(1) : 0}%</p>
                {failureAnalysis.topBlocker && (
                  <p className="text-xs text-red-300 mt-1">⚠️ Top Issue: {failureAnalysis.topBlocker.reason}</p>
                )}
                {canNavigate && stats.notAchieved > 0 && (
                  <p className="text-xs text-teal-400 mt-1">Click to view details →</p>
                )}
              </div>
            )}
            topBlocker={!stats.isHistorical && failureAnalysis.topBlocker ? `⚠️ Top Issue: ${failureAnalysis.topBlocker.reason} (${failureAnalysis.topBlocker.count})` : null}
            onClick={!stats.isHistorical && canNavigate && stats.notAchieved > 0 ? () => onNavigate(`dept-${departmentCode}`, { statusFilter: 'Not Achieved' }) : undefined}
          />
        </div>

        {/* 2x2 Matrix Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Metric Toggle - spans full width */}
          <div className="lg:col-span-2 flex items-center justify-end">
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setChartMetric('completion')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  chartMetric === 'completion'
                    ? 'bg-green-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completion Rate
              </button>
              <button
                onClick={() => setChartMetric('score')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  chartMetric === 'score'
                    ? 'bg-purple-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                Quality Score
              </button>
            </div>
          </div>

          {/* QUADRANT 1 (Top Left): Strategy/PIC Breakdown Chart */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-[400px] flex flex-col">
            <div className="flex items-start justify-between mb-4">
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
                <h3 className="text-lg font-semibold text-gray-800">{timeTitle}</h3>
                <p className="text-sm text-gray-500 truncate">{timeSubtitle}</p>
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
                      <stop offset="0%" stopColor="#0d9488" stopOpacity={1}/>
                      <stop offset="100%" stopColor="#0d9488" stopOpacity={0.5}/>
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
                <h3 className="text-lg font-semibold text-gray-800">Priority Focus</h3>
                <span className="text-xs text-gray-400">(Due & Overdue)</span>
              </div>
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
                          className={`flex items-start justify-between gap-3 p-3 rounded-lg border ${
                            item.isOverdue 
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
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              item.isOverdue 
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
              <div className="flex items-center gap-2 mb-4 flex-shrink-0 border-b border-gray-100 pb-3">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-semibold text-gray-800">Failure Analysis</h3>
              </div>
              
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
    </div>
  );
}
