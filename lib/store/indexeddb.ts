import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Best, GameId, Session, Streak } from "@/lib/types";
import {
  computeBests,
  computeStreak,
  type ExportBundle,
  type ProfileRepo,
  type SessionRepo,
  type SettingsRepo,
  type Store,
} from "./repository";

interface BrainscaleDB extends DBSchema {
  sessions: {
    key: string;
    value: Session;
    indexes: { "by-startedAt": number; "by-game": string };
  };
  settings: { key: string; value: unknown };
}

const DB_NAME = "brainscale";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<BrainscaleDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<BrainscaleDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const sessions = db.createObjectStore("sessions", { keyPath: "id" });
        sessions.createIndex("by-startedAt", "startedAt");
        sessions.createIndex("by-game", "gameId");
        db.createObjectStore("settings");
      },
    });
  }
  return dbPromise;
}

/**
 * IndexedDB is unavailable in a few real situations — private windows in some
 * browsers, storage blocked by policy, server-side rendering. Rather than
 * letting that crash a game mid-session, we fall back to an in-memory store:
 * play still works, only persistence is lost, and the settings page says so.
 */
const memory = { sessions: new Map<string, Session>(), settings: new Map<string, unknown>() };
let useMemory = false;

export function isPersistent(): boolean {
  return !useMemory;
}

async function withDB<T>(fn: (db: IDBPDatabase<BrainscaleDB>) => Promise<T>, fallback: () => T): Promise<T> {
  if (useMemory || typeof indexedDB === "undefined") {
    useMemory = true;
    return fallback();
  }
  try {
    return await fn(await getDB());
  } catch {
    useMemory = true;
    return fallback();
  }
}

const sessions: SessionRepo = {
  async save(session) {
    await withDB(
      async (db) => {
        await db.put("sessions", session);
      },
      () => {
        memory.sessions.set(session.id, session);
      },
    );
  },

  async list({ gameId, since, limit } = {}) {
    const all = await withDB(
      (db) => db.getAllFromIndex("sessions", "by-startedAt"),
      () => [...memory.sessions.values()].sort((a, b) => a.startedAt - b.startedAt),
    );
    let out = all.slice().reverse(); // newest first
    if (gameId) out = out.filter((s) => s.gameId === gameId);
    if (since !== undefined) out = out.filter((s) => s.startedAt >= since);
    if (limit !== undefined) out = out.slice(0, limit);
    return out;
  },

  async clear() {
    memory.sessions.clear();
    await withDB(
      async (db) => {
        await db.clear("sessions");
      },
      () => undefined,
    );
  },
};

const settings: SettingsRepo = {
  async get<T>(key: string) {
    return withDB(
      async (db) => (await db.get("settings", key)) as T | undefined,
      () => memory.settings.get(key) as T | undefined,
    );
  },

  async set<T>(key: string, value: T) {
    await withDB(
      async (db) => {
        await db.put("settings", value, key);
      },
      () => {
        memory.settings.set(key, value);
      },
    );
  },

  async clear() {
    memory.settings.clear();
    await withDB(
      async (db) => {
        await db.clear("settings");
      },
      () => undefined,
    );
  },
};

const profile: ProfileRepo = {
  async streak(): Promise<Streak> {
    return computeStreak(await sessions.list());
  },
  async bests(): Promise<Partial<Record<GameId, Best>>> {
    return computeBests(await sessions.list());
  },
};

async function allSettings(): Promise<Record<string, unknown>> {
  return withDB(
    async (db) => {
      const keys = await db.getAllKeys("settings");
      const values = await db.getAll("settings");
      return Object.fromEntries(keys.map((k, i) => [String(k), values[i]]));
    },
    () => Object.fromEntries(memory.settings),
  );
}

export const store: Store = {
  sessions,
  settings,
  profile,

  async exportAll(): Promise<ExportBundle> {
    return {
      version: 1,
      exportedAt: Date.now(),
      sessions: await sessions.list(),
      settings: await allSettings(),
    };
  },

  async importAll(bundle, mode) {
    if (bundle.version !== 1) throw new Error(`Unsupported export version: ${bundle.version}`);
    if (mode === "replace") {
      await sessions.clear();
      await settings.clear();
    }
    for (const s of bundle.sessions) await sessions.save(s);
    for (const [k, v] of Object.entries(bundle.settings)) await settings.set(k, v);
  },
};
