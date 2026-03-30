'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/lib/utils';

interface Snapshot {
  snapshot_date: string;
  net_worth: number;
  total_assets: number;
  total_liabs: number;
}

interface Props {
  compact?: boolean; // true = sparkline only (for dashboard)
}

function buildPath(values: number[], width: number, height: number, pad: number): { line: string; fill: string; lastX: number; lastY: number } {
  if (values.length < 2) return { line: '', fill: '', lastX: 0, lastY: 0 };
  const minV  = Math.min(...values);
  const maxV  = Math.max(...values);
  const range = maxV - minV || 1;
  const cW    = width - pad * 2;
  const cH    = height - pad * 2;

  const pts = values.map((v, i) => ({
    x: +(pad + (i / (values.length - 1)) * cW).toFixed(1),
    y: +(pad + cH - ((v - minV) / range) * cH).toFixed(1),
  }));

  const line = `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x},${p.y}`).join(' ');
  const lastPt = pts[pts.length - 1];
  const fill   = `${line} L ${lastPt.x},${pad + cH} L ${pts[0].x},${pad + cH} Z`;
  return { line, fill, lastX: lastPt.x, lastY: lastPt.y };
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NetWorthChart({ compact = false }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  useEffect(() => {
    fetch('/api/finance/snapshots')
      .then((r) => r.json())
      .then((data) => { const items = Array.isArray(data) ? data : data?.data ?? []; setSnapshots(items); })
      .catch(() => {});
  }, []);

  if (snapshots.length < 2) {
    if (compact) return null;
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 text-center py-8">
        <p className="text-xs text-gray-400">Net worth history will appear here once you have at least 2 days of data.</p>
      </div>
    );
  }

  const values = snapshots.map((s) => Number(s.net_worth));
  const latest = snapshots[snapshots.length - 1];
  const first  = snapshots[0];
  const change = Number(latest.net_worth) - Number(first.net_worth);
  const positive = Number(latest.net_worth) >= 0;
  const stroke   = positive ? '#10b981' : '#ef4444';
  const fillClr  = positive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';

  // ── Compact sparkline (dashboard) ───────────────────────────────────────
  if (compact) {
    const { line, fill } = buildPath(values, 100, 24, 2);
    return (
      <svg viewBox="0 0 100 24" className="w-full h-6" preserveAspectRatio="none">
        <path d={fill} fill={fillClr} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // ── Full chart ────────────────────────────────────────────────────────────
  const { line, fill, lastX, lastY } = buildPath(values, 400, 120, 8);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Net Worth Trend</p>
          <p className={`text-sm font-semibold mt-0.5 ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {change >= 0 ? '+' : ''}{fmt(change)} since {formatDate(first.snapshot_date)}
          </p>
        </div>
        <p className="text-xs text-gray-400">{snapshots.length} days tracked</p>
      </div>

      <div className="relative mt-3">
        <svg viewBox="0 0 400 120" className="w-full h-32" preserveAspectRatio="none">
          <path d={fill} fill={fillClr} />
          <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={lastX} cy={lastY} r="3.5" fill={stroke} />
        </svg>

        {/* Y-axis labels */}
        <div className="absolute top-0 right-0 flex flex-col justify-between h-32 text-right pointer-events-none pr-1">
          <span className="text-[10px] text-gray-400">{fmt(maxV)}</span>
          <span className="text-[10px] text-gray-400">{fmt(minV)}</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-gray-400">{formatDate(first.snapshot_date)}</span>
        <span className="text-[10px] text-gray-400">{formatDate(latest.snapshot_date)}</span>
      </div>

      {/* Asset / Liability bar */}
      {latest.total_assets > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl px-3 py-2">
            <p className="text-emerald-600 dark:text-emerald-400 font-medium">Assets</p>
            <p className="text-gray-800 dark:text-gray-200 font-semibold">{fmt(Number(latest.total_assets))}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/30 rounded-xl px-3 py-2">
            <p className="text-red-500 dark:text-red-400 font-medium">Liabilities</p>
            <p className="text-gray-800 dark:text-gray-200 font-semibold">{fmt(Number(latest.total_liabs))}</p>
          </div>
        </div>
      )}
    </div>
  );
}
