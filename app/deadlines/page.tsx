import DeadlineList from '@/components/deadline-list';

export default function DeadlinesPage() {
  return (
    <div className="p-4 pt-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Deadlines</h1>
        <p className="text-sm text-gray-500">Tax dates, visa milestones, property deadlines</p>
      </div>
      <DeadlineList />
    </div>
  );
}
