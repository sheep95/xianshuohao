"use client";
import { useState } from "react";
import type { ConstitutionExample } from "@/lib/examples";
import { ChevronDown, Handshake, LifeBuoy } from "lucide-react";
import { FrictionIcon } from "@/lib/presentation";
import { splitRuleText } from "@/lib/card-content";

export function ConstitutionCard({ example }: { example: ConstitutionExample }) {
  const [expanded, setExpanded] = useState(false);
  return <article className="constitution" aria-labelledby="constitution-title" data-example-id={example.id}>
    <header>
      <div className="constitution-topline"><span>{example.group_name}</span><span className="sample-mark">试玩便签</span></div>
      <div className="constitution-heading"><div><h2 id="constitution-title">先把小事说好。</h2><p>点开一条，看看有没有你的生活。</p></div><span className="memo-sticker" aria-hidden="true"><Handshake size={24} strokeWidth={1.8} /></span></div>
      <dl className="constitution-meta"><div><dt className="sr-only">空间</dt><dd>{example.space_label}</dd></div><div><dt>示例</dt><dd>{example.participant_count} 人</dd></div></dl>
    </header>
    <ol className="constitution-rules" key={String(expanded)}>{example.rules.map((rule, index) => {
      const { title, action } = splitRuleText(rule.text);
      return <li key={rule.friction_key}>
        <details name={expanded ? undefined : "example-preview"} open={expanded || index === 0}>
          <summary><FrictionIcon frictionKey={rule.friction_key} /><h3>{title}</h3><span className="detail-plus" aria-hidden="true"><ChevronDown size={18} /></span></summary>
          <div className="example-rule-content">{action && <p className="rule-boundary">{action}</p>}<p className="rule-interface"><span><LifeBuoy size={13} aria-hidden="true" />退路</span>{rule.execution_hint}</p><span className="claim-preview">无人认领</span></div>
        </details>
      </li>;
    })}</ol>
    <div className="memo-bottom"><span>5 条小约定，每条都有退路。</span><button className="quiet-button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "收起完整内容" : "展开全部 5 条"}</button></div>
  </article>;
}
