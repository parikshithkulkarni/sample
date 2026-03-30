import FinanceOverview from '@/components/finance-overview';

export default function FinancePage() {
  return (
    <div className="p-4 pt-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Finance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Net worth, assets, and liabilities</p>
      </div>
      <FinanceOverview />
    </div>
  );
}
