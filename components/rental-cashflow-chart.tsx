'use client';

import { fmt } from '@/lib/utils';

interface BarData {
  label: string;   // e.g. "Jan"
  rent: number;
  expenses: number;
  mortgage: number;
}

interface Props {
  data: BarData[];
  year: number;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function RentalCashflowChart({ data, year }: Props) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center py-6">
        <p className="text-xs text-gray-400">No rental records for {year}. Log monthly data to see the chart.</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.rent), 1);
  const totalRent     = data.reduce((s, d) => s + d.rent, 0);
  const totalExpenses = data.reduce((s, d) => s + d.expenses + d.mortgage, 0);
  const totalCashflow = totalRent - totalExpenses;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-gray-500">{year} Cashflow Summary</p>
          <p className={`text-sm font-semibold mt-0.5 ${totalCashflow >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {totalCashflow >= 0 ? '+' : ''}{fmt(totalCashflow)} net cashflow
          </p>
        </div>
        <div className="text-right text-xs text-gray-400">
          <p>{fmt(totalRent)} rent</p>
          <p className="text-red-400">{fmt(totalExpenses)} out</p>
        </div>
      </div>

      {/* Stacked bar chart */}
      <div className="flex items-end gap-1 h-24">
        {data.map((d, i) => {
          const rentH    = (d.rent / maxVal) * 96;
          const expH     = ((d.expenses + d.mortgage) / maxVal) * 96;
          const cashflow = d.rent - d.expenses - d.mortgage;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex flex-col justify-end" style={{ height: 96 }}>
                {/* Rent bar */}
                {d.rent > 0 && (
                  <div
                    className="w-full rounded-t bg-emerald-400 transition-all"
                    style={{ height: rentH }}
                    title={`${MONTHS_SHORT[i]} rent: ${fmt(d.rent)}`}
                  />
                )}
              </div>
              {/* Expenses overlay */}
              <div
                className="w-full absolute rounded-b bg-red-300 opacity-60"
                style={{ height: Math.min(expH, rentH), bottom: 'auto' }}
              />
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div className="flex gap-1 mt-1">
        {data.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[9px] text-gray-400">{d.label}</div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400 inline-block" /> Rent</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-300 opacity-60 inline-block" /> Expenses+Mortgage</span>
      </div>
    </div>
  );
}
