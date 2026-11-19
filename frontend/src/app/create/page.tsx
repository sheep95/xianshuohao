import { CreateFlow } from "@/components/create-flow";
import { WorkflowShell } from "@/components/workflow-shell";
import type { SpaceType } from "@/lib/examples";
export const metadata = { title: "一起立个法 | 先说好" };
export default async function CreatePage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { space } = await searchParams;
  const initial: SpaceType = space === "short_stay" || space === "club_room" ? space : "shared_home";
  return <WorkflowShell><CreateFlow key={initial} initialSpace={initial} /></WorkflowShell>;
}

