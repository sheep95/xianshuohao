import data from "@/data/examples.json";

export type ConstitutionExample = (typeof data.examples)[number];
export type SpaceType = "shared_home" | "short_stay" | "club_room";
export const spaces = [
  { key: "shared_home", title: "宿舍 / 合租", detail: "拿到 5 条共住约定，让声音、灯光和借用有个准。" },
  { key: "short_stay", title: "短租 / 民宿", detail: "拿到 5 条同行约定，把浴室、厨房和收尾说清楚。" },
  { key: "club_room", title: "社团活动室", detail: "拿到 5 条共用约定，让设备和场地接得上下一场。" },
] as const satisfies readonly { key: SpaceType; title: string; detail: string }[];
export const examples = data.examples;
export const initialExample = examples[0];
export function examplesFor(space: SpaceType) {
  return examples.filter((example) => example.space_type === space);
}
export function exampleFromHash(hash: string) {
  const match = /^#example=([a-z_]+-[1-3])$/.exec(hash);
  return match ? examples.find((example) => example.id === match[1]) : undefined;
}
