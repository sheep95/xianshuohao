"use client";
import { useEffect, useRef } from "react";
import { splitRuleText } from "@/lib/card-content";
import { ArrowDown, LifeBuoy, TriangleAlert } from "lucide-react";
import { FrictionIcon } from "@/lib/presentation";
import type { BehaviorLevel, Rule, SwapPreview } from "@/lib/room-api";

type Props = {
  leaving?: boolean; rule: Rule; levels: BehaviorLevel[] | undefined; target: string; preview: SwapPreview | null;
  busy: string; error: string; unavailable: boolean; confirmed: boolean; blocked: boolean; stale: boolean;
  onSelect: (level: string) => void; onConfirm: (checked: boolean) => void;
  onRetry: () => void; onLoadLevels: () => void; onApply: () => void; onClose: () => void;
};

export function SwapSheet(props: Props) {
  const { rule, preview, busy, blocked, stale } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current!;
    const overflow = document.body.style.overflowY;
    node.showModal();
    document.body.style.overflowY = "hidden";
    return () => {
      node.close(); document.body.style.overflowY = overflow;
    };
  }, []);
  const oldLabel = props.levels?.find((level) => level.id === rule.level_id)?.label ?? rule.action;
  const newLabel = props.levels?.find((level) => level.id === props.target)?.label ?? preview?.new_action;
  const next = preview ? splitRuleText(preview.text) : null;
  const saving = busy === "swap";
  return <dialog ref={dialog} className={"swap-dialog" + (props.leaving ? " is-leaving" : "")} aria-labelledby="swap-title" aria-describedby="swap-help"
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter((item) => item.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onCancel={(event) => { event.preventDefault(); if (!saving) props.onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !saving) props.onClose(); }}>
    <div className="swap-sheet">
      <header className="swap-sheet-header"><span className="sheet-grip" aria-hidden="true" /><h2 id="swap-title"><FrictionIcon frictionKey={rule.friction_key} size={22} /> 换个做得到的。</h2><p id="swap-help">先看看新做法。点确认前，原约定保持不变。</p></header>
      <div className="swap-sheet-body">
        <fieldset className="swap-options plain-fieldset" disabled={Boolean(busy)}><legend>想怎么换？</legend>
          <label><input type="radio" name="swap-level" value={rule.level_id} checked={props.target === rule.level_id} onChange={() => props.onSelect(rule.level_id)} /><span>只换说法</span></label>
          {props.levels?.filter((level) => level.id !== rule.level_id).map((level) => <label key={level.id}><input type="radio" name="swap-level" value={level.id} checked={props.target === level.id} onChange={() => props.onSelect(level.id)} /><span>{level.label}</span></label>)}
        </fieldset>
        {!props.levels && <p className="muted">其他做法还没加载。<button className="quiet-button" disabled={Boolean(busy)} onClick={props.onLoadLevels}>重新加载边界选项</button></p>}
        <section className="swap-original"><span className="comparison-label">原版 · 确认前仍保留</span><h3>{splitRuleText(rule.text).title}</h3><del>{rule.action}</del></section>
        <div className="swap-arrow"><span className="swap-arrow-icon" aria-hidden="true"><ArrowDown size={22} strokeWidth={2.4} /></span><p className={preview?.boundary_changed ? "boundary-notice changed" : "boundary-notice"}>{preview?.boundary_changed && <TriangleAlert size={14} aria-hidden="true" />}{preview?.boundary_changed ? `边界改变：从「${oldLabel}」变成「${newLabel}」` : "边界不变，只换个说法。"}</p></div>
        {busy === "preview" ? <div className="swap-loading" role="status">正在翻出另一种说法…</div> : preview && next ? <section className="swap-candidate"><span className="comparison-label">新版 · 你可以这样做</span><h3>{next.title}</h3><p className="candidate-action">{next.action || preview.new_action}</p><p className="draft-interface"><strong><LifeBuoy size={14} aria-hidden="true" />退路</strong>{preview.execution_hint}</p></section> : <div className="swap-loading"><p>候选暂时没拿到，原约定还在。</p><button className="quiet-button" disabled={Boolean(busy)} onClick={props.onRetry}>重新看候选</button></div>}
        {props.error && <p className="feedback error" role="alert">{props.error}{props.unavailable && preview && !stale && <button className="quiet-button" disabled={Boolean(busy)} onClick={props.onRetry}>刷新后重试</button>}</p>}
        {blocked && <p className="feedback">这条已有认领，需要创建者确认替换。</p>}
        {stale && <p className="feedback error">条文或认领人数已经更新，请重新查看并确认。<button className="quiet-button" disabled={Boolean(busy)} onClick={props.onRetry}>重新看候选</button></p>}
        {preview && <label className="confirmation swap-confirm"><input type="checkbox" checked={props.confirmed && !stale} onChange={(event) => props.onConfirm(event.target.checked)} disabled={Boolean(busy) || blocked || stale || props.unavailable} /><span>{preview.boundary_changed ? "我看过新旧边界，确认清空旧认领。" : "我确认换个说法，并清空旧认领。"}<small>{stale ? "认领情况已变化，重新查看后再确认。" : `${preview.claims_to_clear} 个认领会清空，换好后重新认领。`}</small></span></label>}
      </div>
      <footer className="swap-sheet-actions"><button className="action-button" disabled={Boolean(busy) || !preview || !props.confirmed || blocked || stale || props.unavailable} onClick={props.onApply}>{saving ? "正在换好…" : "就换这条"}</button><button className="secondary-button" disabled={saving} onClick={props.onClose}>算了，还是忍一忍</button></footer>
    </div>
  </dialog>;
}
