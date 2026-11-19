import type { SpaceType } from "./examples";

export type Selection = { friction_key: string; level_id: string; custom_execution_hint?: string };
export type BehaviorLevel = { id: string; label: string; action: string; execution_hint: string; humor_variants: string[] };
export type Friction = { key: string; title: string; space_types: SpaceType[]; levels: BehaviorLevel[] };
export type Library = { schema_version: number; spaces: { key: SpaceType; label: string; duration_label: string; default_selection: Selection[] }[]; frictions: Friction[] };
export type SelectionView = Selection & { label: string; action: string; execution_hint: string; suggested: boolean };
export type Rule = { id: string; friction_key: string; level_id: string; text: string; action: string; execution_hint: string; version: number; status: "pending" | "claimed" | "debating"; claim_count: number; claimed_by_me: boolean; claims: { participant_id: string; nickname: string }[]; order: number; source: "template" | "llm" };
export type CardSnapshot = { code: string; group_name: string; space_type: SpaceType; space_label: string; duration: string; duration_days: number; participant_count: number; adopted_date: string; effective_at: string; expires_at: string; rules: { text: string; execution_hint: string; order: number }[]; oath: string };
export type Room = { id: string; code: string; space_type: SpaceType; duration: string; group_name: string; status: "setup" | "draft" | "finalized"; revision: number; participant_count: number; viewer: { participant_id: string; nickname: string; is_owner: boolean } | null; selections: SelectionView[]; rules: Rule[]; snapshot: CardSnapshot | null };
export type SwapPreview = { rule_id: string; expected_version: number; target_level_id: string; old_action: string; new_action: string; text: string; execution_hint: string; boundary_changed: boolean; claims_to_clear: number; requires_owner: boolean };

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = "network_error") { super(message); }
}
export async function api<T>(path: string, options: { body?: unknown; key?: string; signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timeout = setTimeout(cancel, 12_000);
  try {
    const response = await fetch(path, {
      method: options.body === undefined ? "GET" : "POST",
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: options.body === undefined ? {} : { "Content-Type": "application/json", "X-CSRF-Protection": "1", ...(options.key ? { "Idempotency-Key": options.key } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.detail;
      const message = typeof detail?.message === "string" ? detail.message : response.status === 422 ? "有一项填写不合要求，请检查后重试。" : "暂时连不上房间服务，请稍后重试。";
      throw new ApiError(message, response.status, typeof detail?.code === "string" ? detail.code : "request_failed");
    }
    if (!data || typeof data !== "object") throw new ApiError("收到的房间信息不完整，请刷新重试。", 502);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(controller.signal.aborted ? "等得有点久，请刷新查看结果后再试。" : "连接中断了，请检查网络后重试。");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : "操作没有完成，请稍后重试。"; }
export function displayTextValid(text: string) { return !/[<>\p{C}]/u.test(text); }
export function completeSelections(library: Library, space: SpaceType, selected: Selection[]): SelectionView[] {
  const chosen = selected.map((item) => ({ ...item, suggested: false }));
  for (const item of library.spaces.find((value) => value.key === space)!.default_selection) {
    if (chosen.length === 5) break;
    if (!chosen.some((value) => value.friction_key === item.friction_key)) chosen.push({ ...item, suggested: true });
  }
  return chosen.map((item) => {
    const level = library.frictions.find((value) => value.key === item.friction_key)!.levels.find((value) => value.id === item.level_id)!;
    const executionHint = item.custom_execution_hint?.trim() || level.execution_hint;
    return { ...item, label: level.label, action: level.action, execution_hint: executionHint };
  });
}
const operationKeys = new Map<string, string>();
export function operationKey(scope: string) {
  const name = "constitution-operation:" + scope;
  try {
    const saved = sessionStorage.getItem(name);
    if (saved && /^[A-Za-z0-9_-]{8,80}$/.test(saved)) return saved;
  } catch { /* Restricted storage still permits in-page retries. */ }
  const key = operationKeys.get(name) ?? crypto.randomUUID();
  operationKeys.set(name, key);
  try { sessionStorage.setItem(name, key); } catch { /* The server still enforces one generation per room. */ }
  return key;
}
export function generateRoom(room: Room) {
  return api<Room>("/api/rooms/" + room.code + "/generate", {
    body: { expected_revision: room.revision, confirm_suggestions: true },
    key: operationKey("generate:" + room.code + ":" + room.revision),
  });
}

