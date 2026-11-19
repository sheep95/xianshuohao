import { CardClient } from "@/components/card-client";
import { WorkflowShell } from "@/components/workflow-shell";
export const metadata = { title: "这五条，我们说好了 | 先说好", robots: { index: false, follow: false } };
export default async function CardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(normalized)) return <WorkflowShell><div className="empty-state"><h1>这个房间码不太对。</h1><p>请检查链接中的十位房间码，或回首页重新输入。</p></div></WorkflowShell>;
  return <WorkflowShell><CardClient key={normalized} code={normalized} /></WorkflowShell>;
}
