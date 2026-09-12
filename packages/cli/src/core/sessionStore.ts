import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChatMessage } from "../types/index.js";
import type { ResearchEngine } from "./engine.js";
import { slugify } from "./exportSession.js";

const SESSIONS_DIR_NAME = ".research-chef/sessions";

/** Where auto-saved research sessions are stored, by default. */
export function getSessionsDirectory(): string {
  return join(homedir(), SESSIONS_DIR_NAME);
}

/**
 * A persisted research session. Note: API keys are never stored — only the
 * provider id and model (for display), plus the topic and messages. On
 * resume, the current in-memory credentials are reused.
 */
export interface StoredSession {
  id: string;
  topic: string;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

/** Lightweight summary used for listing/filtering without reading bodies twice. */
export interface SessionSummary {
  id: string;
  topic: string;
  providerId: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * File-backed session store. All methods take an explicit directory (default
 * is `~/.research-chef/sessions/`) so tests can point at a temp dir.
 */
export class SessionStore {
  constructor(private readonly dir: string = getSessionsDirectory()) {}

  /** Creates or updates the session file for `id` (or a new id when omitted). */
  async save(params: {
    id?: string;
    topic: string;
    providerId: string;
    model: string;
    messages: ChatMessage[];
    now?: Date;
  }): Promise<StoredSession> {
    await mkdir(this.dir, { recursive: true });

    const now = params.now ?? new Date();
    const id = params.id ?? buildSessionId(params.topic, now);
    const filePath = join(this.dir, `${id}.json`);

    let createdAt = now.toISOString();
    try {
      const existing = JSON.parse(await readFile(filePath, "utf-8")) as StoredSession;
      if (existing.createdAt) createdAt = existing.createdAt;
    } catch {
      // No existing file — this is a fresh session id.
    }

    const session: StoredSession = {
      id,
      topic: params.topic,
      providerId: params.providerId,
      model: params.model,
      createdAt,
      updatedAt: now.toISOString(),
      messages: params.messages,
    };

    await writeFile(filePath, JSON.stringify(session, null, 2), "utf-8");
    return session;
  }

  /** Lists all stored sessions, newest first. Corrupt files are skipped. */
  async list(): Promise<SessionSummary[]> {
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch {
      return [];
    }

    const summaries: SessionSummary[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.dir, entry), "utf-8");
        const session = JSON.parse(raw) as StoredSession;
        if (!session.id || !Array.isArray(session.messages)) continue;
        summaries.push({
          id: session.id,
          topic: session.topic || "Untitled research session",
          providerId: session.providerId || "unknown",
          model: session.model || "",
          createdAt: session.createdAt || "",
          updatedAt: session.updatedAt || "",
          messageCount: session.messages.length,
        });
      } catch {
        continue;
      }
    }

    summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return summaries;
  }

  /** Loads a full session by id, or undefined when missing/corrupt. */
  async load(id: string): Promise<StoredSession | undefined> {
    if (!isSafeSessionId(id)) return undefined;
    try {
      const raw = await readFile(join(this.dir, `${id}.json`), "utf-8");
      const session = JSON.parse(raw) as StoredSession;
      if (session.id !== id || !Array.isArray(session.messages)) return undefined;
      return session;
    } catch {
      return undefined;
    }
  }

  /** Case-insensitive substring filter over session topics. */
  async search(query: string): Promise<SessionSummary[]> {
    const needle = query.trim().toLowerCase();
    const all = await this.list();
    if (!needle) return all;
    return all.filter((s) => s.topic.toLowerCase().includes(needle));
  }
}

/** Builds a filesystem-safe, time-ordered session id: `<timestamp>-<slug>`. */
export function buildSessionId(topic: string, now: Date = new Date()): string {
  const slug = slugify(topic) || "research-session";
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${slug}`;
}

/** Rejects path traversal / absolute paths so `load()` stays inside the dir. */
export function isSafeSessionId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && !id.includes("..");
}

/**
 * Persists the engine's current conversation to the store (creating the
 * session file on the first call, updating it afterwards). Never throws —
 * auto-save must not interrupt the chat when the disk is unavailable.
 * Returns the stored session, or undefined when there was nothing to save
 * or the write failed.
 */
export async function persistCurrentSession(
  store: SessionStore,
  engine: ResearchEngine,
): Promise<StoredSession | undefined> {
  const messages = engine.getVisibleHistory();
  if (messages.length === 0) return undefined;

  try {
    const session = await store.save({
      id: engine.getSessionId(),
      topic: engine.getCurrentTopic(),
      providerId: engine.getProviderInfo().id,
      model: engine.getModel(),
      messages,
    });
    engine.setSessionId(session.id);
    return session;
  } catch {
    return undefined;
  }
}
