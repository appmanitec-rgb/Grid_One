import LocationDetail from "../LocationDetail";
export default async function WarehouseLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LocationDetail key={id} id={id} />;
}
