/**
 * localStorage session persistence. One bucket, versioned schema.
 *
 * If the schema ever changes we bump VERSION and old data is ignored on load
 * (a fresh session starts) rather than crashing.
 */

import type { Step } from "@/components/BoardPane";
import type { ChatUiMessage } from "@/components/ChatPane";

const KEY = "nabla:session";
const VERSION = 1;

export type Snapshot = {
  version: number;
  savedAt: number;
  steps: Step[];
  activeId: string | null;
  messages: ChatUiMessage[];
  scratch: string;
};

export function saveSnapshot(s: Omit<Snapshot, "version" | "savedAt">): void {
  try {
    const payload: Snapshot = { version: VERSION, savedAt: Date.now(), ...s };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    // Quota, private mode, etc — non-fatal
    console.warn("nabla: failed to save session", e);
  }
}

export function loadSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (parsed.version !== VERSION) return null;
    if (!Array.isArray(parsed.steps)) return null;
    if (!Array.isArray(parsed.messages)) return null;
    return parsed as Snapshot;
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
