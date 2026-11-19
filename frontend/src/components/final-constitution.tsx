import type { CardSnapshot } from "@/lib/room-api";
import { orderedCardRules, splitRuleText } from "@/lib/card-content";

export function FinalConstitution({ snapshot }: { snapshot: CardSnapshot }) {
  return <article className="final-constitution" aria-label={snapshot.group_name + "的最终约定"}>
    <header className="final-card-header">
      <div className="final-card-brand"><span>先说好</span><span>已定稿</span></div>
      <div className="final-card-title"><div><h2>我们的小约定</h2><p className="final-group-name">{snapshot.group_name}</p></div><span className="draft-stamp" aria-hidden="true">说好<br />啦</span></div>
      <dl className="final-card-meta"><div><dt>空间</dt><dd>{snapshot.space_label}</dd></div><div><dt>参与人数</dt><dd>{snapshot.participant_count} 人</dd></div></dl>
    </header>
    <ol className="final-card-rules">{orderedCardRules(snapshot).map((rule, index) => {
      const { title, action } = splitRuleText(rule.text);
      return <li key={rule.order}><span className="final-rule-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3>{action && <p className="final-rule-action">{action}</p>}<p className="final-rule-hint"><span>退路</span>{rule.execution_hint}</p></div></li>;
    })}</ol>
    <footer className="final-card-footer"><p className="final-oath">{snapshot.oath}</p><div className="final-card-footnote"><span>有人认领即通过，不代表全员一致同意。</span><span>{snapshot.code}</span></div></footer>
  </article>;
}
