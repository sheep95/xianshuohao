"use client";
import { useEffect, useRef, useState } from "react";
import { TransitionLink as Link } from "./transition-link";
import { Toast, useToast } from "@/components/toast";
import { api, ApiError, errorMessage, type Room } from "@/lib/room-api";
import { cardPlainText } from "@/lib/card-content";
import { FinalConstitution } from "@/components/final-constitution";
import { openingHref } from "@/components/intro-splash";

export function CardClient({ code }: { code: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const { notice, notify } = useToast();
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [fallback, setFallback] = useState<{ label: string; text: string } | null>(null);
  const [overview, setOverview] = useState(false);
  const [measure, setMeasure] = useState({ width: 720, height: 1000, available: 720, viewport: 900 });
  const frameRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const saving = useRef(false);
  const live = useRef(true);
  const snapshot = room?.status === "finalized" ? room.snapshot : null;
  useEffect(() => {
    const controller = new AbortController();
    live.current = true;
    api<Room>("/api/rooms/" + code, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setRoom(result); setError(""); setLoading(false); }
    }).catch((failure) => {
      if (!controller.signal.aborted) { setError(errorMessage(failure)); setMissing(failure instanceof ApiError && failure.status === 404); setLoading(false); }
    });
    return () => { controller.abort(); live.current = false; };
  }, [code, retry]);
  useEffect(() => {
    if (!snapshot || !frameRef.current || !sheetRef.current) return;
    const frame = frameRef.current;
    const sheet = sheetRef.current;
    function measureCard() {
      setMeasure({ width: sheet.offsetWidth, height: sheet.offsetHeight, available: frame.clientWidth, viewport: window.innerHeight });
    }
    const observer = new ResizeObserver(measureCard);
    observer.observe(frame); observer.observe(sheet);
    window.addEventListener("resize", measureCard);
    return () => { observer.disconnect(); window.removeEventListener("resize", measureCard); };
  }, [snapshot, overview]);
  function reload() { setLoading(true); setError(""); setRetry(retry + 1); }
  async function copy(text: string, label: string) {
    setFallback(null); setExportError("");
    try {
      await navigator.clipboard.writeText(text);
      if (live.current) notify(label + "已复制，可以发到群里了。");
    } catch {
      if (live.current) { setFallback({ label, text }); notify("浏览器没允许自动复制，下面的内容可以选中后手动复制。"); }
    }
  }
  async function share() {
    if (!snapshot) return;
    const url = window.location.origin + "/room/" + snapshot.code + "/card";
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: "先说好｜" + snapshot.group_name, text: "这五条，我们说好了。", url }); if (live.current) notify("分享面板已完成操作。"); return; }
      catch (failure) {
        if (failure instanceof Error && failure.name === "AbortError") { if (live.current) notify("已取消分享，卡片仍在这里。"); return; }
      }
    }
    await copy(url, "卡片链接");
  }
  async function saveImage() {
    if (saving.current || !snapshot || !exportRef.current) return;
    saving.current = true; setExporting(true); setExportError(""); notify("正在把完整约定卡做成图片…");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const node = exportRef.current;
      const render = async () => {
        const { toBlob } = await import("html-to-image");
        await document.fonts.ready;
        const blob = await toBlob(node, {
          pixelRatio: 2, width: node.offsetWidth, height: node.offsetHeight,
          skipFonts: true, cacheBust: false,
          backgroundColor: getComputedStyle(node).backgroundColor,
        });
        if (!blob || blob.size === 0) throw new Error("empty_image");
        return blob;
      };
      const blob = await Promise.race([
        render(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("export_timeout")), 20_000); }),
      ]);
      if (!live.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "先说好-" + snapshot.code + "-" + snapshot.adopted_date + ".png";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      window.location.assign(openingHref);
    } catch {
      if (live.current) { setExportError("图片暂时没生成成功。可以重试，也可以切换整卡预览截图，或先复制全文。"); notify(""); }
    } finally { if (timer) clearTimeout(timer); saving.current = false; if (live.current) setExporting(false); }
  }
  function toggleOverview() {
    setOverview(!overview);
    if (!overview) requestAnimationFrame(() => frameRef.current?.scrollIntoView({ block: "center", behavior: "instant" }));
  }
  if (loading) return <div className="empty-state"><h1>正在取出你们的约定卡…</h1><p role="status">约定、人数和日期都以定稿时为准。</p></div>;
  if (error || !room) return <div className="empty-state"><h1>{missing ? "这张卡还没找到。" : "暂时没拿到约定卡。"}</h1><p role="alert">{error || "请稍后再试。"}</p><div className="button-row"><button className="action-button" onClick={reload}>重新加载卡片</button><Link className="secondary-button" href="/" direction="back">回首页</Link></div></div>;
  if (!snapshot) return <div className="empty-state"><h1>{room.status === "finalized" ? "定稿记录暂时没有完整返回。" : "这份草案，还没定稿。"}</h1><p>{room.status === "finalized" ? "请重新加载，不会用草案内容代替最终卡。" : "先让五条都有人认领，再由创建者确认，就能生成最终卡。"}</p><div className="button-row"><Link className="action-button" href={"/room/" + code} direction="back">回房间看看</Link><button className="secondary-button" onClick={reload}>重新加载卡片</button></div></div>;
  const scale = Math.min(1, measure.available / measure.width, Math.max(180, measure.viewport - 140) / measure.height);
  return <div className="card-page">
    <header className="card-page-heading"><h1>这五条，我们说好了。</h1><p>存一张，发群里。下次提醒，就有出处了。</p></header>
    <div className="card-toolbar" aria-label="约定卡操作">
      <button className="action-button" disabled={exporting} onClick={() => void saveImage()}>{exporting ? "正在生成图片…" : "保存图片"}</button>
      <button className="secondary-button" onClick={() => void copy(cardPlainText(snapshot), "约定全文")}>复制全文</button>
      <button className="secondary-button" onClick={() => void share()}>分享链接</button>
      <button className="quiet-button" aria-pressed={overview} onClick={toggleOverview}>{overview ? "放大阅读" : "整卡预览"}</button>
    </div>
    <Toast notice={notice} />
    {exportError && <p className="feedback error" role="alert">{exportError}</p>}
    {fallback && <section className="copy-fallback"><label className="text-field">手动复制{fallback.label}<textarea readOnly value={fallback.text} rows={fallback.label === "约定全文" ? 10 : 3} autoFocus onFocus={(event) => event.target.select()} /></label><button className="quiet-button" onClick={() => setFallback(null)}>收起复制内容</button></section>}
    <div ref={frameRef} className={"card-view" + (overview ? " is-overview" : "")} style={overview ? { height: Math.ceil(measure.height * scale) } : undefined}>
      <div ref={sheetRef} className="card-sheet" style={overview ? { transform: "translateX(-50%) scale(" + scale + ")" } : undefined}><FinalConstitution snapshot={snapshot} /></div>
    </div>
    <p className="card-mode-note">{overview ? "整张卡都在这里，想看清小字就切回放大阅读。" : "每条约定都完整保留。存成图片，放大也能慢慢看。"}</p>
    <div className="card-aftercare"><p>定稿后这张卡保持原样。想换一批，就另开一份草案。</p><div className="button-row"><a className="action-button" href={openingHref}>完成，回到引导页</a><Link className="secondary-button" href={"/create?space=" + snapshot.space_type}>换一批，另开草案</Link><Link className="quiet-link" href={"/room/" + code} direction="back">查看原房间</Link></div></div>
    <div className="card-export" aria-hidden="true"><div className="card-export-sheet" ref={exportRef}><FinalConstitution snapshot={snapshot} /></div></div>
  </div>;
}

