"use client";
import { useState } from "react";
import { TransitionLink as Link } from "./transition-link";
import type { Room } from "@/lib/room-api";

export function FinalizePanel({ room, disabled, onFinalize }: { room: Room; disabled: boolean; onFinalize: () => void }) {
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  if (room.status === "finalized") return <section className="finalize-panel"><h2>你们的小约定，贴好啦。</h2><p>这份约定已经保存。打开卡片，就能复制全文、保存图片或分享。</p><Link className="action-button" href={"/room/" + room.code + "/card"}>查看最终约定卡</Link></section>;
  if (room.status !== "draft") return null;
  const ready = room.rules.length === 5 && room.rules.every((rule) => rule.claim_count > 0);
  const pending = room.rules.filter((rule) => rule.claim_count === 0).length;
  return <section className="finalize-panel" aria-labelledby="finalize-heading">
    <h2 id="finalize-heading">{ready ? "五条都有人认领，可以贴出来了。" : "先有人认领，再把这页定下来。"}</h2>
    <p>{ready ? "定稿会固定现在的五条规则、人数和日期，之后不能修改这份卡。" : "还有 " + pending + " 条无人认领。可以认领，也可以先换个做得到的边界。"} 已通过不代表全员一致同意。</p>
    {room.viewer?.is_owner ? <>
      {ready && <label className="confirmation"><input type="checkbox" checked={confirmedRevision === room.revision} disabled={disabled} onChange={(event) => setConfirmedRevision(event.target.checked ? room.revision : null)} /><span>我确认定稿当前五条，之后若要改约定，就另开一份草案。</span></label>}
      <button className="action-button" disabled={disabled || !ready || confirmedRevision !== room.revision} onClick={onFinalize}>定稿，生成约定卡</button>
      {confirmedRevision !== null && confirmedRevision !== room.revision && <p className="muted">房间刚有变化，请重新确认当前版本。</p>}
    </> : <p className="muted">{ready ? "等创建者确认定稿，就能拿到最终卡片。" : "由创建者在五条都有人认领后确认定稿。"}</p>}
  </section>;
}
