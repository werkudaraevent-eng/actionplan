import { useRef, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts';

// Conditional color based on percentage (score-centric thresholds)
const getBarColor = (value) => {
  if (value >= 80) return '#15803d'; // green-700
  if (value >= 60) return '#b45309'; // amber-700
  return '#b91c1c'; // red-700
};

// Custom tooltip - supports both score and completion modes, with text wrapping and volume context
const CustomTooltip = ({ active, payload, label, mode = 'score' }) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const data = payload[0].payload;
    const isScoreMode = mode === 'score';
    const fullName = data.fullName || label;
    
    return (
      <div className="bg-white p-4 shadow-xl rounded-xl border border-gray-100 min-w-[200px] max-w-[260px] z-50">
        {/* Title with text wrapping */}
        <p className="text-sm font-bold text-gray-800 mb-2 leading-tight break-words whitespace-normal">
          {fullName}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 font-medium">{isScoreMode ? 'Avg Score' : 'Completion'}:</span>
          <span className="text-sm font-bold" style={{ color: getBarColor(value) }}>{value}%</span>
        </div>
        {/* Volume context - always show X of Y */}
        {data.total != null && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-gray-400">Volume:</span>
            <span className="text-xs font-semibold text-gray-700">
              {isScoreMode 
                ? `${data.graded || 0} of ${data.total} graded`
                : `${data.achieved || 0} of ${data.total} achieved`
              }
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

// Custom label on top of bars (vertical)
const renderCustomLabel = (props) => {
  const { x, y, width, value } = props;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill={getBarColor(value)}
      textAnchor="middle"
      fontSize={11}
      fontWeight="600"
    >
      {value}%
    </text>
  );
};

// Custom label for horizontal bars (right side)
const renderHorizontalLabel = (props) => {
  const { x, y, width, height, value } = props;
  return (
    <text
      x={x + width + 8}
      y={y + height / 2 + 4}
      fill={getBarColor(value)}
      textAnchor="start"
      fontSize={11}
      fontWeight="600"
    >
      {value}%
    </text>
  );
};

const MIN_BAR_WIDTH = 50;
const BAR_GAP = 15;

export default function PerformanceChart({ data, title, subtitle, xKey = 'name', yKey = 'rate', height = 300, hideHeader = false, mode = 'score', layout = 'vertical' }) {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div className={hideHeader ? '' : 'bg-white rounded-xl shadow-sm border border-gray-100 p-6'}>
        {!hideHeader && (
          <>
            <h3 className="text-lg font-bold text-gray-800">{title}</h3>
            {subtitle && <p className="text-xs font-medium text-gray-500 mt-1 mb-4">{subtitle}</p>}
          </>
        )}
        <div className="h-64 flex items-center justify-center text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Horizontal layout (for strategy/PIC breakdown)
  if (layout === 'horizontal') {
    const chartHeight = Math.max(height, data.length * 35 + 40);
    
    return (
      <div className={hideHeader ? '' : 'bg-white rounded-xl shadow-sm border border-gray-100 p-6'}>
        {!hideHeader && (
          <>
            <h3 className="text-lg font-bold text-gray-800">{title}</h3>
            {subtitle && <p className="text-xs font-medium text-gray-500 mt-1 mb-2">{subtitle}</p>}
          </>
        )}
        
        <div ref={containerRef} className="overflow-y-auto" style={{ maxHeight: height }}>
          <BarChart
            width={containerWidth - 40}
            height={chartHeight}
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 50, left: 10, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis 
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis 
              type="category"
              dataKey={xKey}
              tick={{ fontSize: 11, fill: '#374151' }}
              axisLine={false}
              tickLine={false}
              width={120}
              tickFormatter={(value) => value.length > 18 ? value.substring(0, 16) + '...' : value}
            />
            <Tooltip content={<CustomTooltip mode={mode} />} cursor={{ fill: 'transparent' }} />
            <Bar 
              dataKey={yKey} 
              radius={[0, 4, 4, 0]}
              barSize={20}
              background={{ fill: '#f3f4f6', radius: [0, 4, 4, 0] }}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry[yKey])} />
              ))}
              <LabelList dataKey={yKey} content={renderHorizontalLabel} />
            </Bar>
          </BarChart>
        </div>
      </div>
    );
  }

  // Vertical layout (default - for time series)
  // Calculate dynamic width: ensure minimum width per bar, but fill container if data is small
  const calculatedWidth = data.length * (MIN_BAR_WIDTH + BAR_GAP);
  const chartWidth = Math.max(containerWidth - 40, calculatedWidth);
  const needsScroll = calculatedWidth > containerWidth - 40;

  return (
    <div className={hideHeader ? '' : 'bg-white rounded-xl shadow-sm border border-gray-100 p-6'}>
      {!hideHeader && (
        <>
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
          {subtitle && <p className="text-xs font-medium text-gray-500 mt-1 mb-2">{subtitle}</p>}
        </>
      )}
      
      {needsScroll && (
        <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
          <span>←</span> Scroll to see all {data.length} items <span>→</span>
        </p>
      )}
      
      <div 
        ref={containerRef}
        className="overflow-x-auto scrollbar-thin"
        style={{ maxWidth: '100%' }}
      >
        <div style={{ width: chartWidth, minWidth: '100%' }}>
          <BarChart
            width={chartWidth}
            height={height}
            data={data}
            margin={{ top: 30, right: 20, left: 0, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis 
              dataKey={xKey} 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={60}
              interval={0}
            />
            <YAxis 
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => `${value}%`}
              width={45}
            />
            <Tooltip content={<CustomTooltip mode={mode} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar 
              dataKey={yKey} 
              radius={[4, 4, 0, 0]}
              maxBarSize={45}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry[yKey])} />
              ))}
              <LabelList dataKey={yKey} content={renderCustomLabel} />
            </Bar>
          </BarChart>
        </div>
      </div>
    </div>
  );
}
