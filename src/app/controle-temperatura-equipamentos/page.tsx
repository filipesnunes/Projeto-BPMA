import { TemperatureWorkflowList, type WorkflowQuery } from "./workflow-view";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<WorkflowQuery> }) {
  return <TemperatureWorkflowList query={await searchParams} />;
}
