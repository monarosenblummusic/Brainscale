import { describe, expect, it } from "vitest";
import {
  DECODER_DEFAULTS,
  TARGET_SEQUENCES,
  decoderEngine,
  generateStream,
  type DecoderConfig,
  type DecoderState,
} from "@/lib/engine/decoder";

const cfg = (over: Partial<DecoderConfig> = {}): DecoderConfig => ({ ...DECODER_DEFAULTS, ...over });

/** Every index at which the stream completes a target sequence. */
function completions(stream: number[]): number[] {
  const out: number[] = [];
  for (let i = 2; i < stream.length; i++) {
    const run = [stream[i - 2], stream[i - 1], stream[i]];
    if (TARGET_SEQUENCES.some((t) => t[0] === run[0] && t[1] === run[1] && t[2] === run[2])) out.push(i);
  }
  return out;
}

/** Move the stream to a given digit index. */
const at = (s: DecoderState, index: number) => decoderEngine.tick(s, index * s.config.intervalMs + 10);

describe("stream generation", () => {
  it("only uses digits 2 to 9", () => {
    const { stream } = generateStream(400, 20, 1);
    for (const d of stream) {
      expect(d).toBeGreaterThanOrEqual(2);
      expect(d).toBeLessThanOrEqual(9);
    }
  });

  it("never completes a sequence that is not a declared target", () => {
    // An unplanned target is one the player is marked wrong for catching,
    // which is the worst failure available in a vigilance task.
    for (let seed = 0; seed < 60; seed++) {
      const { stream, targets } = generateStream(300, 15, seed);
      expect(completions(stream)).toEqual(targets);
    }
  });

  it("plants close to the requested number of targets", () => {
    for (let seed = 0; seed < 30; seed++) {
      const { targets } = generateStream(500, 24, seed);
      expect(targets.length).toBeGreaterThanOrEqual(20);
      expect(targets.length).toBeLessThanOrEqual(24);
    }
  });

  it("never overlaps two planted sequences", () => {
    for (let seed = 0; seed < 40; seed++) {
      const { targets } = generateStream(300, 15, seed);
      for (let i = 1; i < targets.length; i++) {
        expect(targets[i]! - targets[i - 1]!).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("produces a stream of the requested length, deterministically", () => {
    expect(generateStream(200, 10, 5).stream).toHaveLength(200);
    expect(generateStream(200, 10, 5)).toEqual(generateStream(200, 10, 5));
  });
});

describe("responding", () => {
  it("counts a press inside the window as a hit", () => {
    let s = decoderEngine.init(cfg({ durationSec: 60 }), 100);
    const target = s.targets[0]!;
    s = at(s, target);
    s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    expect(s.hits).toBe(1);
    expect(s.falseAlarms).toBe(0);
  });

  it("still counts a press a couple of digits late", () => {
    const config = cfg({ durationSec: 60, responseDigits: 2 });
    let s = decoderEngine.init(config, 101);
    const target = s.targets[0]!;
    s = at(s, target + 2);
    s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    expect(s.hits).toBe(1);
  });

  it("counts a press outside the window as a false alarm", () => {
    const config = cfg({ durationSec: 60, responseDigits: 2 });
    let s = decoderEngine.init(config, 102);
    const target = s.targets[0]!;
    s = at(s, target + 3);
    s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    expect(s.hits).toBe(0);
    expect(s.falseAlarms).toBe(1);
  });

  it("does not pay twice for one sequence", () => {
    let s = decoderEngine.init(cfg({ durationSec: 60 }), 103);
    s = at(s, s.targets[0]!);
    s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    expect(s.hits).toBe(1);
    expect(s.falseAlarms).toBe(1);
  });

  it("records a target whose window closes unpressed as a miss", () => {
    const config = cfg({ durationSec: 60, responseDigits: 2 });
    let s = decoderEngine.init(config, 104);
    const target = s.targets[0]!;
    s = at(s, target + 4);
    expect(s.missed).toContain(target);
  });

  it("accounts for every target exactly once over a whole run", () => {
    const config = cfg({ durationSec: 30 });
    let s = decoderEngine.init(config, 105);
    s = decoderEngine.tick(s, s.stream.length * config.intervalMs + 50);
    expect(decoderEngine.isFinished(s)).toBe(true);
    expect(s.missed).toHaveLength(s.targets.length);
    expect(s.hits).toBe(0);
  });

  it("claims the most recent live target when two overlap", () => {
    // When two are in window at once, the one the player just saw is the one
    // they meant.
    const config = cfg({ durationSec: 120, responseDigits: 4 });
    let s = decoderEngine.init(config, 106);
    const [first, second] = s.targets;
    if (second === undefined || second - first! > 4) return;
    s = at(s, second);
    s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    expect(s.claimed).toContain(second);
  });
});

describe("scoring and pacing", () => {
  function playPerfectly(config: DecoderConfig, seed: number) {
    let s = decoderEngine.init(config, seed);
    for (const target of s.targets) {
      s = at(s, target);
      s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    }
    return decoderEngine.tick(s, s.stream.length * config.intervalMs + 50);
  }

  it("scores every sequence caught", () => {
    const config = cfg({ durationSec: 60 });
    const s = playPerfectly(config, 200);
    const r = decoderEngine.result(s);
    expect(r.hits).toBe(r.targets);
    expect(r.accuracy).toBe(1);
    expect(r.misses).toBe(0);
  });

  it("quickens the stream after a clean run", () => {
    const config = cfg({ durationSec: 60, adaptive: true });
    const r = decoderEngine.result(playPerfectly(config, 201));
    expect(r.nextIntervalMs).toBeLessThan(config.intervalMs);
  });

  it("does not quicken when the run was caught by pressing at everything", () => {
    const config = cfg({ durationSec: 60, adaptive: true });
    let s = decoderEngine.init(config, 202);
    for (const target of s.targets) {
      s = at(s, target);
      s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    }
    // Now spray presses well outside any window.
    for (let i = 0; i < 40; i++) {
      s = at(s, s.stream.length - 2);
      s = decoderEngine.input(s, { kind: "respond", channel: "target" });
    }
    s = decoderEngine.tick(s, s.stream.length * config.intervalMs + 50);

    const r = decoderEngine.result(s);
    expect(r.accuracy).toBe(1);
    expect(r.falseAlarms).toBeGreaterThan(0);
    expect(r.nextIntervalMs).toBe(config.intervalMs);
  });

  it("eases the stream after a poor run", () => {
    const config = cfg({ durationSec: 60, adaptive: true });
    let s = decoderEngine.init(config, 203);
    s = decoderEngine.tick(s, s.stream.length * config.intervalMs + 50);
    expect(decoderEngine.result(s).nextIntervalMs).toBeGreaterThan(config.intervalMs);
  });

  it("tracks the longest unbroken run of catches", () => {
    const config = cfg({ durationSec: 90 });
    const s = playPerfectly(config, 204);
    expect(decoderEngine.result(s).longestRun).toBe(s.targets.length);
  });

  it("writes a session row whose level is digits per minute", () => {
    const config = cfg({ durationSec: 60, intervalMs: 600 });
    const s = playPerfectly(config, 205);
    const row = decoderEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("decoder");
    expect(row.level).toBe(100);
    expect(row.mode).toContain("100 digits/min");
  });
});
