import { Target, TrendingUp, CheckCircle2, Clock, AlertCircle, X, Star, Send } from 'lucide-react';

export default function DashboardCards({ data }) {
  const total = data.length;
  const achieved = data.filter((item) => item.status === 'Achieved').length;
  const inProgress = data.filter((item) => item.status === 'On Progress').length;
  const pending = data.filter((item) => item.status === 'Pending').length;
  const notAchieved = data.filter((item) => item.status === 'Not Achieved').length;
  
  // Submission Progress: How many items have been finalized/submitted
  const submittedItems = data.filter(item => item.submission_status === 'submitted').length;
  const submissionProgress = total > 0 ? ((submittedItems / total) * 100).toFixed(0) : 0;
  
  // Calculate Average Score (only finalized items with scores count) - THE HERO METRIC
  const gradedItems = data.filter(item => 
    item.submission_status === 'submitted' && item.quality_score != null
  );
  const avgScoreNum = gradedItems.length > 0 
    ? gradedItems.reduce((sum, item) => sum + item.quality_score, 0) / gradedItems.length
    : null;
  const avgScoreDisplay = avgScoreNum !== null ? `${avgScoreNum.toFixed(0)}%` : '—';
  
  // Dynamic color for Quality Score based on performance
  const getScoreColor = (score) => {
    if (score === null) return { bg: 'bg-gray-400', text: 'text-gray-600' };
    if (score >= 80) return { bg: 'bg-green-500', text: 'text-green-600' };
    if (score >= 60) return { bg: 'bg-amber-500', text: 'text-amber-600' };
    return { bg: 'bg-red-500', text: 'text-red-600' };
  };
  const scoreColors = getScoreColor(avgScoreNum);

  const cards = [
    { label: 'Total Plans', value: total, icon: Target, color: 'bg-teal-500', textColor: 'text-teal-600' },
    { label: 'Quality Score', value: avgScoreDisplay, icon: Star, color: scoreColors.bg, textColor: scoreColors.text, isHero: true },
    { label: 'Submission Progress', value: `${submissionProgress}%`, icon: Send, color: 'bg-slate-500', textColor: 'text-slate-600' },
    { label: 'Achieved', value: achieved, icon: CheckCircle2, color: 'bg-green-500', textColor: 'text-green-600' },
    { label: 'In Progress', value: inProgress, icon: Clock, color: 'bg-yellow-500', textColor: 'text-yellow-600' },
    { label: 'Not Achieved', value: notAchieved, icon: X, color: 'bg-red-500', textColor: 'text-red-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {cards.map((card, idx) => (
        <div key={idx} className={`bg-white rounded-xl shadow-sm border p-4 ${
          card.isHero ? 'border-2 border-purple-200 ring-1 ring-purple-100' : 'border-gray-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center`}>
              <card.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className={`text-2xl font-bold ${card.textColor}`}>{card.value}</p>
              <p className="text-xs text-gray-500">{card.label}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
