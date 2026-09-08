import { describe, expect, it } from "vitest";
import {
  CORSI_DEFAULTS,
  MEMORY_SPAN_DEFAULTS,
  expectedAnswer,
  generateSequence,
  presentationMs,
  sequenceEngine,
  type SequenceConfig,
  type SequenceState,
} from "@/lib/engine/sequence";

const span = (over: Partial<SequenceConfig> = {}): SequenceConfig => ({ ...MEMORY_SPAN_DEFAULTS, ...over });
const corsi = (over: Partial<SequenceConfig> = {}): SequenceConfig => ({ ...CORSI_DEFAULTS, ...over });

/** Run the presentation phase to completion so the engine accepts input. */
function toResponding(state: SequenceState, config: SequenceConfig): SequenceState {
  const total = presentationMs(state.sequence.length, config);
  let s = state;
  for (let t = 0; t <= total + 50; t += 50) s = sequenceEngine.tick(s, s.presentStart + t);
  return s;
}

/** Play one trial, answering correctly or not. */
function playTrial(state: SequenceState, config: SequenceConfig, correct: boolean): SequenceState {
  let s = toResponding(state, config);
  expect(s.phase).toBe("responding");

  const answer = expectedAnswer(s.sequence, config.direction);
  const given = correct ? answer : answer.map((v, i) => (i === 0 ? (v + 1) % config.alphabet : v));

  for (const value of given) s = sequenceEngine.input(s, { kind: "select", index: value });

  // Grading is automatic on the final item; run the feedback pause out.
  const until = s.feedbackUntil;
  for (let t = s.elapsed; t <= until + 60; t += 30) s = sequenceEngine.tick(s, t);
  return s;
}

describe("sequence generation", () => {
  it("never repeats an item back to back", () => {
    for (let seed = 0; seed < 60; seed++) {
      const seq = generateSequence(9, 10, true, seed);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
    }
  });

  it("never reuses a block when repeats are disallowed", () => {
    for (let seed = 0; seed < 60; seed++) {
      const seq = generateSequence(9, 9, false, seed);
      expect(new Set(seq).size).toBe(seq.length);
    }
  });

  it("allows a digit to recur when repeats are allowed", () => {
    const seen = new Set<string>();
    let sawRepeat = false;
    for (let seed = 0; seed < 200 && !sawRepeat; seed++) {
      const seq = generateSequence(9, 10, true, seed);
      seen.add(seq.join(""));
      if (new Set(seq).size < seq.length) sawRepeat = true;
    }
    expect(sawRepeat).toBe(true);
  });

  it("stays inside the alphabet", () => {
    const seq = generateSequence(20, 9, true, 5);
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(9);
    }
  });
});

describe("direction", () => {
  it("expects the sequence as shown, forward", () => {
    expect(expectedAnswer([1, 2, 3], "forward")).toEqual([1, 2, 3]);
  });
  it("expects the sequence reversed, in reverse mode", () => {
    expect(expectedAnswer([1, 2, 3], "reverse")).toEqual([3, 2, 1]);
  });
});

describe("span progression", () => {
  it("grows the sequence by one on every success", () => {
    const config = span({ startLength: 3 });
    let s = sequenceEngine.init(config, 100);
    expect(s.sequence.length).toBe(3);

    s = playTrial(s, config, true);
    expect(s.progress.level).toBe(4);
    expect(s.sequence.length).toBe(4);

    s = playTrial(s, config, true);
    expect(s.progress.level).toBe(5);
    expect(s.progress.best).toBe(4);
  });

  it("ends the run after two failures at the same length", () => {
    const config = span({ startLength: 4 });
    let s = sequenceEngine.init(config, 200);

    s = playTrial(s, config, false);
    expect(sequenceEngine.isFinished(s)).toBe(false);

    s = playTrial(s, config, false);
    expect(sequenceEngine.isFinished(s)).toBe(true);
  });

  it("a failure between successes does not end the run", () => {
    const config = span({ startLength: 3 });
    let s = sequenceEngine.init(config, 300);
    s = playTrial(s, config, false);
    s = playTrial(s, config, true);
    expect(sequenceEngine.isFinished(s)).toBe(false);
    expect(s.progress.failStreak).toBe(0);
  });

  it("reports the longest length actually completed as the span", () => {
    const config = span({ startLength: 3 });
    let s = sequenceEngine.init(config, 400);
    s = playTrial(s, config, true); // completed 3
    s = playTrial(s, config, true); // completed 4
    s = playTrial(s, config, false); // failed 5
    s = playTrial(s, config, false); // failed 5 again -> stop

    const r = sequenceEngine.result(s);
    expect(r.span).toBe(4);
    expect(r.correctTrials).toBe(2);
    expect(r.trialsPlayed).toBe(4);
    expect(r.accuracy).toBe(0.5);
  });
});

