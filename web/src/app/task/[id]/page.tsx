import TaskClient from "./TaskClient";

// Allow any dynamic task ID in static export
export const dynamicParams = true;
export async function generateStaticParams() { return []; }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskClient id={id} />;
}
