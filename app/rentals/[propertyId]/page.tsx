import RentalPropertyDetail from '@/components/rental-property-detail';

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return (
    <div className="p-4 pt-6">
      <RentalPropertyDetail propertyId={propertyId} />
    </div>
  );
}
