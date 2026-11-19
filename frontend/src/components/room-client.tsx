"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TransitionLink as Link } from "./transition-link";
import { Toast, useToast } from "@/components/toast";
import { useTransitionRouter } from "./transition-link";
import { FinalizePanel } from "@/components/finalize-panel";
import { SwapSheet } from "@/components/swap-sheet";
import { Check, LifeBuoy, Shuffle, Users } from "lucide-react";
import { FrictionIcon } from "@/lib/presentation";
import { spaces } from "@/lib/examples";
import { api, ApiError, displayTextValid, errorMessage, generateRoom, operationKey, type Library, type Room, type Rule, type SwapPreview } from "@/lib/room-api";

export function RoomClient({ code }: { code: string }) {
  const router = useTransitionRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [loadError, setLoadError] = useState("");
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState("");
  const { notice, notify } = useToast();
  const [busy, setBusy] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [suggestionsConfirmed, setSuggestionsConfirmed] = useState(false);
  const invite = typeof window === "undefined" ? "" : window.location.origin + "/room/" + code;
  const [swapId, setSwapId] = useState<string | null>(null);
  const [targetLevel, setTargetLevel] = useState("");
  const [preview, setPreview] = useState<SwapPreview | null>(null);
  const [swapConfirmed, setSwapConfirmed] = useState(false);
  const gate = useRef(false);
  const active = useRef(true);
  const sequence = useRef(0);
  const inviteInput = useRef<HTMLInputElement>(null);
  const previewController = useRef<AbortController | null>(null);
  const swapTrigger = useRef<HTMLButtonElement | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [swapped, setSwapped] = useState<{ id: string; version: number } | null>(null);
  const [sheetLeaving, setSheetLeaving] = useState(false);
  // One-shot feedback also clears on a timer (reduced motion has no animationend).
  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 1400);
    return () => window.clearTimeout(timer);
  }, [celebration]);
  useEffect(() => {
    if (!swapped) return;
    const timer = window.setTimeout(() => setSwapped(null), 1600);
    return () => window.clearTimeout(timer);
  }, [swapped]);
  // Let the sheet slide away before it unmounts; immediate with reduced motion.
  function dismissSheet(after: () => void) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { after(); return; }
    setSheetLeaving(true);
    window.setTimeout(() => { if (active.current) { setSheetLeaving(false); after(); } }, 190);
  }
  const accept = useCallback((next: Room) => { if (active.current) setRoom(next); }, []);
  useEffect(() => {
    if (!swapId && !busy && swapTrigger.current) {
      swapTrigger.current.focus({ preventScroll: true });
      swapTrigger.current = null;
    }
  }, [swapId, busy]);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const next = await api<Room>("/api/rooms/" + code);
      if (active.current && current === sequence.current) { accept(next); setLoadError(""); setMissing(false); }
    } catch (failure) {
      if (active.current && current === sequence.current) { setLoadError(errorMessage(failure)); setMissing(failure instanceof ApiError && failure.status === 404); }
    } finally { if (active.current && current === sequence.current) setRefreshing(false); }
  }, [code, accept]);
  const loadLibrary = useCallback(async () => {
    try { const result = await api<Library>("/api/rule-library"); if (active.current) setLibrary(result); }
    catch { /* Claiming and reading still work; the swap editor offers a retry. */ }
  }, []);
  useEffect(() => {
    active.current = true;
    // These loaders synchronize with the API; state updates follow awaited fetches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(); void loadLibrary();
    function sync() { if (!gate.current && document.visibilityState === "visible") void load(); }
    const timer = setInterval(sync, 8000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { previewController.current?.abort(); active.current = false; clearInterval(timer); window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", sync); };
  }, [load, loadLibrary, code]);
  function refresh() { setRefreshing(true); void load(); }
  async function mutate(label: string, request: () => Promise<Room>, message: string, after?: () => void) {
    if (gate.current) return;
    gate.current = true; sequence.current++; setBusy(label); setError(""); setRefreshing(false);
    try { const next = await request(); accept(next); if (active.current) { notify(message); setLoadError(""); after?.(); } }
    catch (failure) {
      if (!active.current) return;
      setError(errorMessage(failure));
      if (failure instanceof ApiError && (failure.status === 409 || failure.status === 403)) { setPreview(null); setSwapConfirmed(false); }
      await load();
    } finally { gate.current = false; if (active.current) setBusy(""); }
  }
  async function join() {
    if (!displayTextValid(nickname)) { setError("昵称请不要包含尖括号、换行或不可见字符。"); return; }
    await mutate("join", () => api<Room>("/api/rooms/" + code + "/join", { body: nickname.trim() ? { nickname: nickname.trim() } : {} }), "已加入，可以认领你愿意执行的条文了。");
  }
  async function copyInvite() {
    try { await navigator.clipboard.writeText(invite); notify("邀请链接已复制，发给同伴即可。"); }
    catch { inviteInput.current?.focus(); inviteInput.current?.select(); notify("没有拿到剪贴板权限，已选中链接，可以手动复制。"); }
  }
  function openSwap(rule: Rule, trigger: HTMLButtonElement) {
    swapTrigger.current = trigger;
    setSwapId(rule.id); setTargetLevel(rule.level_id); setPreview(null); setSwapConfirmed(false); setError("");
    void previewSwap(rule, rule.level_id);
  }
  function closeSwap() {
    if (sheetLeaving) return;
    previewController.current?.abort();
    dismissSheet(() => { setSwapId(null); setPreview(null); setSwapConfirmed(false); setError(""); });
  }
  async function previewSwap(rule: Rule, target = targetLevel) {
    if (gate.current) return;
    const controller = new AbortController(); previewController.current = controller;
    gate.current = true; sequence.current++; setBusy("preview"); setPreview(null); setSwapConfirmed(false); setError("");
    try {
      const next = await api<SwapPreview>("/api/rules/" + rule.id + "/swap", { body: { expected_version: rule.version, mode: "preview", target_level_id: target }, signal: controller.signal });
      if (loadError && !controller.signal.aborted) await load();
      if (active.current && !controller.signal.aborted) { setPreview(next); setSwapConfirmed(false); }
    } catch (failure) { if (active.current && !controller.signal.aborted) { setError(errorMessage(failure)); setPreview(null); await load(); } }
    finally { gate.current = false; if (active.current) setBusy(""); }
  }
  function applySwap() {
    if (!preview || !swapConfirmed) return;
    const currentRule = room?.rules.find((rule) => rule.id === preview.rule_id);
    if (!currentRule || currentRule.version !== preview.expected_version || currentRule.claim_count !== preview.claims_to_clear) return;
    const body = { expected_version: preview.expected_version, expected_claim_count: preview.claims_to_clear, mode: "apply", target_level_id: preview.target_level_id, confirmed: true };
    void mutate("swap", () => api<Room>("/api/rules/" + preview.rule_id + "/swap", { body, key: operationKey("swap:" + preview.rule_id + ":" + preview.expected_version + ":" + preview.target_level_id + ":" + preview.claims_to_clear) }), "已替换。旧认领已清空，这条现在待议，需要重新认领。", () => {
      const updated = { id: preview.rule_id, version: preview.expected_version + 1 };
      // Highlight the replaced card once the sheet is out of the way.
      dismissSheet(() => { setSwapped(updated); setSwapId(null); setPreview(null); });
    });
  }
  if (!room) return <div className="empty-state"><h1>{loadError ? missing ? "这个房间还没找到。" : "暂时没连上房间。" : "正在打开你们的草案…"}</h1>{loadError ? <><p role="alert">{loadError}</p><div className="button-row"><button className="action-button" disabled={refreshing} onClick={refresh}>{refreshing ? "正在重试…" : "重新查找"}</button><Link className="secondary-button" href="/" direction="back">回首页输入房间码</Link></div></> : <p role="status">不需要登录，先看看大家说好了什么。</p>}</div>;
  const owner = Boolean(room.viewer?.is_owner);
  const finalized = room.status === "finalized";
  const claimed = room.rules.filter((rule) => rule.claim_count > 0).length;
  const scene = spaces.find((item) => item.key === room.space_type)!;
  const selectedRule = room.rules.find((rule) => rule.id === swapId);
  const previewStale = preview && selectedRule && (preview.expected_version !== selectedRule.version || preview.claims_to_clear !== selectedRule.claim_count);
  const previewBlocked = preview && preview.requires_owner && !owner;
  return <div className="room-workspace">
    <header className="room-heading"><div><p className="room-state">{finalized ? "已定稿" : room.status === "setup" ? "房间已创建" : "一起认领草案"}</p><h1>{room.group_name}</h1><p>{scene.title} / <span data-testid="participant-count">{room.participant_count} 人已加入</span></p></div><div className="room-code"><span>房间码</span><strong>{room.code}</strong></div></header>
    <div className="invite-strip"><label className="text-field">{finalized ? "房间链接" : "把链接发给刚凑齐的同伴"}<input ref={inviteInput} readOnly value={invite} onFocus={(event) => event.target.select()} /></label><button className="secondary-button" onClick={() => void copyInvite()}>复制邀请链接</button><button className="quiet-button" disabled={Boolean(busy) || refreshing} onClick={refresh}>{refreshing ? "刷新中…" : "刷新最新状态"}</button></div>
    {loadError && <div className="feedback error" role="alert">{loadError} 当前显示上次取得的草案，操作前请刷新。</div>}
    {error && !swapId && <div className="feedback error" role="alert">{error}<button className="quiet-button" onClick={() => setError("")}>收起提示</button></div>}
    <Toast notice={notice} />
    {busy && <span className="sr-only" role="status">{busy === "preview" ? "正在读取候选" : "正在保存"}</span>}
    {!room.viewer && !finalized && <form className="join-panel workflow-panel" onSubmit={(event) => { event.preventDefault(); void join(); }}><div><h2>这份约定，也算你一份。</h2><p>用昵称加入后再认领，不用注册。同名也会分别计数。</p></div><label className="text-field">你的昵称<input maxLength={20} placeholder="可不填，自动分配" value={nickname} onChange={(event) => setNickname(event.target.value)} autoComplete="off" disabled={Boolean(busy)} /></label><button className="action-button" type="submit" disabled={Boolean(busy)}>{busy === "join" ? "加入中…" : "匿名加入房间"}</button></form>}
    {room.viewer && <p className="member-note">你是 {room.viewer.nickname}{owner ? "，也是这间房的创建者" : ""}。身份保存在当前浏览器，换浏览器需重新加入。</p>}
    {room.status === "setup" ? <section className="workflow-panel setup-review"><h2>{owner ? "房间留好了，再看一眼这五条。" : "底稿在这里，等创建者生成。"}</h2><ol className="review-selections">{room.selections.map((item) => <li key={item.friction_key}><div><FrictionIcon frictionKey={item.friction_key} /><strong>{item.label}</strong>{item.suggested && <span className="suggested-label">补充建议</span>}</div><p>{item.action}</p><small><span className="hint-label"><LifeBuoy size={13} aria-hidden="true" />退路</span>{item.execution_hint}</small></li>)}</ol>{owner && <><label className="confirmation"><input type="checkbox" checked={suggestionsConfirmed} onChange={(event) => setSuggestionsConfirmed(event.target.checked)} disabled={Boolean(busy)} /><span>我已经看过这五条及其中的补充建议，可以生成。</span></label><button className="action-button" disabled={!suggestionsConfirmed || Boolean(busy) || Boolean(loadError)} onClick={() => void mutate("generate", () => generateRoom(room), "草案已生成，挑一条你愿意认领的吧。")}>生成我的约定</button></>}</section> : <>
      <div className="draft-summary"><h2>{finalized ? "你们通过的约定" : "认领一条，从“我可以”开始。"}</h2><strong>{claimed}/5 已通过</strong><p>至少一人认领就算通过，不代表所有人一致同意。一个人也可以认领多条。</p></div>
      <ol className="draft-rules" data-count={room.rules.length}>{room.rules.map((rule, index) => <li key={rule.id} className={"draft-rule" + (rule.claim_count ? " is-claimed" : "") + (celebration === rule.id ? " is-celebrating" : "") + (swapped?.id === rule.id && swapped.version === rule.version ? " is-swapped" : "")} data-rule-id={rule.id} data-version={rule.version}>
        {swapped?.id === rule.id && swapped.version === rule.version && (
          <span key={rule.version} aria-hidden="true" className="swap-flash" onAnimationEnd={(event) => { if (event.target === event.currentTarget) setSwapped(null); }}><Check size={22} strokeWidth={3} /></span>
        )}
        <div className="draft-rule-rail"><FrictionIcon frictionKey={rule.friction_key} size={22} /><span className="draft-number">小事 {String(index + 1).padStart(2, "0")}</span></div>
        <div className="draft-rule-body">
          <div className="draft-rule-top"><h3>{rule.text.split("。 ")[0]}。</h3><span className={rule.claim_count ? "rule-status claimed" : "rule-status"}>{rule.claim_count ? <><Check size={13} strokeWidth={3} aria-hidden="true" />已通过</> : rule.status === "debating" ? "待议" : "无人认领"}</span></div>
          <p className="draft-action">{rule.action}</p><p className="draft-interface"><strong><LifeBuoy size={14} aria-hidden="true" />退路</strong>{rule.execution_hint}</p>
          <p className="claim-details"><Users size={14} aria-hidden="true" />{rule.claim_count ? room.viewer ? "已认领：" + rule.claims.map((claim) => claim.nickname).join("、") : rule.claim_count + " 人已认领；加入后可见昵称。" : "还没人认领，先看看这个边界做不做得到。"}</p>
        </div>
        {!finalized && (room.viewer ? <div className="button-row draft-rule-actions"><button className="action-button" disabled={Boolean(busy) || Boolean(loadError) || rule.claimed_by_me} onClick={() => void mutate("claim:" + rule.id, () => api<Room>("/api/rules/" + rule.id + "/claim", { body: { expected_version: rule.version } }), "已认领这条。你们的草案已保存。", () => setCelebration(rule.id))}>{rule.claimed_by_me ? <><Check size={16} aria-hidden="true" />我已认领</> : "我来认领这条"}</button>{celebration === rule.id && <span className="claim-pop" aria-hidden="true" onAnimationEnd={(event) => { if (event.target === event.currentTarget) setCelebration(null); }}><b className="claim-stamp"><Check size={14} strokeWidth={3} />接住啦</b></span>}<button className="secondary-button" disabled={Boolean(busy) || Boolean(loadError)} onClick={(event) => openSwap(rule, event.currentTarget)}><Shuffle size={15} aria-hidden="true" />这条我做不到，换一条</button></div> : <p className="muted draft-rule-actions">加入房间后，可以认领或预览替换。</p>)}
      </li>)}</ol>
      {finalized ? <p className="saved-note">{room.snapshot?.oath} 本房间已定稿，条文保持原样。</p> : claimed === 5 ? <p className="saved-note">五条都有人认领了。草案已保存，大家可以继续查看。</p> : <p className="saved-note">认领和换条都会自动保存，暂时没共识的条文可以先留着。</p>}
      <FinalizePanel room={room} disabled={Boolean(busy) || Boolean(loadError) || refreshing} onFinalize={() => void mutate("finalize", () => api<Room>("/api/rooms/" + code + "/finalize", { body: { expected_revision: room.revision }, key: operationKey("finalize:" + code + ":" + room.revision) }), "已定稿，正在打开约定卡。", () => router.push("/room/" + code + "/card"))} />
    </>}
    {selectedRule && swapId && !finalized && <SwapSheet key={swapId} leaving={sheetLeaving} rule={selectedRule} levels={library?.frictions.find((item) => item.key === selectedRule.friction_key)?.levels} target={targetLevel} preview={preview} busy={busy} error={error || loadError} unavailable={Boolean(loadError)} confirmed={swapConfirmed} blocked={Boolean(previewBlocked)} stale={Boolean(previewStale)} onConfirm={setSwapConfirmed} onClose={closeSwap} onSelect={(target) => { setTargetLevel(target); void previewSwap(selectedRule, target); }} onRetry={() => void previewSwap(selectedRule)} onLoadLevels={() => void loadLibrary()} onApply={applySwap} />}
    <noscript><p className="feedback">房间交互需要 JavaScript。首页静态示例仍可阅读。</p></noscript>
  </div>;
}


