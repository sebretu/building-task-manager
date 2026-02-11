import PlanPageClient from "./PlanPageClient";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanPageClient id={id} />;
}
