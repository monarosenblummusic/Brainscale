import { describe, expect, it } from "vitest";
import { PASSAGES } from "@/data/passages";
import {
  RSVP_DEFAULTS,
  passageAt,
  rsvpEngine,
  wordDuration,
  wordSchedule,
  type RsvpConfig,
  type RsvpState,
} from "@/lib/engine/rsvp";
import {
  ERROR_LOCATOR_DEFAULTS,
  buildTokens,
  errorLocatorEngine,
  type ErrorLocatorConfig,
  type ErrorLocatorState,
} from "@/lib/engine/error-locator";

const rsvp = (over: Partial<RsvpConfig> = {}): RsvpConfig => ({ ...RSVP_DEFAULTS, ...over });
const locator = (over: Partial<ErrorLocatorConfig> = {}): ErrorLocatorConfig => ({
  ...ERROR_LOCATOR_DEFAULTS,
  ...over,
});

describe("the passage bank", () => {
  it("keeps passages short enough to read in one burst", () => {
    for (const p of PASSAGES) {
      const words = p.text.split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(30);
      expect(words).toBeLessThanOrEqual(70);
    }
  });

  it("gives every passage a question with three distinct options", () => {
    for (const p of PASSAGES) {
      expect(p.options).toHaveLength(3);
      expect(new Set(p.options).size).toBe(3);
      expect(p.answer).toBeGreaterThanOrEqual(0);
      expect(p.answer).toBeLessThan(3);
      expect(p.question.trim().endsWith("?")).toBe(true);
    }
  });

  it("has no duplicate passages", () => {
    expect(new Set(PASSAGES.map((p) => p.text)).size).toBe(PASSAGES.length);
  });
});

describe("rsvp pacing", () => {
  it("holds an ordinary word for the rate's beat", () => {
    expect(wordDuration("bees", 300, false)).toBeCloseTo(200, 5);
    expect(wordDuration("bees", 600, false)).toBeCloseTo(100, 5);
  });

  it("holds longer at clause and sentence boundaries", () => {
    const base = wordDuration("hive", 300, true);
    expect(wordDuration("hive,", 300, true)).toBeGreaterThan(base);
    expect(wordDuration("hive.", 300, true)).toBeGreaterThan(wordDuration("hive,", 300, true));
  });

  it("can switch the pauses off entirely", () => {
    expect(wordDuration("hive.", 300, false)).toBe(wordDuration("hive", 300, false));
  });

  it("schedules onsets that only ever move forward", () => {
    const words = "The bees returned, slowly. Then again.".split(/\s+/);
    const onsets = wordSchedule(words, 400, true);
    expect(onsets).toHaveLength(words.length + 1);
    for (let i = 1; i < onsets.length; i++) expect(onsets[i]!).toBeGreaterThan(onsets[i - 1]!);
  });

  it("takes about the requested time overall", () => {
    const words = Array.from({ length: 60 }, () => "word");
    const onsets = wordSchedule(words, 600, false);
    expect(onsets[60]).toBeCloseTo(6000, -2); // 60 words at 600 wpm is 6 seconds
  });
});

