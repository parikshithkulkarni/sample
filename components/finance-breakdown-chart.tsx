'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/lib/utils';

interface Account {
  type: 'asset' | 'liability';
  category: string;
  balance: number;
}

const PALETTE = [
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#a855f7', // purple-500
];

function labelFor(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildDonutPath(cx: number, cy: number, r: number, innerR: number, startAngle: number, endAngle: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const ix1 = cx + innerR * Math.cos(toRad(endAngle));
  const iy1 = cy + innerR * Math.sin(toRad(endAngle));
  const ix2 = cx + innerR * Math.cos(toRad(startAngle));
  const iy2 = cy + innerR * Math.sin(toRad(startAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

export default function FinanceBreakdownChart() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tab, setTab] = useState<'assets' | 'liabilities'>('assets');

  useEffect(() => {
    fetch('/api/finance').then((r) => r.json()).then((data) => setAccounts(Array.isArray(data) ? data : data?.data ?? []));
  }, []);

  const filtered = accounts.filter((a) => a.type === (tab === 'assets' ? 'asset' : 'liability'));
  const total = filtered.reduce((s, a) => s + Number(a.balance), 0);

  // Group by category
  const groups: Record<string, number> = {};
  for (const a of filtered) {
    groups[a.category] = (groups[a.category] ?? 0) + Number(a.balance);
  }
  const entries = Object.entries(groups)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) return null;

  // Build donut segments
  const cx = 80, cy = 80, r = 68, innerR = 42;
  let angle = -90;
  const segments = entries.map(([cat, val], i) => {
    const sweep = (val / total) * 360;
    const path = buildDonutPath(cx, cy, r, innerR, angle, angle + sweep - 0.5);
    const midAngle = angle + sweep / 2;
    const midRad = (midAngle * Math.PI) / 180;
    const labelR = r + 14;
    const lx = cx + labelR * Math.cos(midRad);
    const ly = cy + labelR * Math.sin(midRad);
    const color = PALETTE[i % PALETTE.length];
    const start = angle;
    angle += sweep;
    return { cat, val, path, color, pct: (val / total) * 100, lx, ly, start };
  });

  const hoveredEntry = hovered ? entries.find(([cat]) => cat === hovered) : null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Portfolio Breakdown</h3>
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
          <button
            onClick={() => setTab('assets')}
            className={`px-3 py-1 ${tab === 'assets' ? 'bg-sky-500 text-white' : 'text-gray-500'}`}
          >
            Assets
          </button>
          <button
            onClick={() => setTab('liabilities')}
            className={`px-3 py-1 ${tab === 'liabilities' ? 'bg-sky-500 text-white' : 'text-gray-500'}`}
          >
            Liabilities
          </button>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Donut */}
        <div className="relative shrink-0">
          <svg width={160} height={160} viewBox="0 0 160 160">
            {segments.map((s) => (
              <path
                key={s.cat}
                d={s.path}
                fill={s.color}
                opacity={hovered && hovered !== s.cat ? 0.3 : 1}
                onMouseEnter={() => setHovered(s.cat)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer transition-opacity"
              />
            ))}
            {/* Center label */}
            <text x={cx} y={cy - 8} textAnchor="middle" className="text-xs" fill="#6b7280" fontSize={10}>
              {hoveredEntry ? labelFor(hoveredEntry[0]) : 'Total'}
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle" fill="#111827" fontSize={12} fontWeight="600">
              {hoveredEntry ? fmt(hoveredEntry[1]) : fmt(total)}
            </text>
            {hoveredEntry && (
              <text x={cx} y={cy + 22} textAnchor="middle" fill="#6b7280" fontSize={10}>
                {((hoveredEntry[1] / total) * 100).toFixed(1)}%
              </text>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 space-y-1.5 pt-1">
          {segments.map((s) => (
            <div
              key={s.cat}
              className="flex items-center gap-2 cursor-pointer"
              onMouseEnter={() => setHovered(s.cat)}
              onMouseLeave={() => setHovered(null)}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                style={{ backgroundColor: s.color, opacity: hovered && hovered !== s.cat ? 0.3 : 1 }}
              />
              <span className="text-xs text-gray-600 truncate flex-1">{labelFor(s.cat)}</span>
              <span className="text-xs font-medium text-gray-800 shrink-0">{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
