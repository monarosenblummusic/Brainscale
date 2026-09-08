# BrainScale

Seven brain-training exercises from the cognitive-psychology literature, implemented to their published
parameters and playable in the browser. No account, no server, no tracking — sessions live in your own
browser's IndexedDB.

Built to mirror [brainscale.net](https://brainscale.net)'s exercise roster and its info → tutorial → training
flow, with a cleaner visual layer.

## The exercises

| Exercise | What it trains | Origin |
| --- | --- | --- |
| **N-Back** | Working memory, fluid reasoning | Kirchner (1958); Jaeggi et al. (2008) |
| **Complex Working Memory** | Working memory under interference | Symmetry span; Unsworth et al. (2005) |
| **Memory Span** | Short-term memory, verbal encoding | Digit span; Jacobs (1887) |
| **Corsi Block-Tapping** | Visuospatial memory, sequencing | Corsi (1972) |
| **PASAT** | Processing speed, sustained attention | Gronwall (1977) |
| **Mental Math** | Numerical fluency, processing speed | Arithmetic fluency training |
| **Cryptogram** | Logic, pattern recognition | Classic substitution puzzle |

Each has an info page, most have an interactive tutorial, and all six training exercises adapt their
difficulty to how you actually perform.

### Notable parameters

- **N-Back** — position, audio, colour and shape channels; single through quad modes. Blocks are `20 + n²`
  trials (Brain Workshop's formula, which reproduces the 84 trials at 8-back that BrainScale reports).
  Selectable adaptive policies, each paired with the scoring rule it was written for — the rule matters,
  because it decides where the "did nothing at all" baseline sits:

  | Policy | Formula | Aggregation | Thresholds | Floor |
  | --- | --- | --- | --- | --- |
  | Standard | `(TP + TN) / all trials` | mean of modalities | 90 up / 70 down | ~75% |
  | Jaeggi | `(TP + TN) / all trials` | weakest modality | 90 up / 75 down | ~75% |
  | Brain Workshop | `TP / (TP + FP + FN)` | pooled | 80 up / 50 down ×3 | 0% |
  | Manual | `TP / (TP + FP + FN)` | pooled | never moves | 0% |

  Under the first two, correct non-responses count — so ignoring a block entirely still scores about 75%,
  and the results screen says so when a block lands at or below that. Brain Workshop mode scores only the
  targets you catch. Either way the results screen leads with the raw count (`1 / 24 targets caught · 4
  false alarms`), which is the same number under every rule.
- **CWM** — 8×8 symmetry judgement interleaved with a 4×4 cell to remember, 650 ms highlight / 500 ms blank,
  promoting after two consecutive perfect blocks.
- **PASAT** — the standard 3.0 / 2.4 / 2.0 / 1.6 s ISI ladder over 61 digits.
- **Mental Math** — difficulty is two independent operand digit-lengths, so your weak side does not hold the
  other back.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # 145 engine unit tests (vitest)
npm run e2e          # 23 browser smoke tests (playwright)
```

## Deploying

No database, no environment variables. Push the repo and import it on Vercel — the Next.js defaults are all
it needs. Everything is statically rendered; game logic runs entirely in the browser.

## How it is put together

The load-bearing decision: **each game is a pure state machine, and React is only a shell.**

```ts
// lib/engine/types.ts
interface Engine<Config, State, Result> {
  init(config: Config, seed: number): State;
  tick(state: State, elapsed: number): State;   // time-driven transitions
  input(state: State, event: InputEvent): State; // key press / tap
  isFinished(state: State): boolean;
  result(state: State): Result;
  toSession(state: State, config: Config, startedAt: number): Omit<Session, "id">;
}
```

Engines contain no React, no DOM and no wall clock — time enters only as the `elapsed` argument. One
`useGameEngine` hook drives all of them from a `requestAnimationFrame` loop anchored to `performance.now()`
(rather than accumulating frame deltas, which would let the session clock drift away from real time — and for
n-back and PASAT the interval *is* the difficulty).

Two consequences follow, and they are why seven games were tractable:

1. HUD, countdown, pause, results and persistence are written **once**, in `components/game-shell/`.
2. Every engine is testable headlessly against a fixed seed — no DOM, no fake timers. The 142 unit tests run
   in about a second.

```
app/
  (shell)/            dashboard, game info pages, tutorials, stats, settings
  play/[slug]/        the full-bleed play environment (no nav, no links out)
lib/engine/           the seven state machines, plus rng / adaptive policies
lib/audio/            speech synthesis, Web Audio tones, UI cues
lib/store/            repository interfaces + an IndexedDB implementation
components/game-shell/ HUD, Stage, Countdown, PauseOverlay, ResultScreen
tests/engine/         142 unit tests
tests/e2e/            23 Playwright smoke tests
```

### Storage

`lib/store/repository.ts` defines three interfaces — `SessionRepo`, `SettingsRepo`, `ProfileRepo`. IndexedDB
implements them today; a Postgres-backed `remote.ts` would implement the same three without any caller
changing. If storage is blocked (a private window, blocked site data), the store falls back to memory so
games still play, and Settings says so rather than losing your sessions silently.

### Audio

N-Back's auditory channel ships two voices: spoken letters via `SpeechSynthesis` (what the research paradigm
intends) and synthesized tones via Web Audio. Speech is the default, but voice availability is an OS concern —
plenty of Linux browsers ship with none — so the app detects that before a session starts, says so, and falls
back to tones.

### Accessibility

Every exercise is fully keyboard-operable. Feedback goes through ARIA live regions, the stimulus palette is
chosen for colour-vision-deficiency separability with an optional shape-redundancy setting, and
`prefers-reduced-motion` turns flashes into instant state changes without losing the information they carry.

## A note on the evidence

You will get better at these tasks; that much is not in question. Whether the improvement *transfers* to
unrelated abilities is genuinely contested — the 2008 Jaeggi result has had both replications and failures to
replicate, and meta-analyses disagree about how much survives once control-group design is accounted for.
Train because the tasks are absorbing and the progress is measurable, and treat broader claims with the
scepticism they have earned.
