'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, AlertTriangle, CheckCircle, XCircle, RefreshCw,
  ExternalLink, Zap, Loader2, Monitor, Server, Database, Globe, Wifi, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorGroup {
  id: string;
  source: string;
  severity: string;
  message: string;
  sample_stack: string | null;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  status: string;
  analysis: {
    rootCause: string;
    impact: string;
    suggestedFix: string;
    affectedArea: string;
    confidence: string;
  } | null;
  proposed_fix: string | null;
  github_issue_url: string | null;
}

interface ErrorEvent {
  id: string;
  source: string;
  severity: string;
  message: string;
  stack_trace: string | null;
  context: Record<string, unknown>;
  created_at: string;
}

const SOURCE_ICONS: Record<string, typeof Monitor> = {
  fe: Monitor, be: Server, db: Database, browser: Globe, network: Wifi,
};

const SOURCE_LABELS: Record<string, string> = {
  fe: 'Frontend', be: 'Backend', db: 'Database', browser: 'Browser', network: 'Network',
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

export default function ErrorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [group, setGroup] = useState<ErrorGroup | null>(null);
  const [events, setEvents] = useState<ErrorEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/errors/${id}`)
      .then(r => r.json())
      .then((data: { group: ErrorGroup; events: ErrorEvent[] }) => {
        setGroup(data.group);
        setEvents(data.events);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function performAction(action: string) {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/errors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        // Reload data
        const fresh = await fetch(`/api/errors/${id}`);
        const data = await fresh.json() as { group: ErrorGroup; events: ErrorEvent[] };
        setGroup(data.group);
        setEvents(data.events);
      }
    } catch { /* non-fatal */ }
    finally { setActionLoading(null); }
  }

  if (loading) {
    return (
      <div className="p-4 pt-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="p-4 pt-6 text-center text-gray-500">
        <p>Error not found</p>
        <button onClick={() => router.push('/errors')} className="text-sky-500 mt-2 text-sm">
          Back to errors
        </button>
      </div>
    );
  }

  const SourceIcon = SOURCE_ICONS[group.source] ?? Globe;

  return (
    <div className="p-4 pt-6 space-y-4">
      {/* Back button */}
      <button
        onClick={() => router.push('/errors')}
        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        <ArrowLeft size={16} /> Back to errors
      </button>

      {/* Error header */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-lg">
            <SourceIcon size={12} />
            {SOURCE_LABELS[group.source]}
          </span>
          <span className={cn(
            'text-xs px-2 py-1 rounded-lg font-medium',
            group.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
            group.severity === 'error' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
            group.severity === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
            'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          )}>
            {group.severity}
          </span>
          <span className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
            {group.status.replace('_', ' ')}
          </span>
        </div>

        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 break-all">
          {group.message}
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <p className="text-gray-400">Occurrences</p>
            <p className="font-bold text-gray-900 dark:text-gray-100">{group.occurrence_count}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <p className="text-gray-400">First seen</p>
            <p className="font-bold text-gray-900 dark:text-gray-100">{timeAgo(group.first_seen)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <p className="text-gray-400">Last seen</p>
            <p className="font-bold text-gray-900 dark:text-gray-100">{timeAgo(group.last_seen)}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <p className="text-gray-400">Status</p>
            <p className="font-bold text-gray-900 dark:text-gray-100 capitalize">{group.status.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Stack trace */}
        {group.sample_stack && (
          <details className="group">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
              <Eye size={12} /> Stack trace
            </summary>
            <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-xl p-3 overflow-auto whitespace-pre-wrap text-gray-700 dark:text-gray-300 max-h-60">
              {group.sample_stack}
            </pre>
          </details>
        )}
      </div>

      {/* AI Analysis */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Zap size={14} className="text-amber-500" /> AI Analysis
          </h3>
          {group.analysis && (
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full font-medium',
              group.analysis.confidence === 'high' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              group.analysis.confidence === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
            )}>
              {group.analysis.confidence} confidence
            </span>
          )}
        </div>

        {group.analysis ? (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Root Cause</p>
              <p className="text-gray-800 dark:text-gray-200">{group.analysis.rootCause}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Impact</p>
              <p className="text-gray-800 dark:text-gray-200">{group.analysis.impact}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Suggested Fix</p>
              <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-3 text-emerald-800 dark:text-emerald-300">
                {group.analysis.suggestedFix}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Affected Area</p>
              <p className="text-gray-800 dark:text-gray-200">{group.analysis.affectedArea}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            {group.status === 'analyzing' ? 'Analysis in progress...' : 'Not yet analyzed. Click "Analyze" to start.'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {group.status !== 'resolved' && (
          <ActionButton
            onClick={() => performAction('resolve')}
            loading={actionLoading === 'resolve'}
            icon={CheckCircle}
            label="Resolve"
            className="bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
          />
        )}
        {group.status !== 'ignored' && (
          <ActionButton
            onClick={() => performAction('ignore')}
            loading={actionLoading === 'ignore'}
            icon={XCircle}
            label="Ignore"
            className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700"
          />
        )}
        <ActionButton
          onClick={() => performAction('reanalyze')}
          loading={actionLoading === 'reanalyze'}
          icon={RefreshCw}
          label="Re-analyze"
          className="bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800"
        />
        {!group.github_issue_url && (
          <ActionButton
            onClick={() => performAction('create_issue')}
            loading={actionLoading === 'create_issue'}
            icon={ExternalLink}
            label="Create Issue"
            className="bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
          />
        )}
        {group.github_issue_url && (
          <a
            href={group.github_issue_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-medium bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:opacity-80"
          >
            <ExternalLink size={12} /> View Issue
          </a>
        )}
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Recent Events ({events.length})
          </h3>
          <div className="space-y-2">
            {events.map((event) => (
              <details key={event.id} className="group">
                <summary className="flex items-center justify-between text-xs cursor-pointer p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                  <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{event.message}</span>
                  <span className="text-gray-400 shrink-0 ml-2">{timeAgo(event.created_at)}</span>
                </summary>
                <div className="mt-1 ml-2 space-y-2">
                  {event.stack_trace && (
                    <pre className="text-[10px] bg-gray-50 dark:bg-gray-800 rounded-lg p-2 overflow-auto whitespace-pre-wrap text-gray-600 dark:text-gray-400 max-h-32">
                      {event.stack_trace}
                    </pre>
                  )}
                  {Object.keys(event.context).length > 0 && (
                    <pre className="text-[10px] bg-gray-50 dark:bg-gray-800 rounded-lg p-2 overflow-auto whitespace-pre-wrap text-gray-600 dark:text-gray-400 max-h-32">
                      {JSON.stringify(event.context, null, 2)}
                    </pre>
                  )}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  onClick, loading, icon: Icon, label, className,
}: {
  onClick: () => void;
  loading: boolean;
  icon: typeof CheckCircle;
  label: string;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border font-medium disabled:opacity-50 transition-colors',
        className,
      )}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
      {label}
    </button>
  );
}
