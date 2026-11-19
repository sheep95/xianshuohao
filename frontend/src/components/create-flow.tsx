"use client";
import { addTransitionType, startTransition, useEffect, useLayoutEffect, useRef, useState, ViewTransition } from "react";
import { TransitionLink as Link, useTransitionRouter } from "./transition-link";
import { spaces, type SpaceType } from "@/lib/examples";
import { LifeBuoy, Rocket } from "lucide-react";
import { FrictionIcon, SpaceIcon } from "@/lib/presentation";
import { hintExamples } from "@/lib/hint-examples";
import { ApiError, api, completeSelections, displayTextValid, errorMessage, generateRoom, type Library, type Room, type Selection } from "@/lib/room-api";

const stepMotion = { "step-forward": "step-forward", "step-back": "step-back", default: "none" };

export function CreateFlow({ initialSpace }: { initialSpace: SpaceType }) {
  const router = useTransitionRouter();
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);
  const [space, setSpace] = useState(initialSpace);
  const [groupName, setGroupName] = useState("");
  const [nickname, setNickname] = useState("");
  const [selected, setSelected] = useState<Selection[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Room | null>(null);
  const [notice, setNotice] = useState("");
  const gate = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastStep = useRef(step);
  // Move focus to the new step title once it is committed (not on first render).
  useLayoutEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    const controller = new AbortController();
    api<Library>("/api/rule-library", { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) { setLibrary(data); setLoading(false); }
    }).catch((failure) => { if (!controller.signal.aborted) { setError(errorMessage(failure)); setLoading(false); } });
    return () => controller.abort();
  }, [retry]);
  const preview = library ? completeSelections(library, space, selected) : [];
  const suggested = preview.filter((item) => item.suggested).length;
  // Same-route step change: a transition tagged with its direction lets the
  // keyed <ViewTransition> below slide the old step out and the new one in.
  function go(next: number) {
    startTransition(() => {
      addTransitionType(next >= step ? "step-forward" : "step-back");
      setStep(next); setError(""); setConfirmed(false);
    });
  }
  function choose(frictionKey: string, levelId: string) {
    const existing = selected.find((item) => item.friction_key === frictionKey);
    if (!existing && selected.length === 5) { setNotice("已经选满 5 个。先取消一项，再加新的。"); return; }
    const choice = { friction_key: frictionKey, level_id: levelId };
    setSelected(existing ? selected.map((item) => item.friction_key === frictionKey ? choice : item) : [...selected, choice]);
    setNotice(""); setConfirmed(false);
  }
  function changeHint(frictionKey: string, hint: string) {
    setSelected((items) => items.map((item) => item.friction_key === frictionKey
      ? { ...item, custom_execution_hint: hint } : item));
    setError("");
    setConfirmed(false);
  }
  async function submit() {
    if (gate.current || !library) return;
    if (!displayTextValid(groupName) || !displayTextValid(nickname)) { setError("名字里请不要放尖括号、换行或不可见字符。"); return; }
    if (selected.some(({ custom_execution_hint }) => custom_execution_hint && !displayTextValid(custom_execution_hint))) {
      setError("自定义退路不能包含尖括号、换行或不可见字符。");
      return;
    }
    if (step < 3) { go(step + 1); return; }
    if (suggested && !confirmed) { setError("先看看补充的几条，确认后再生成。"); return; }
    gate.current = true; setBusy(true); setError("");
    let room = created;
    try {
      if (!room) {
        room = await api<Room>("/api/rooms", { body: { space_type: space, group_name: groupName.trim() || "刚凑齐的小分队", ...(nickname.trim() ? { nickname: nickname.trim() } : {}), selections: selected } });
        setCreated(room);
      }
      // Confirm only the same concrete suggestions the user just reviewed.
      const savedSelections = room.selections;
      const sameSelections = preview.length === savedSelections.length && preview.every((item, index) => {
        const saved = savedSelections[index];
        return item.friction_key === saved.friction_key && item.level_id === saved.level_id
          && item.action === saved.action && item.execution_hint === saved.execution_hint;
      });
      if (sameSelections) await generateRoom(room);
      router.push("/room/" + room.code);
    } catch (failure) {
      if (room) { router.push("/room/" + room.code); return; }
      if (failure instanceof ApiError && failure.code === "origin_forbidden") {
        setError("当前网址未获准创建房间，本次没有保存。请从项目提供的正式入口打开后再试。");
      } else if (failure instanceof ApiError && [400, 403, 409, 422, 429].includes(failure.status)) {
        setError(failure.message);
      } else {
        setError(errorMessage(failure) + " 创建结果尚未确认，请勿连续提交；如果已有房间码，可以直接进入。");
      }
    } finally { gate.current = false; setBusy(false); }
  }
  const currentSpace = spaces.find((item) => item.key === space)!;
  return <div className="create-flow">
    <ol className="step-track" aria-label="创建进度">{["选个空间", "说好边界", "看过再生成"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <ViewTransition key={step} enter={stepMotion} exit={stepMotion} default="none"><div className="step-content" data-step={step}>
    <div className="flow-heading"><h1 ref={heading} tabIndex={-1}>{step === 1 ? "你们刚凑齐在哪儿？" : step === 2 ? "哪些小事，值得提前说？" : "这五件小事，先说好。"}</h1><p>{step === 1 ? "选个空间，给这次相处留张小便签。" : step === 2 ? "每件事挑一种做法，最多 5 件。不在意的可以跳过。" : "再看一眼具体做法，生成后大家一起认领。"}</p></div>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {loading ? <div className="loading-panel" role="status">正在拿行为选项，马上就好…</div> : !library ? <div className="workflow-panel"><p>选项暂时没拿到。首页示例仍然可以玩。</p><div className="button-row"><button className="action-button" onClick={() => { setLoading(true); setError(""); setRetry(retry + 1); }}>重新加载选项</button><Link className="secondary-button" href="/" direction="back">先看示例</Link></div></div> : <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={busy || Boolean(created)} className="plain-fieldset">
      <legend className="sr-only">{step === 1 ? "选择空间并填写可选昵称" : step === 2 ? "选择最多五个具体行为边界" : "确认五条约定及补充建议"}</legend>
      {step === 1 && <div className="workflow-panel setup-panel">
        <fieldset className="plain-fieldset"><legend className="field-label">选择场合</legend><div className="scene-choices">{spaces.map((item) => <label className="scene-choice" key={item.key}><input type="radio" name="space" value={item.key} checked={space === item.key} onChange={() => { setSpace(item.key); setSelected([]); }} /><span className="scene-choice-copy"><strong><SpaceIcon space={item.key} />{item.title}</strong><small>{item.detail}</small></span></label>)}</div></fieldset>
        <div className="field-grid"><label className="text-field">房间号 / 群名 <span>可不填</span><input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={40} placeholder="例如：周末凑齐小分队" autoComplete="off" /></label><label className="text-field">你的昵称 <span>可不填，自动分配</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={20} placeholder="不用真名，能认出就行" autoComplete="off" /></label></div>
      </div>}
      {step === 2 && <>
        <div className="selection-meter"><div aria-live="polite" aria-atomic="true"><strong>已选 {selected.length}/5</strong><span>{selected.length === 5 ? "五件小事集齐，准备一起说好" : "选满 5 件，就能一起说好"}<Rocket size={15} aria-hidden="true" /></span></div><div className="meter-pips" role="progressbar" aria-label="已选摩擦点" aria-valuemin={0} aria-valuemax={5} aria-valuenow={selected.length} aria-valuetext={`已选 ${selected.length} 件，最多 5 件`}>{[0, 1, 2, 3, 4].map((index) => <span key={index} className={index < selected.length ? "is-on" : undefined} />)}</div></div>
        <div className="friction-list">{library.frictions.filter((friction) => friction.space_types.includes(space)).map((friction, index) => {
          const choice = selected.find((item) => item.friction_key === friction.key);
          return (
            <details className="friction-choice" key={friction.key} open={index === 0} data-friction={friction.key}>
              <summary><strong><FrictionIcon frictionKey={friction.key} />{friction.title}</strong><span>{choice ? "已选 1 个边界" : "展开看 3 种做法"}</span></summary>
              <fieldset className="plain-fieldset">
                <legend className="sr-only">{friction.title}的具体做法</legend>
                {friction.levels.map((level) => {
                  const chosen = choice?.level_id === level.id;
                  return <div className="behavior-choice" key={level.id}>
                    <label className="behavior-choice-label">
                      <input type="radio" name={friction.key} checked={chosen} onChange={() => choose(friction.key, level.id)} disabled={!choice && selected.length === 5} />
                      <span><strong>{level.label}</strong><span className="behavior-action">{level.action}</span><small className="behavior-hint"><span className="hint-label"><LifeBuoy size={13} strokeWidth={2} aria-hidden="true" />默认退路</span>{level.execution_hint}</small></span>
                    </label>
                    {chosen && <label className="text-field custom-hint-field">
                      自定义退路
                      <span>可选 · 最多 60 字 · 留空使用默认退路</span>
                      <input value={choice.custom_execution_hint ?? ""} onChange={(event) => changeHint(friction.key, event.target.value)} maxLength={60} placeholder={"例如：" + (hintExamples[level.id] ?? level.execution_hint)} />
                    </label>}
                  </div>;
                })}
              </fieldset>
              {choice && <button type="button" className="text-button" onClick={() => setSelected(selected.filter((item) => item.friction_key !== friction.key))}>取消这项</button>}
            </details>
          );
        })}</div>
      </>}
      {step === 3 && <div className="workflow-panel review-panel"><div className="review-heading"><h2>{groupName.trim() || "刚凑齐的小分队"}</h2><p><SpaceIcon space={currentSpace.key} size={16} /> {currentSpace.title} / {nickname.trim() || "自动分配昵称"}</p></div><ol className="review-selections">{preview.map((item) => <li key={item.friction_key}><div><strong><FrictionIcon frictionKey={item.friction_key} />{item.label}</strong>{item.suggested && <span className="suggested-label">补充建议</span>}</div><p>{item.action}</p><small><span className="hint-label"><LifeBuoy size={13} strokeWidth={2} aria-hidden="true" />退路</span>{item.execution_hint}</small></li>)}</ol>{suggested > 0 ? <label className="confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} required /><span>我看过这 {suggested} 条补充建议，同意把它们放进草案。想改可以返回上一步。</span></label> : <p className="muted">这五条都是你选的，不会另外加规则。</p>}</div>}
      </fieldset>
      <p role="status" className="flow-notice">{busy ? "正在保存房间并生成草案，请稍等…" : notice}</p>
      <div className="flow-actions">{step > 1 && <button type="button" className="secondary-button" disabled={busy || Boolean(created)} onClick={() => go(step - 1)}>上一步</button>}<button className="action-button" type="submit" disabled={busy || Boolean(created)}>{busy ? "生成中…" : step === 1 ? "下一步，选在意的点" : step === 2 ? "下一步，看看这五条" : "生成我的约定"}</button></div>
      {created && <Link className="quiet-link" href={"/room/" + created.code}>房间已保存，打开房间继续</Link>}
    </form>}
    </div></ViewTransition>
    <noscript><p className="feedback">创建流程需要 JavaScript。你仍可在首页阅读完整静态示例。</p></noscript>
  </div>;
}

