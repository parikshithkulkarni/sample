'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Zap, CheckCircle, XCircle, Filter, Monitor, Server, Database, Globe, Wifi, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorGroup {
  id: string;
  source: string;
  severity: string;
  message: string;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  status: string;
  analysis: Record<string, unknown> | null;
  github_issue_url: string | null;
}

interface Stats {
  total: number;
  new_count: number;
  critical_count: number;
  resolved_count: number;
  last_24h: number;
}

const SOURCE_ICONS: Record<string, typeof Monitor> = {
  fe: Monitor,
  be: Server,
  db: Database,
  browser: Globe,
  network: Wifi,
};

const SOURCE_LABELS: Record<string, string> = {
  fe: 'Frontend',
  be: 'Backend',
  db: 'Database',
  browser: 'Browser',
  network: 'Network',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  error: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-red-500',
  analyzing: 'bg-amber-500 animate-pulse',
  fix_proposed: 'bg-sky-500',
  fix_applied: 'bg-emerald-500',
  resolved: 'bg-gray-400',
  ignored: 'bg-gray-300 dark:bg-gray-600',
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ErrorsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const loadErrors = useCallback(async () => {
    const params = new URLSearchParams();
    if (sourceFilter) params.set('source', sourceFilter);
    if (severityFilter) params.set('severity', severityFilter);
    if (statusFilter) params.set('status', statusFilter);

    try {
      const res = await fetch(`/api/errors?${params}`);
      if (res.ok) {
        const data = await res.json() as { data: ErrorGroup[]; stats: Stats };
        setGroups(data.data);
        setStats(data.stats);
      }
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [sourceFilter, severityFilter, statusFilter]);

  useEffect(() => {
    loadErrors();
    // Poll every 10 seconds for real-time updates
    const interval = setInterval(loadErrors, 10_000);
    return () => clearInterval(interval);
  }, [loadErrors]);

  async function triggerAnalysis() {
    setAnalyzing(true);
    try {
      await fetch('/api/errors/analyze');
      await loadErrors();
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="p-4 pt-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Error Monitor</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Real-time error tracking & AI analysis</p>
        </div>
        <button
          onClick={triggerAnalysis}
          disabled={analyzing}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/40 disabled:opacity-50 font-medium"
        >
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {analyzing ? 'Analyzing...' : 'Analyze Now'}
        </button>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Last 24h" value={stats.last_24h} icon={AlertTriangle} color="text-orange-500" />
          <StatCard label="Critical" value={stats.critical_count} icon={XCircle} color="text-red-500" />
          <StatCard label="Unresolved" value={stats.new_count} icon={RefreshCw} color="text-amber-500" />
          <StatCard label="Resolved" value={stats.resolved_count} icon={CheckCircle} color="text-emerald-500" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          icon={Filter}
          label="Source"
          value={sourceFilter}
          options={[null, 'fe', 'be', 'db', 'browser', 'network']}
          optionLabels={['All', 'Frontend', 'Backend', 'Database', 'Browser', 'Network']}
          onChange={setSourceFilter}
        />
        <FilterChip
          icon={AlertTriangle}
          label="Severity"
          value={severityFilter}
          options={[null, 'critical', 'error', 'warning', 'info']}
          optionLabels={['All', 'Critical', 'Error', 'Warning', 'Info']}
          onChange={setSeverityFilter}
        />
        <FilterChip
          icon={CheckCircle}
          label="Status"
          value={statusFilter}
          options={[null, 'new', 'analyzing', 'fix_proposed', 'resolved', 'ignored']}
          optionLabels={['All', 'New', 'Analyzing', 'Fix Proposed', 'Resolved', 'Ignored']}
          onChange={setStatusFilter}
        />
      </div>

      {/* Error list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300">No errors found</h3>
          <p className="text-sm text-gray-400 mt-1">
            {sourceFilter || severityFilter || statusFilter ? 'Try adjusting your filters' : 'Your app is running smoothly'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => {
            const SourceIcon = SOURCE_ICONS[group.source] ?? Globe;
            return (
              <button
                key={group.id}
                onClick={() => router.push(`/errors/${group.id}`)}
                className="w-full text-left bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 hover:border-sky-200 dark:hover:border-sky-800 transition-colors shadow-sm"
              >
                <div className="flex items-start gap-3">
                  {/* Status dot */}
                  <div className={cn('w-2 h-2 rounded-full mt-2 shrink-0', STATUS_COLORS[group.status])} />

                  <div className="flex-1 min-w-0">
                    {/* Top row: badges */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <SourceIcon size={12} />
                        {SOURCE_LABELS[group.source] ?? group.source}
                      </span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', SEVERITY_COLORS[group.severity])}>
                        {group.severity}
                      </span>
                      {group.analysis && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 font-medium">
                          AI analyzed
                        </span>
                      )}
                      {group.github_issue_url && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 font-medium">
                          Issue created
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <p className="text-sm text-gray-800 dark:text-gray-200 truncate font-medium">
                      {group.message}
                    </p>

                    {/* Bottom row: stats */}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span>{group.occurrence_count}x</span>
                      <span>Last: {timeAgo(group.last_seen)}</span>
                      <span>First: {timeAgo(group.first_seen)}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof AlertTriangle; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color} />
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function FilterChip({
  icon: Icon,
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  icon: typeof Filter;
  label: string;
  value: string | null;
  options: (string | null)[];
  optionLabels: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="appearance-none text-xs pl-7 pr-6 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer"
      >
        {options.map((opt, i) => (
          <option key={opt ?? 'all'} value={opt ?? ''}>
            {optionLabels[i]}
          </option>
        ))}
      </select>
      <Icon size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
