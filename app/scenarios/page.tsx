import ScenarioForm from '@/components/scenario-form';

export default function ScenariosPage() {
  return (
    <div className="p-4 pt-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Tax Scenarios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Model ISO, RNOR, capital gains, and rental income</p>
      </div>
      <ScenarioForm />
    </div>
  );
}