describe("processing", () => {
  /** Run a passage out and answer its question. */
  function playPassage(state: RsvpState, correct: boolean): RsvpState {
    let s = state;
    const total = wordSchedule(s.words, s.wpm, s.config.punctuationPause)[s.words.length]!;
    for (let t = s.stageStart; t <= s.stageStart + total + 100; t += 40) s = rsvpEngine.tick(s, t);
    expect(s.stage).toBe("question");

    const passage = passageAt(s.order, s.passageIndex);
    const pick = correct ? passage.answer : (passage.answer + 1) % 3;
    return rsvpEngine.input(s, { kind: "select", index: pick });
  }

  const settle = (s: RsvpState): RsvpState => {
    let out = s;
    for (let t = out.elapsed; t <= out.reviewUntil + 80; t += 50) out = rsvpEngine.tick(out, t);
    return out;
  };

  it("shows the words in order, then asks the question", () => {
    let s = rsvpEngine.init(rsvp(), 1);
    expect(s.stage).toBe("reading");
    expect(s.wordIndex).toBe(0);

    const onsets = wordSchedule(s.words, s.wpm, s.config.punctuationPause);
    s = rsvpEngine.tick(s, onsets[3]! + 5);
    expect(s.wordIndex).toBe(3);

    s = rsvpEngine.tick(s, onsets[s.words.length]! + 20);
    expect(s.stage).toBe("question");
  });

  it("ignores an answer while the passage is still playing", () => {
    const s = rsvpEngine.init(rsvp(), 2);
    expect(rsvpEngine.input(s, { kind: "select", index: 0 })).toBe(s);
  });

  it("speeds up after a correct answer and slows after a wrong one", () => {
    const config = rsvp({ startWpm: 300, stepWpm: 40, dropWpm: 60 });
    let s = playPassage(rsvpEngine.init(config, 3), true);
    expect(s.wpm).toBe(340);
    expect(s.lastCorrect).toBe(true);

    s = playPassage(settle(s), false);
    expect(s.wpm).toBe(280);
  });

  it("credits the rate actually read at, not the one just set", () => {
    // Otherwise the reported best would always be one step beyond what was
    // demonstrated.
    const config = rsvp({ startWpm: 300, stepWpm: 40 });
    const s = playPassage(rsvpEngine.init(config, 4), true);
    expect(s.bestWpm).toBe(300);
    expect(s.wpm).toBe(340);
  });

  it("never credits a rate whose question was answered wrongly", () => {
    const s = playPassage(rsvpEngine.init(rsvp(), 5), false);
    expect(s.bestWpm).toBe(0);
  });

  it("stays within its rate bounds", () => {
    const config = rsvp({ startWpm: 880, maxWpm: 900, minWpm: 120, stepWpm: 40 });
    let s = rsvpEngine.init(config, 6);
    for (let i = 0; i < 4; i++) s = settle(playPassage(s, true));
    expect(s.wpm).toBeLessThanOrEqual(900);
  });

  it("ends after the configured number of passages", () => {
    const config = rsvp({ passages: 2 });
    let s = rsvpEngine.init(config, 7);
    s = settle(playPassage(s, true));
    expect(rsvpEngine.isFinished(s)).toBe(false);
    s = settle(playPassage(s, true));
    expect(rsvpEngine.isFinished(s)).toBe(true);
  });

  it("writes a session row scored on the best rate read cleanly", () => {
    const config = rsvp({ passages: 1, startWpm: 320 });
    const s = settle(playPassage(rsvpEngine.init(config, 8), true));
    const row = rsvpEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("processing");
    expect(row.score).toBe(320);
    expect(row.level).toBe(320);
  });
});

