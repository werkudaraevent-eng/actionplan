/**
 * ChartHeader - Reusable chart header component with clean subtitle
 * 
 * Replaces cluttered badge/pill styling with a clean, professional subtitle
 * that dynamically reflects the current filter state.
 * 
 * @param {string} title - Main chart title (required)
 * @param {string} subtitle - Dynamic date/period subtitle (optional)
 * @param {React.ReactNode} actions - Optional action buttons/dropdowns (right side)
 * @param {React.ReactNode} icon - Optional icon to display before title
 */
export default function ChartHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-gray-500" />}
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        </div>
        {subtitle && (
          <p className="text-xs font-medium text-gray-500 mt-1">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Helper function to generate date subtitle text based on filter state
 * 
 * @param {Object} options - Filter state options
 * @param {string} options.timeFrame - 'FY' | 'YTD' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Custom'
 * @param {string} options.selectedMonth - Selected month (e.g., 'Jan', 'All')
 * @param {number} options.selectedYear - Selected year (e.g., 2026)
 * @param {string} options.startMonth - Start month for range (e.g., 'Jan')
 * @param {string} options.endMonth - End month for range (e.g., 'Dec')
 * @returns {string} Formatted date subtitle
 */
export function getDateSubtitle({ 
  timeFrame, 
  selectedMonth, 
  selectedYear, 
  startMonth, 
  endMonth 
}) {
  const year = selectedYear || new Date().getFullYear();
  
  // Case 1: Full Year View
  if (timeFrame === 'FY' || selectedMonth === 'All' || (startMonth === 'Jan' && endMonth === 'Dec')) {
    return `Jan - Dec ${year} (Full Year)`;
  }
  
  // Case 2: YTD View
  if (timeFrame === 'YTD') {
    const currentMonth = new Date().toLocaleString('default', { month: 'short' });
    return `Jan - ${currentMonth} ${year} (Year to Date)`;
  }
  
  // Case 3: Quarter View
  if (timeFrame === 'Q1') return `Jan - Mar ${year} (Q1)`;
  if (timeFrame === 'Q2') return `Apr - Jun ${year} (Q2)`;
  if (timeFrame === 'Q3') return `Jul - Sep ${year} (Q3)`;
  if (timeFrame === 'Q4') return `Oct - Dec ${year} (Q4)`;
  
  // Case 4: Specific Month
  if (selectedMonth && selectedMonth !== 'All') {
    return `Period: ${selectedMonth} ${year}`;
  }
  
  // Case 5: Custom Range
  if (startMonth && endMonth) {
    if (startMonth === endMonth) {
      return `Period: ${startMonth} ${year}`;
    }
    return `Period: ${startMonth} - ${endMonth} ${year}`;
  }
  
  // Fallback
  return `${year}`;
}
