import { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Globe, Loader2, Eye, PenLine, Users, CalendarClock, Building2, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCompanyContext } from '../context/CompanyContext';
import { useDepartments } from '../hooks/useDepartments';

const RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

// JS getDay(): 0=Sun..6=Sat → map to Mon-first index (0=Mon..6=Sun)
function dayIndexMonFirst(date) {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function heatColor(ratio) {
  if (ratio <= 0) return 'bg-slate-50';
  if (ratio < 0.2) return 'bg-blue-100';
  if (ratio < 0.4) return 'bg-blue-200';
  if (ratio < 0.6) return 'bg-blue-300';
  if (ratio < 0.8) return 'bg-blue-400';
  return 'bg-blue-600';
}

export default function UsageAnalytics() {
  const { activeCompanyId, activeCompany, isHoldingContext } = useCompanyContext();
  const effectiveCompanyId = isHoldingContext ? null : activeCompanyId;
  const { departments } = useDepartments(effectiveCompanyId);

  const [rangeDays, setRangeDays] = useState(30);
  const [events, setEvents] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [groupMode, setGroupMode] = useState('dept'); // 'dept' | 'user'

  const getDeptName = useMemo(() => {
    const map = {};
    departments.forEach((d) => { map[(d.code || '').trim().toUpperCase()] = d.name; });
    return (code) => map[(code || '').trim().toUpperCase()] || code || 'Unknown';
  }, [departments]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setEvents([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const rangeStart = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('usage_events')
        .select('event_type, path, department_code, user_id, created_at')
        .eq('company_id', effectiveCompanyId)
        .gte('created_at', rangeStart)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[UsageAnalytics] fetch error:', error.message);
        setEvents([]);
        setUserMap({});
      } else {
        const rows = data || [];
        setEvents(rows);
        const ids = [...new Set(rows.map((e) => e.user_id).filter(Boolean))];
        if (ids.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', ids);
          if (!cancelled) {
            const map = {};
            (profiles || []).forEach((p) => { map[p.id] = p.full_name || p.email || 'Unknown'; });
            setUserMap(map);
          }
        } else {
          setUserMap({});
        }
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [effectiveCompanyId, rangeDays]);

  // ── Chart 1: Heatmap hour × day (opens = page_view + login) ──
  const heatmap = useMemo(() => {
    const grid = DAY_LABELS.map(() => HOURS.map(() => 0));
    let max = 0;
    events.forEach((e) => {
      if (e.event_type !== 'page_view' && e.event_type !== 'login') return;
      const d = new Date(e.created_at);
      const day = dayIndexMonFirst(d);
      const hour = d.getHours();
      grid[day][hour]++;
      if (grid[day][hour] > max) max = grid[day][hour];
    });
    return { grid, max };
  }, [events]);

  // ── Chart 2: Daily access curve (distinct users + opens per day) ──
  const dailyCurve = useMemo(() => {
    const byDay = {};
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay[dateKey(d)] = { date: dateKey(d), opens: 0, users: new Set() };
    }
    events.forEach((e) => {
      if (e.event_type !== 'page_view' && e.event_type !== 'login') return;
      const key = dateKey(new Date(e.created_at));
      if (!byDay[key]) return;
      byDay[key].opens++;
      if (e.user_id) byDay[key].users.add(e.user_id);
    });
    return Object.values(byDay).map((d) => ({
      date: d.date.slice(5),
      opens: d.opens,
      users: d.users.size,
    }));
  }, [events, rangeDays]);

  // ── Chart 3: Engagement ratio per dept or user (views vs writes) ──
  const engagement = useMemo(() => {
    const buckets = {};
    events.forEach((e) => {
      let key;
      let label;
      if (groupMode === 'user') {
        key = e.user_id || 'unknown';
        label = e.user_id ? (userMap[e.user_id] || 'Unknown user') : 'Unknown user';
      } else {
        key = (e.department_code || 'Unknown').trim().toUpperCase();
        label = getDeptName(key);
      }
      if (!buckets[key]) buckets[key] = { views: 0, writes: 0, name: label };
      if (e.event_type === 'page_view') buckets[key].views++;
      else if (e.event_type === 'write') buckets[key].writes++;
    });
    return Object.entries(buckets)
      .map(([key, s]) => ({
        code: key,
        name: s.name,
        views: s.views,
        writes: s.writes,
        ratio: Number((s.views / Math.max(s.writes, 1)).toFixed(1)),
      }))
      .filter((d) => d.views > 0 || d.writes > 0)
      .sort((a, b) => b.ratio - a.ratio);
  }, [events, getDeptName, groupMode, userMap]);

  const maxRatio = engagement.length ? Math.max(...engagement.map((d) => d.ratio)) : 0;

  // ── Chart 4: DAU / WAU ──
  const activeUsers = useMemo(() => {
    const byDay = {};
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay[dateKey(d)] = new Set();
    }
    events.forEach((e) => {
      if (!e.user_id) return;
      const key = dateKey(new Date(e.created_at));
      if (byDay[key]) byDay[key].add(e.user_id);
    });
    const days = Object.keys(byDay).sort();
    const series = days.map((day, idx) => {
      const dau = byDay[day].size;
      // WAU: distinct users over the trailing 7-day window ending on this day
      const wauSet = new Set();
      for (let j = Math.max(0, idx - 6); j <= idx; j++) {
        byDay[days[j]].forEach((u) => wauSet.add(u));
      }
      return { date: day.slice(5), dau, wau: wauSet.size };
    });
    const latest = series[series.length - 1] || { dau: 0, wau: 0 };
    const stickiness = latest.wau > 0 ? Math.round((latest.dau / latest.wau) * 100) : 0;
    return { series, latestDau: latest.dau, latestWau: latest.wau, stickiness };
  }, [events, rangeDays]);

  const companyName = isHoldingContext ? 'Werkudara Group Consolidated' : (activeCompany?.name || 'Company');
  const totalOpens = events.filter((e) => e.event_type === 'page_view' || e.event_type === 'login').length;
  const totalWrites = events.filter((e) => e.event_type === 'write').length;
  const hasData = events.length > 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-6 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#02378D]">Platform Insights</p>
            <h1 className="text-2xl font-black text-slate-950">Usage Analytics</h1>
            <p className="mt-1 text-sm text-slate-500">{companyName}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
            >
              {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1400px] px-6 py-6">
        {isHoldingContext ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-10 text-center">
            <Globe className="mx-auto h-10 w-10 text-amber-400" />
            <p className="mt-3 text-sm font-semibold text-amber-700">Select a subsidiary to view its usage analytics.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-500">Loading usage data...</span>
          </div>
        ) : !hasData ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <Activity className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-600">No usage data yet.</p>
            <p className="mt-1 text-sm text-slate-400">Events start recording from this release. Check back after users open the platform.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary stat cards */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-500"><Eye className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Opens</span></div>
                <p className="mt-2 text-2xl font-black text-slate-900">{totalOpens}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-500"><PenLine className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Writes</span></div>
                <p className="mt-2 text-2xl font-black text-slate-900">{totalWrites}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-500"><Users className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">DAU (latest)</span></div>
                <p className="mt-2 text-2xl font-black text-slate-900">{activeUsers.latestDau}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-slate-500"><CalendarClock className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">WAU (latest)</span></div>
                <p className="mt-2 text-2xl font-black text-slate-900">{activeUsers.latestWau}</p>
                <p className="text-[11px] text-slate-400">{activeUsers.stickiness}% stickiness (DAU/WAU)</p>
              </div>
            </div>

            {/* Chart 1: Heatmap */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-bold text-slate-800">When users open the platform</h3>
              <p className="mb-4 text-sm text-slate-500">Opens by hour of day × day of week</p>
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="flex">
                    <div className="w-10" />
                    {HOURS.map((h) => (
                      <div key={h} className="flex-1 text-center text-[9px] text-slate-400">{h % 3 === 0 ? h : ''}</div>
                    ))}
                  </div>
                  {heatmap.grid.map((row, dayIdx) => (
                    <div key={dayIdx} className="flex items-center">
                      <div className="w-10 text-[11px] font-semibold text-slate-500">{DAY_LABELS[dayIdx]}</div>
                      {row.map((count, hour) => (
                        <div
                          key={hour}
                          className={`m-[1px] flex-1 rounded-sm ${heatColor(heatmap.max ? count / heatmap.max : 0)}`}
                          style={{ aspectRatio: '1 / 1' }}
                          title={`${DAY_LABELS[dayIdx]} ${hour}:00 — ${count} opens`}
                        />
                      ))}
                    </div>
                  ))}
                  <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-slate-400">
                    <span>Less</span>
                    <span className="h-3 w-3 rounded-sm bg-slate-50 border border-slate-200" />
                    <span className="h-3 w-3 rounded-sm bg-blue-200" />
                    <span className="h-3 w-3 rounded-sm bg-blue-400" />
                    <span className="h-3 w-3 rounded-sm bg-blue-600" />
                    <span>More</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Chart 2: Daily curve */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-bold text-slate-800">Daily access curve</h3>
                <p className="mb-4 text-sm text-slate-500">Opens and distinct users per day</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyCurve} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="opens" stroke="#02378D" strokeWidth={2} dot={false} name="Opens" />
                      <Line type="monotone" dataKey="users" stroke="#f59e0b" strokeWidth={2} dot={false} name="Users" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 4: DAU/WAU */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-bold text-slate-800">Active users (DAU / WAU)</h3>
                <p className="mb-4 text-sm text-slate-500">Distinct users daily vs. rolling 7-day</p>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeUsers.series} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} />
                      <Tooltip />
                      <Line type="monotone" dataKey="dau" stroke="#10b981" strokeWidth={2} dot={false} name="DAU" />
                      <Line type="monotone" dataKey="wau" stroke="#6366f1" strokeWidth={2} dot={false} name="WAU" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Chart 3: Engagement ratio per dept or user */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-slate-800">Engagement per {groupMode === 'user' ? 'user' : 'department'}</h3>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                  <button
                    onClick={() => setGroupMode('dept')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${groupMode === 'dept' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Building2 className="h-3.5 w-3.5" /> By Dept
                  </button>
                  <button
                    onClick={() => setGroupMode('user')}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${groupMode === 'user' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <User className="h-3.5 w-3.5" /> By User
                  </button>
                </div>
              </div>
              <p className="mb-4 text-sm text-slate-500">Views vs. writes — a high view:write ratio means {groupMode === 'user' ? 'the user browses/tracks' : 'the team browses/tracks'}, not just submits</p>
              {engagement.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No {groupMode === 'user' ? 'user' : 'department'}-tagged events in range.</p>
              ) : (
                <div className="space-y-3">
                  {engagement.map((d) => (
                    <div key={d.code} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700 truncate flex-1 mr-2">{d.name}</span>
                        <span className="whitespace-nowrap text-xs text-slate-500">
                          {d.views} views · {d.writes} writes · <span className="font-bold text-slate-700">{d.ratio}×</span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${d.ratio >= 3 ? 'bg-emerald-500' : d.ratio >= 1.5 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${maxRatio ? (d.ratio / maxRatio) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