describe("error locator", () => {
  it("plants the requested number of faults", () => {
    for (let seed = 0; seed < 60; seed++) {
      const tokens = buildTokens(seed % PASSAGES.length, 4, seed);
      expect(tokens.filter((t) => t.fault).length).toBe(4);
    }
  });

  it("never plants two faults side by side", () => {
    // Touching faults are hard to attribute to a single tap, and the player
    // would be marked wrong for finding something genuinely there.
    for (let seed = 0; seed < 80; seed++) {
      const tokens = buildTokens(seed % PASSAGES.length, 5, seed);
      const positions = tokens.map((t, i) => (t.fault ? i : -1)).filter((i) => i !== -1);
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]! - positions[i - 1]!).toBeGreaterThan(1);
      }
    }
  });

  it("only alters interior letters when it misspells", () => {
    // A wrong first letter is spotted instantly; a wrong last one often reads
    // as a different valid word.
    for (let seed = 0; seed < 120; seed++) {
      const tokens = buildTokens(seed % PASSAGES.length, 5, seed);
      for (const token of tokens.filter((t) => t.fault === "misspelling")) {
        const wrong = token.text.replace(/[^A-Za-z]/g, "");
        const right = (token.correction ?? "").replace(/[^A-Za-z]/g, "");
        expect(wrong).toHaveLength(right.length);
        expect(wrong[0]).toBe(right[0]);
        expect(wrong[wrong.length - 1]).toBe(right[right.length - 1]);
        expect(wrong).not.toBe(right);
      }
    }
  });

  it("makes a doubled word an exact repeat of the one before it", () => {
    for (let seed = 0; seed < 120; seed++) {
      const tokens = buildTokens(seed % PASSAGES.length, 4, seed);
      tokens.forEach((token, i) => {
        if (token.fault !== "doubled") return;
        const previous = tokens[i - 1];
        expect(previous).toBeDefined();
        const strip = (t: string) => t.replace(/[^A-Za-z]/g, "").toLowerCase();
        expect(strip(token.text)).toBe(strip(previous!.text));
      });
    }
  });

  it("removes real punctuation rather than inventing a fault", () => {
    for (let seed = 0; seed < 120; seed++) {
      for (const token of buildTokens(seed % PASSAGES.length, 5, seed)) {
        if (token.fault !== "punctuation") continue;
        expect(token.correction).toBeDefined();
        expect(/[,.]$/.test(token.correction!)).toBe(true);
        expect(/[,.]$/.test(token.text)).toBe(false);
      }
    }
  });

  it("counts a tap on a fault as found and anything else as a wrong tap", () => {
    let s = errorLocatorEngine.init(locator({ startFaults: 3 }), 10);
    const faultIndex = s.tokens.findIndex((t) => t.fault);
    const cleanIndex = s.tokens.findIndex((t) => !t.fault);

    s = errorLocatorEngine.input(s, { kind: "select", index: faultIndex });
    expect(s.found).toBe(1);

    s = errorLocatorEngine.input(s, { kind: "select", index: cleanIndex });
    expect(s.wrongTaps).toBe(1);
  });

  it("ignores a second tap on the same word", () => {
    let s = errorLocatorEngine.init(locator(), 11);
    const faultIndex = s.tokens.findIndex((t) => t.fault);
    s = errorLocatorEngine.input(s, { kind: "select", index: faultIndex });
    s = errorLocatorEngine.input(s, { kind: "select", index: faultIndex });
    expect(s.found).toBe(1);
  });

  it("ends the round once the strikes are spent, so guessing is not a strategy", () => {
    const config = locator({ strikes: 2, startFaults: 4 });
    let s = errorLocatorEngine.init(config, 12);
    const clean = s.tokens.map((t, i) => (t.fault ? -1 : i)).filter((i) => i !== -1);
    s = errorLocatorEngine.input(s, { kind: "select", index: clean[0]! });
    s = errorLocatorEngine.input(s, { kind: "select", index: clean[1]! });
    expect(s.stage).toBe("review");
  });

  it("ends the round early when every fault is found", () => {
    const config = locator({ startFaults: 3 });
    let s = errorLocatorEngine.init(config, 13);
    for (const index of s.tokens.map((t, i) => (t.fault ? i : -1)).filter((i) => i !== -1)) {
      s = errorLocatorEngine.input(s, { kind: "select", index });
    }
    expect(s.stage).toBe("review");
    expect(s.found).toBe(s.faultsPlanted);
  });

  it("ends the round when the clock runs out", () => {
    const config = locator({ secondsPerRound: 10 });
    let s = errorLocatorEngine.init(config, 14);
    s = errorLocatorEngine.tick(s, 10_000);
    expect(s.stage).toBe("review");
    expect(s.missed).toBeGreaterThan(0);
  });

  it("plants one more fault after a clean sweep", () => {
    const config = locator({ startFaults: 3, rounds: 4 });
    let s = errorLocatorEngine.init(config, 15);
    for (const index of s.tokens.map((t, i) => (t.fault ? i : -1)).filter((i) => i !== -1)) {
      s = errorLocatorEngine.input(s, { kind: "select", index });
    }
    expect(s.level).toBe(4);
  });

  it("writes a session row scored on faults found", () => {
    const config = locator({ rounds: 1, startFaults: 3 });
    let s = errorLocatorEngine.init(config, 16);
    for (const index of s.tokens.map((t, i) => (t.fault ? i : -1)).filter((i) => i !== -1)) {
      s = errorLocatorEngine.input(s, { kind: "select", index });
    }
    const row = errorLocatorEngine.toSession(s, config, 1_700_000_000_000);
    expect(row.gameId).toBe("error-locator");
    expect(row.score).toBe(3);
    expect(row.accuracy).toBe(1);
  });
});
