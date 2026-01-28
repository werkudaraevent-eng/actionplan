import { useState } from 'react';
import { Search, Calendar, Building2, CheckCircle, Flag, X, ChevronDown, Check, ArrowLeft } from 'lucide-react';
import { STATUS_OPTIONS } from '../../lib/supabase';
import { ColumnToggle } from '../action-plan/DataTable';

// Month order for filtering
const MONTHS_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_INDEX = Object.fromEntries(MONTHS_ORDER.map((m, i) => [m, i]));

// Category options
const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Priorities' },
  { value: 'UH', label: 'UH (Urgent High)' },
  { value: 'H', label: 'H (High)' },
  { value: 'M', label: 'M (Medium)' },
  { value: 'L', label: 'L (Low)' },
];

/**
 * UnifiedPageHeader - All-in-one header + filter bar component
 * 
 * Merges the page header and filter toolbar into a single cohesive component.
 * Eliminates layout gaps, double borders, and redundant elements.
 * 
 * IMPORTANT: Uses `sticky top-0` positioning. Content below should NOT need
 * extra padding since sticky elements remain in document flow.
 * 
 * Layout Structure:
 * - ROW 1: Title & Subtitle (Left) | headerActions (Right)
 * - ROW 2: Search (Left) | Filters (Middle) | filterActions (Right)
 * 
 * @param {string} title - Page title
 * @param {string} subtitle - Page subtitle/description
 * @param {function} onBack - Optional back button handler
 * @param {boolean} withFilters - Show filter toolbar (default: true)
 * 
 * Filter Props:
 * @param {string} searchQuery - Current search query
 * @param {function} setSearchQuery - Search query setter
 * @param {string} startMonth - Start month for range filter
 * @param {function} setStartMonth - Start month setter
 * @param {string} endMonth - End month for range filter
 * @param {function} setEndMonth - End month setter
 * @param {string} selectedStatus - Current status filter
 * @param {function} setSelectedStatus - Status filter setter
 * @param {string} selectedCategory - Current category/priority filter
 * @param {function} setSelectedCategory - Category filter setter
 * @param {object} columnVisibility - Column visibility state from useColumnVisibility hook
 * @param {function} onClear - Clear all filters handler
 * @param {boolean} withDeptFilter - Show department filter
 * @param {string} selectedDept - Current department filter
 * @param {function} setSelectedDept - Department filter setter
 * @param {Array} departments - List of departments for dropdown
 * @param {string} searchPlaceholder - Custom placeholder for search input
 * 
 * Action Slots:
 * @param {ReactNode} headerActions - Primary page actions (top-right: Refresh, Export, Submit)
 * @param {ReactNode} filterActions - Secondary view toggles (bottom-right: Tab toggles, etc.)
 */
