import RentalPortfolio from '@/components/rental-portfolio';

export default function RentalsPage() {
  return (
    <div className="p-4 pt-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Rental Properties</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Portfolio performance, P&amp;L, and ROI</p>
      </div>
      <RentalPortfolio />
    </div>
  );
}
