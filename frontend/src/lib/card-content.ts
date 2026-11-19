import type { CardSnapshot } from "./room-api";

export function orderedCardRules(snapshot: CardSnapshot) {
  return [...snapshot.rules].sort((a, b) => a.order - b.order);
}

export function splitRuleText(text: string) {
  const at = text.indexOf("。 ");
  return at < 0 ? { title: text, action: "" } : { title: text.slice(0, at + 1), action: text.slice(at + 2) };
}

export function cardPlainText(snapshot: CardSnapshot) {
  return [
    "先说好｜" + snapshot.group_name,
    "空间：" + snapshot.space_label + "｜参与人数：" + snapshot.participant_count + " 人",
    "通过日期：" + snapshot.adopted_date,
    "",
    ...orderedCardRules(snapshot).flatMap((rule, index) => ["第 " + (index + 1) + " 条：" + rule.text, "退路 💡：" + rule.execution_hint, ""]),
    snapshot.oath,
    "",
    "至少一人认领即通过，不代表全员一致同意。",
    "先说好｜房间码：" + snapshot.code,
  ].join("\n");
}