describe("grading", () => {
  it("rejects a right-items-wrong-order answer", () => {
    const config = span({ startLength: 3 });
    let s = sequenceEngine.init(config, 500);
    s = toResponding(s, config);

    const scrambled = [...s.sequence].reverse();
    // Guard against the generator handing us a palindrome.
    if (scrambled.every((v, i) => v === s.sequence[i])) return;

    for (const v of scrambled) s = sequenceEngine.input(s, { kind: "select", index: v });
    expect(s.lastTrial).toBe("wrong");
  });

  it("grades reverse mode against the reversed sequence", () => {
    const config = span({ startLength: 4, direction: "reverse" });
    let s = sequenceEngine.init(config, 600);
    s = toResponding(s, config);

    for (const v of [...s.sequence].reverse()) s = sequenceEngine.input(s, { kind: "select", index: v });
    expect(s.lastTrial).toBe("correct");
  });

  it("clears the entry without grading", () => {
    const config = span({ startLength: 4 });
    let s = sequenceEngine.init(config, 700);
    s = toResponding(s, config);
    s = sequenceEngine.input(s, { kind: "select", index: s.sequence[0]! });
    expect(s.entry).toHaveLength(1);
    s = sequenceEngine.input(s, { kind: "clear" });
    expect(s.entry).toHaveLength(0);
    expect(s.lastTrial).toBeNull();
  });

  it("ignores input while the sequence is still being presented", () => {
    const config = span({ startLength: 4 });
    const s = sequenceEngine.init(config, 800);
    expect(s.phase).toBe("presenting");
    expect(sequenceEngine.input(s, { kind: "select", index: 1 })).toBe(s);
  });

  it("ignores extra taps past the sequence length", () => {
    const config = span({ startLength: 3 });
    let s = sequenceEngine.init(config, 900);
    s = toResponding(s, config);
    for (const v of s.sequence) s = sequenceEngine.input(s, { kind: "select", index: v });
    // Grading has happened; the phase is no longer "responding".
    const after = sequenceEngine.input(s, { kind: "select", index: 0 });
    expect(after).toBe(s);
  });
});

describe("presentation timing", () => {
  it("shows each item in turn then moves to responding", () => {
    const config = corsi({ startLength: 3, showMs: 1000, gapMs: 500 });
    let s = sequenceEngine.init(config, 1000);

    s = sequenceEngine.tick(s, 100);
    expect(s.showIndex).toBe(0);
    expect(s.showing).toBe(true);

    s = sequenceEngine.tick(s, 1200); // into the gap after item 0
    expect(s.showIndex).toBe(0);
    expect(s.showing).toBe(false);

    s = sequenceEngine.tick(s, 1600); // item 1
    expect(s.showIndex).toBe(1);
    expect(s.showing).toBe(true);

    s = sequenceEngine.tick(s, 4600); // past the end
    expect(s.phase).toBe("responding");
  });

  it("computes total presentation time", () => {
    expect(presentationMs(4, corsi({ showMs: 1000, gapMs: 500 }))).toBe(6000);
  });
});

describe("session row", () => {
  it("records the span and a sensible restart level", () => {
    const config = corsi({ startLength: 2 });
    let s = sequenceEngine.init(config, 1234);
    s = playTrial(s, config, true);
    s = playTrial(s, config, true);
    s = playTrial(s, config, false);
    s = playTrial(s, config, false);

    const row = sequenceEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("corsi");
    expect(row.mode).toBe("Corsi · forward");
    expect(row.level).toBe(3);
    expect(row.score).toBe(3);
    expect(row.metrics.nextLevel).toBe(2);
  });

  it("labels memory span by alphabet and direction", () => {
    const config = span({ alphabet: 26, direction: "reverse" });
    const s = sequenceEngine.init(config, 1);
    expect(sequenceEngine.toSession(s, config, 0).mode).toBe("Letters · reverse");
  });
});
