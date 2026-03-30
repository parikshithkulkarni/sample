'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, Trash2, GitMerge, RefreshCw, Loader2 } from 'lucide-react';

interface Issue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  entity: string;
  ids: string[];
  description: string;
  suggestion: string;
  autoFixable: boolean;
}

interface AuditData {
  summary: {
    totalAccounts: number;
    totalProperties: number;
    totalDocuments: number;
    documentsExtracted: number;
    documentsNotExtracted: number;
    totalRentalRecords: number;
    issuesByType: Record<string, number>;
    autoFixableCount: number;
  };
  issues: Issue[];
  accounts: { id: string; name: string; type: string; category: string; balance: number }[];
  properties: { id: string; address: string; purchase_date: string | null; market_value: number | null; mortgage_balance: number | null }[];
  documents: { id: string; name: string; extracted: boolean }[];
}

const severityIcon = {
  error: AlertTriangle,
  warning: Info,
  info: CheckCircle,
};

const severityColor = {
  error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300',
  warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300',
  info: 'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-300',
};

export default function AuditPage() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);

  async function loadAudit() {
    setLoading(true);
    try {
      const res = await fetch('/api/audit');
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function autoFix() {
    setFixing(true);
    setFixResult(null);
    try {
      const res = await fetch('/api/audit', { method: 'POST' });
      const result = await res.json();
      setFixResult(`Cleaned: ${result.junkDeleted} junk accounts deleted, ${result.mergedAccounts} account groups merged, ${result.mergedProperties} property groups merged.`);
      await loadAudit();
    } catch (e) {
      setFixResult(`Error: ${e}`);
    } finally {
      setFixing(false);
    }
  }

  useEffect(() => { loadAudit(); }, []);

  if (loading) {
    return (
      <div className="p-4 pt-6 flex justify-center py-20">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) return <div className="p-4 pt-6 text-red-500">Failed to load audit data</div>;

  const errors = data.issues.filter(i => i.severity === 'error');
  const warnings = data.issues.filter(i => i.severity === 'warning');
  const infos = data.issues.filter(i => i.severity === 'info');

  return (
    <div className="p-4 pt-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Data Audit</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Analyze and fix data quality issues</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadAudit} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
            <RefreshCw size={13} /> Refresh
          </button>
          {data.summary.autoFixableCount > 0 && (
            <button onClick={autoFix} disabled={fixing} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-medium disabled:opacity-50">
              {fixing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Fix All ({data.summary.autoFixableCount})
            </button>
          )}
        </div>
      </div>

      {fixResult && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
          {fixResult}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">Accounts</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{data.summary.totalAccounts}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">Properties</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{data.summary.totalProperties}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">Documents</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{data.summary.totalDocuments}</p>
          <p className="text-[10px] text-gray-400">{data.summary.documentsExtracted} extracted, {data.summary.documentsNotExtracted} pending</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
          <p className="text-xs text-gray-400">Issues Found</p>
          <p className={`text-lg font-bold ${data.issues.length > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{data.issues.length}</p>
          <p className="text-[10px] text-gray-400">{errors.length} errors, {warnings.length} warnings</p>
        </div>
      </div>

      {/* Issue breakdown */}
      {Object.entries(data.summary.issuesByType).filter(([, v]) => v > 0).length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Issues by Type</h3>
          <div className="space-y-1">
            {Object.entries(data.summary.issuesByType).filter(([, v]) => v > 0).map(([type, count]) => (
              <div key={type} className="flex justify-between text-xs">
                <span className="text-gray-600 dark:text-gray-400">{type.replace(/_/g, ' ')}</span>
                <span className="font-medium text-gray-800 dark:text-gray-200">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.issues.length === 0 && (
        <div className="text-center py-12">
          <CheckCircle size={40} className="mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All clean!</p>
          <p className="text-xs text-gray-400 mt-1">No data quality issues found</p>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1.5">
            <AlertTriangle size={14} /> Errors ({errors.length})
          </h3>
          <div className="space-y-2">
            {errors.map((issue, i) => {
              const Icon = severityIcon[issue.severity];
              return (
                <div key={i} className={`rounded-xl border px-3 py-2.5 text-xs ${severityColor[issue.severity]}`}>
                  <div className="flex items-start gap-2">
                    <Icon size={14} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">{issue.description}</p>
                      <p className="opacity-70 mt-0.5">{issue.suggestion}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-1.5">
            <Info size={14} /> Warnings ({warnings.length})
          </h3>
          <div className="space-y-2">
            {warnings.map((issue, i) => (
              <div key={i} className={`rounded-xl border px-3 py-2.5 text-xs ${severityColor[issue.severity]}`}>
                <p className="font-medium">{issue.description}</p>
                <p className="opacity-70 mt-0.5">{issue.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      {infos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-sky-600 mb-2 flex items-center gap-1.5">
            <Info size={14} /> Info ({infos.length})
          </h3>
          <div className="space-y-2">
            {infos.map((issue, i) => (
              <div key={i} className={`rounded-xl border px-3 py-2.5 text-xs ${severityColor[issue.severity]}`}>
                <p>{issue.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw data tables */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">All Accounts ({data.accounts.length})</h3>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left text-gray-500">Name</th>
                <th className="px-3 py-1.5 text-left text-gray-500">Type</th>
                <th className="px-3 py-1.5 text-left text-gray-500">Category</th>
                <th className="px-3 py-1.5 text-right text-gray-500">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map(a => (
                <tr key={a.id} className="border-t border-gray-50 dark:border-gray-800">
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{a.name}</td>
                  <td className="px-3 py-1.5 text-gray-500">{a.type}</td>
                  <td className="px-3 py-1.5 text-gray-500">{a.category}</td>
                  <td className={`px-3 py-1.5 text-right font-medium ${a.type === 'liability' ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}`}>${a.balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">All Properties ({data.properties.length})</h3>
        </div>
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left text-gray-500">Address</th>
                <th className="px-3 py-1.5 text-right text-gray-500">Value</th>
                <th className="px-3 py-1.5 text-right text-gray-500">Mortgage</th>
              </tr>
            </thead>
            <tbody>
              {data.properties.map(p => (
                <tr key={p.id} className="border-t border-gray-50 dark:border-gray-800">
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[200px]">{p.address}</td>
                  <td className="px-3 py-1.5 text-right text-gray-800 dark:text-gray-200">{p.market_value ? `$${p.market_value.toLocaleString()}` : '—'}</td>
                  <td className="px-3 py-1.5 text-right text-red-500">{p.mortgage_balance ? `$${p.mortgage_balance.toLocaleString()}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Documents ({data.documents.length})</h3>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {data.documents.map(d => (
            <div key={d.id} className="flex items-center justify-between px-4 py-2 border-t border-gray-50 dark:border-gray-800 text-xs">
              <span className="text-gray-700 dark:text-gray-300 truncate">{d.name}</span>
              <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium ${d.extracted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                {d.extracted ? 'extracted' : 'pending'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
