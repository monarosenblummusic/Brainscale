"use client";

import { useCallback, useEffect, useState } from "react";
import type { Best, GameId, Session, Streak } from "@/lib/types";
import { store } from "./indexeddb";

/**
 * Per-game settings, persisted and shared. Returns the default until the read
 * resolves, so a game can render immediately rather than flashing a spinner.
 */
export function useGameSettings<T extends object>(gameId: GameId, defaults: T) {
  const key = `settings:${gameId}`;
  const [value, setValue] = useState<T>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    store.settings.get<T>(key).then((stored) => {
      if (!alive) return;
      // Merge rather than replace: a stored blob written by an older version
      // must not strip settings added since.
      if (stored) setValue({ ...defaults, ...stored });
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (patch: Partial<T>) => {
      setValue((prev) => {
        const next = { ...prev, ...patch };
        void store.settings.set(key, next);
        return next;
      });
    },
    [key],
  );

  return { settings: value, update, loaded };
}

export function useSessions(options?: { gameId?: GameId; since?: number; limit?: number }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const gameId = options?.gameId;
  const since = options?.since;
  const limit = options?.limit;

  const refresh = useCallback(() => {
    store.sessions.list({ gameId, since, limit }).then(setSessions);
  }, [gameId, since, limit]);

  useEffect(refresh, [refresh]);

  return { sessions, refresh };
}

export function useProfile() {
  const [streak, setStreak] = useState<Streak | null>(null);
  const [bests, setBests] = useState<Partial<Record<GameId, Best>> | null>(null);

  const refresh = useCallback(() => {
    void store.profile.streak().then(setStreak);
    void store.profile.bests().then(setBests);
  }, []);

  useEffect(refresh, [refresh]);

  return { streak, bests, refresh };
}

/** The last level reached for a game, so a session resumes where you left off. */
export function useLastLevel(gameId: GameId, fallback: number) {
  const [level, setLevel] = useState<number | null>(null);

  useEffect(() => {
    store.sessions.list({ gameId, limit: 1 }).then(([latest]) => {
      // A finished session stores the level just played; the level to *start*
      // from is what the adaptive policy decided at the end of it.
      const next = latest?.metrics?.nextLevel;
      setLevel(typeof next === "number" ? next : (latest?.level ?? fallback));
    });
  }, [gameId, fallback]);

  return level;
}
