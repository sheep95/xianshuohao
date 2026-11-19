"use client";
import { addTransitionType, startTransition, useEffect, useRef, useState, ViewTransition } from "react";
import { TransitionLink as Link } from "./transition-link";
import { RoomEntry } from "@/components/room-entry";
import { ConstitutionCard } from "@/components/constitution-card";
import { ArrowUpRight, Dices, HandHeart, ListChecks, Send } from "lucide-react";
import { SpaceIcon } from "@/lib/presentation";
import { exampleFromHash, examplesFor, initialExample, spaces, type ConstitutionExample, type SpaceType } from "@/lib/examples";

const cardIn = { "card-swap": "card-in", default: "none" };
const cardOut = { "card-swap": "card-out", default: "none" };

export function ExampleExplorer() {
  const [example, setExample] = useState(initialExample);
  const [announcement, setAnnouncement] = useState("");
  const card = useRef<HTMLDivElement>(null);
  const batch = examplesFor(example.space_type as SpaceType);
  const position = batch.findIndex((item) => item.id === example.id);
  useEffect(() => {
    function restore() {
      const saved = exampleFromHash(window.location.hash);
      if (saved) setExample(saved);
      else if (window.location.hash.startsWith("#example=")) setExample(initialExample);
    }
    restore();
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, []);
  function show(next: ConstitutionExample) {
    // A tagged transition lets the keyed <ViewTransition> hand the old card off to the new one.
    startTransition(() => { addTransitionType("card-swap"); setExample(next); });
    const options = examplesFor(next.space_type as SpaceType);
    setAnnouncement(`已切换到${next.group_name}，第 ${options.findIndex((item) => item.id === next.id) + 1} 套，共 ${options.length} 套。五条规则已更新。`);
    // Local fragment state keeps previews reloadable without an API request.
    window.history.replaceState(null, "", `#example=${next.id}`);
  }
  function reset() {
    show(initialExample);
    card.current?.focus({ preventScroll: true });
    card.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  return (
    <div className="example-workbench">
      <div className="intro">
        <h1>合得来，<br />从说得开开始。</h1>
        <p className="intro-description">刚凑齐的室友、旅伴和社团同伴，<br />花 3 分钟，说好 5 件小事。</p>
        <div className="intro-actions"><Link className="action-button hero-cta" href={"/create?space=" + example.space_type}>一起说好 5 件事<ArrowUpRight size={22} aria-hidden="true" /></Link></div>
        <p className="intro-reassurance">不用登录。先挑做得到的，再一起认领。</p>
        <RoomEntry />
      </div>
      <section className="example-stage" aria-label="约定示例预览">
        <div className="example-toolbar">
          <span className="batch-count">示例 {String(position + 1).padStart(2, "0")} / {String(batch.length).padStart(2, "0")}</span>
          <button type="button" className="primary-button" aria-label="换一批示例规则" onClick={() => show(batch[(position + 1) % batch.length])}>
            <Dices className="dice-icon" size={20} strokeWidth={1.7} aria-hidden="true" />
            换一组灵感
          </button>
        </div>
        <div className="card-focus-target" ref={card} tabIndex={-1} aria-label="五条示例小约定"><ViewTransition key={example.id} enter={cardIn} exit={cardOut} default="none"><ConstitutionCard example={example} /></ViewTransition></div>
        <button className="text-button example-reset" type="button" onClick={reset}>看一个四人宿舍示例</button>
      </section>
      <section className="space-picker" aria-labelledby="space-picker-title">
        <h2 id="space-picker-title">这次，在哪儿碰头？</h2>
        <div className="space-options">
          {spaces.map((space) => (
            <button key={space.key} type="button" className="space-option" aria-pressed={example.space_type === space.key} onClick={() => show(examplesFor(space.key)[0])}>
              <SpaceIcon space={space.key} />
              <span className="space-copy"><span className="space-title">{space.title}</span><span className="sr-only">{space.detail}</span></span>
            </button>
          ))}
        </div>
        <p className="picker-footnote">{spaces.find((space) => space.key === example.space_type)?.detail}</p>
      </section>
      <section className="how-it-works" id="how-it-works" aria-labelledby="how-title"><h2 id="how-title">从“这还用说吗”到“我们说好了”。</h2><ol><li><span aria-hidden="true"><ListChecks size={22} /></span><div><h3>挑 5 件小事</h3><p>外放、闹钟、遥控器……选具体做法。</p></div></li><li><span aria-hidden="true"><HandHeart size={22} /></span><div><h3>认领做得到的</h3><p>做不到就换，没人需要解释一大段。</p></div></li><li><span aria-hidden="true"><Send size={22} /></span><div><h3>存一张，发群里</h3><p>下次提醒，就有出处了。</p></div></li></ol></section>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      <noscript><p className="noscript-note">当前展示完整的四人宿舍示例。启用 JavaScript 后可切换空间和更换示例。</p></noscript>
    </div>
  );
}
