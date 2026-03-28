import DashboardCards from '@/components/dashboard-cards';

export default function DashboardPage() {
  return (
    <div className="p-4 pt-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Second Brain</h1>
        <p className="text-sm text-gray-500">Your private AI knowledge system</p>
      </div>
      <DashboardCards />
    </div>
  );
}