export default function UnifiedPageHeader({
  // Title Props
  title,
  subtitle,
  onBack,
  
  // Filter Toggle
  withFilters = true,
  
  // Filter Props
  searchQuery = '',
  setSearchQuery,
  startMonth = 'Jan',
  setStartMonth,
  endMonth = 'Dec',
  setEndMonth,
  selectedStatus = 'all',
  setSelectedStatus,
  selectedCategory = 'all',
  setSelectedCategory,
  columnVisibility,
  onClear,
  withDeptFilter = false,
  selectedDept = 'all',
  setSelectedDept,
  departments = [],
  searchPlaceholder = 'Search action plans...',
  
  // Action Slots
  headerActions,
  filterActions,
}) {
  // Dropdown open states
  const [isStartMonthOpen, setIsStartMonthOpen] = useState(false);
  const [isEndMonthOpen, setIsEndMonthOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isDeptOpen, setIsDeptOpen] = useState(false);

  // Check if any filters are active
  const hasActiveFilters = 
    searchQuery.trim() !== '' ||
    startMonth !== 'Jan' ||
    endMonth !== 'Dec' ||
    selectedStatus !== 'all' ||
    selectedCategory !== 'all' ||
    (withDeptFilter && selectedDept !== 'all');

  // Clear month filter only
  const clearMonthFilter = () => {
    setStartMonth?.('Jan');
    setEndMonth?.('Dec');
  };

  // Close all dropdowns
  const closeAllDropdowns = () => {
    setIsStartMonthOpen(false);
    setIsEndMonthOpen(false);
    setIsStatusOpen(false);
    setIsCategoryOpen(false);
    setIsDeptOpen(false);
  };

  return (
    <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="px-6 py-4 space-y-3">
        {/* ROW 1: Title & Main Actions */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            {/* Back Button (optional) */}
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
              {subtitle && <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>}
            </div>
          </div>
          
          {/* Header Actions (Top Right) */}
          {headerActions && (
            <div className="flex items-center gap-3">
              {headerActions}
            </div>
          )}
        </div>

        {/* ROW 2: Filters & Toolbar (Conditionally Rendered) */}
        {withFilters && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-3 border-t border-gray-100 overflow-visible">
            {/* LEFT: Search Bar */}
            <div className="w-64 min-w-[200px] flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery?.(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery?.('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* MIDDLE: Filters */}
            <div className="flex flex-1 items-center gap-2 flex-wrap justify-start overflow-visible">
              {/* Column Toggle */}
              {columnVisibility && (
                <ColumnToggle
                  visibleColumns={columnVisibility.visibleColumns}
                  columnOrder={columnVisibility.columnOrder}
                  toggleColumn={columnVisibility.toggleColumn}
                  moveColumn={columnVisibility.moveColumn}
                  reorderColumns={columnVisibility.reorderColumns}
                  resetColumns={columnVisibility.resetColumns}
                />
              )}

              {/* Month Range Filter */}
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shrink-0">
                <Calendar className="w-4 h-4 text-gray-500" />

                {/* Start Month Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      closeAllDropdowns();
                      setIsStartMonthOpen(!isStartMonthOpen);
                    }}
                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-teal-600 transition-colors"
                  >
                    <span>{startMonth}</span>
                    <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isStartMonthOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isStartMonthOpen && (
                    <>
                      <div className="fixed inset-0 z-[55]" onClick={() => setIsStartMonthOpen(false)} />
                      <div className="absolute top-full left-0 mt-2 w-[100px] bg-white border border-gray-100 rounded-xl shadow-xl z-[60] overflow-hidden">
                        <div className="max-h-48 overflow-y-auto p-1">
                          {MONTHS_ORDER.map((month) => (
                            <button
                              key={month}
                              onClick={() => {
                                setStartMonth?.(month);
                                if (MONTH_INDEX[month] > MONTH_INDEX[endMonth]) {
                                  setEndMonth?.(month);
                                }
                                setIsStartMonthOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                                startMonth === month
                                  ? 'bg-teal-50 text-teal-700'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {month}
                              {startMonth === month && <Check className="w-3 h-3 text-teal-600" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <span className="text-gray-400 text-sm">—</span>

                {/* End Month Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      closeAllDropdowns();
                      setIsEndMonthOpen(!isEndMonthOpen);
                    }}
                    className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-teal-600 transition-colors"
                  >
                    <span>{endMonth}</span>
                    <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isEndMonthOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isEndMonthOpen && (
                    <>
                      <div className="fixed inset-0 z-[55]" onClick={() => setIsEndMonthOpen(false)} />
                      <div className="absolute top-full right-0 mt-2 w-[100px] bg-white border border-gray-100 rounded-xl shadow-xl z-[60] overflow-hidden">
                        <div className="max-h-48 overflow-y-auto p-1">
                          {MONTHS_ORDER.map((month) => (
                            <button
                              key={month}
                              onClick={() => {
                                setEndMonth?.(month);
                                if (MONTH_INDEX[month] < MONTH_INDEX[startMonth]) {
                                  setStartMonth?.(month);
                                }
                                setIsEndMonthOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                                endMonth === month
                                  ? 'bg-teal-50 text-teal-700'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {month}
                              {endMonth === month && <Check className="w-3 h-3 text-teal-600" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Clear month filter button */}
                {(startMonth !== 'Jan' || endMonth !== 'Dec') && (
                  <button
                    onClick={clearMonthFilter}
                    className="ml-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Department Filter (optional) */}
              {withDeptFilter && (
                <div className="relative shrink-0">
                  <button
                    onClick={() => {
                      closeAllDropdowns();
                      setIsDeptOpen(!isDeptOpen);
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedDept !== 'all'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span>{selectedDept === 'all' ? 'All Depts' : selectedDept}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isDeptOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isDeptOpen && (
                    <>
                      <div className="fixed inset-0 z-[55]" onClick={() => setIsDeptOpen(false)} />
                      <div className="absolute top-full left-0 mt-2 w-[200px] bg-white border border-gray-100 rounded-xl shadow-xl z-[60] overflow-hidden">
                        <div className="max-h-64 overflow-y-auto p-1">
                          <button
                            onClick={() => {
                              setSelectedDept?.('all');
                              setIsDeptOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                              selectedDept === 'all'
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            All Departments
                            {selectedDept === 'all' && <Check className="w-3 h-3 text-blue-600" />}
                          </button>
                          {departments.map((dept) => (
                            <button
                              key={dept.code}
                              onClick={() => {
                                setSelectedDept?.(dept.code);
                                setIsDeptOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                                selectedDept === dept.code
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <span className="truncate">{dept.code} - {dept.name}</span>
                              {selectedDept === dept.code && <Check className="w-3 h-3 text-blue-600" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Status Filter */}
              <div className="relative shrink-0">
                <button
                  onClick={() => {
                    closeAllDropdowns();
                    setIsStatusOpen(!isStatusOpen);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedStatus !== 'all'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{selectedStatus === 'all' ? 'All Status' : selectedStatus}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isStatusOpen ? 'rotate-180' : ''}`} />
                </button>

                {isStatusOpen && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setIsStatusOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-[160px] bg-white border border-gray-100 rounded-xl shadow-xl z-[60] overflow-hidden">
                      <div className="p-1">
                        <button
                          onClick={() => {
                            setSelectedStatus?.('all');
                            setIsStatusOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                            selectedStatus === 'all'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          All Status
                          {selectedStatus === 'all' && <Check className="w-3 h-3 text-emerald-600" />}
                        </button>
                        {STATUS_OPTIONS.map((status) => (
                          <button
                            key={status}
                            onClick={() => {
                              setSelectedStatus?.(status);
                              setIsStatusOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                              selectedStatus === status
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {status}
                            {selectedStatus === status && <Check className="w-3 h-3 text-emerald-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Priority/Category Filter */}
              <div className="relative shrink-0">
                <button
                  onClick={() => {
                    closeAllDropdowns();
                    setIsCategoryOpen(!isCategoryOpen);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedCategory !== 'all'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Flag className="w-4 h-4" />
                  <span>{selectedCategory === 'all' ? 'All Priority' : selectedCategory}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isCategoryOpen ? 'rotate-180' : ''}`} />
                </button>

                {isCategoryOpen && (
                  <>
                    <div className="fixed inset-0 z-[55]" onClick={() => setIsCategoryOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-[160px] bg-white border border-gray-100 rounded-xl shadow-xl z-[60] overflow-hidden">
                      <div className="p-1">
                        {CATEGORY_OPTIONS.map((cat) => (
                          <button
                            key={cat.value}
                            onClick={() => {
                              setSelectedCategory?.(cat.value);
                              setIsCategoryOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                              selectedCategory === cat.value
                                ? 'bg-amber-50 text-amber-700'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {cat.label}
                            {selectedCategory === cat.value && <Check className="w-3 h-3 text-amber-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Clear All Filters Button */}
              {hasActiveFilters && (
                <button
                  onClick={onClear}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            {/* RIGHT: Filter Actions (View Toggles, Secondary Actions) */}
            {filterActions && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {filterActions}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
