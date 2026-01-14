import { useRef, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts';

// Conditional color based on percentage (score-centric thresholds)
const getBarColor = (value) => {
  if (value >= 80) return '#15803d'; // green-700
  if (value >= 60) return '#b45309'; // amber-700
  return '#b91c1c'; // red-700
};

// Custom tooltip - supports both score and completion modes
const CustomTooltip = ({ active, payload, label, mode = 'score' }) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const data = payload[0].payload;
    const isScoreMode = mode === 'score';
    
    return (
      <div className="bg-white px-3 py-2 shadow-lg rounded-lg border border-gray-200 z-50">
        <p className="font-medium text-gray-800 max-w-[200px] truncate">{data.fullName || label}</p>
        <p className="text-sm" style={{ color: getBarColor(value) }}>
          {isScoreMode ? 'Avg Score' : 'Completion'}: <span className="font-bold">{value}%</span>
        </p>
        {isScoreMode && data.graded != null && (
          <p className="text-xs text-gray-500">
            {data.graded} graded of {data.total} total
          </p>
        )}
        {!isScoreMode && data.total && (
          <p className="text-xs text-gray-500">
            {data.achieved} of {data.total} achieved
          </p>
        )}
      </div>
    );
  }
  return null;
};

// Custom label on top of bars
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

const MIN_BAR_WIDTH = 50;
const BAR_GAP = 15;

export default function PerformanceChart({ data, title, subtitle, xKey = 'name', yKey = 'rate', height = 300, hideHeader = false, mode = 'score' }) {
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
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}
          </>
        )}
        <div className="h-64 flex items-center justify-center text-gray-400">
          No data available
        </div>
      </div>
    );
  }

  // Calculate dynamic width: ensure minimum width per bar, but fill container if data is small
  const calculatedWidth = data.length * (MIN_BAR_WIDTH + BAR_GAP);
  const chartWidth = Math.max(containerWidth - 40, calculatedWidth);
  const needsScroll = calculatedWidth > containerWidth - 40;

  return (
    <div className={hideHeader ? '' : 'bg-white rounded-xl shadow-sm border border-gray-100 p-6'}>
      {!hideHeader && (
        <>
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          {subtitle && <p className="text-sm text-gray-500 mb-2">{subtitle}</p>}
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
