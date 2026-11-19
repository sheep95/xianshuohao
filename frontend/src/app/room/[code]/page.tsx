import { RoomClient } from "@/components/room-client";
import { WorkflowShell } from "@/components/workflow-shell";
export const metadata = { title: "一起认领草案 | 先说好", robots: { index: false, follow: false } };
export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(normalized)) return <WorkflowShell><div className="empty-state"><h1>这个房间码不太对。</h1><p>房间码应为 10 位字母或数字，请回首页重新输入。</p></div></WorkflowShell>;
  return <WorkflowShell><RoomClient key={normalized} code={normalized} /></WorkflowShell>;
}

