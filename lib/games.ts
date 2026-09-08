import type { GameId, GameMeta } from "./types";

/**
 * The exercise registry. Everything that enumerates games — the dashboard grid,
 * the sidebar, the stats page, the sitemap — reads from here, so adding a game
 * is one entry plus an engine rather than an edit in six places.
 */
export const GAMES: GameMeta[] = [
  {
    id: "n-back",
    name: "N-Back",
    tagline: "Track what appeared N steps ago",
    category: "training",
    trains: ["Working memory", "Fluid reasoning", "Attention control"],
    about:
      "The n-back task is the most studied working-memory exercise there is. A stream of stimuli arrives one at a time and you report whether the current one matches the one N steps back. Because the answer changes with every new item, you cannot rehearse a fixed list — you have to continuously update what you are holding, which is precisely the capacity the task trains.",
    how: [
      "A stimulus appears every few seconds — a square in a grid, a spoken letter, a colour, a shape.",
      "Press the key for a modality when the current stimulus matches the one N steps earlier.",
      "Say nothing when it does not match. Staying silent is a real answer and is scored.",
      "Score 90% or better and N goes up next block; below 70% and it comes back down.",
    ],
    origin: "Kirchner (1958); popularised for training by Jaeggi et al. (2008)",
    metricLabel: "N level",
    icon: "grid",
    accentVar: "--stim-1",
    hasTutorial: true,
    minutes: 8,
  },
  {
    id: "complex-working-memory",
    name: "Complex Working Memory",
    tagline: "Remember a sequence while judging symmetry",
    category: "training",
    trains: ["Working memory", "Interference control", "Task switching"],
    about:
      "A complex span task: memorising is interleaved with an unrelated decision, so you cannot quietly rehearse between items. Holding a growing list while something else keeps demanding your attention is much closer to how working memory is actually used than any pure recall task.",
    how: [
      "A pattern appears — decide whether it is symmetric about its vertical axis.",
      "A cell in the grid then lights briefly. Remember it, and where it fell in the order.",
      "The two alternate for as many rounds as the current level demands.",
      "Recall the cells in the order they appeared. Two perfect trials promote you; two failures demote you.",
    ],
    origin: "Symmetry span; Unsworth, Heitz, Schrock & Engle (2005)",
    metricLabel: "Set size",
    icon: "layers",
    accentVar: "--stim-5",
    hasTutorial: true,
    minutes: 7,
  },
  {
    id: "memory-span",
    name: "Memory Span",
    tagline: "Hold a growing sequence in mind",
    category: "training",
    trains: ["Short-term memory", "Verbal encoding", "Attention"],
    about:
      "The classic span task. Items appear one after another and you repeat them back. Each success adds one item, until you reach the length where your memory gives out — that length is your span. Reverse mode asks for the sequence backwards, which turns simple storage into manipulation and is reliably harder.",
    how: [
      "Digits (or letters) flash one at a time.",
      "Type them back in order — or in reverse, if reverse mode is on.",
      "Get it right and the sequence grows by one.",
      "Two failures at the same length end the run. Your longest correct sequence is your span.",
    ],
    origin: "Digit span; Jacobs (1887), and a subtest of every major IQ battery since",
    metricLabel: "Span",
    icon: "sequence",
    accentVar: "--stim-3",
    hasTutorial: true,
    minutes: 5,
  },
  {
    id: "corsi",
    name: "Corsi Block-Tapping",
    tagline: "Repeat the sequence of blocks",
    category: "training",
    trains: ["Visuospatial memory", "Sequencing", "Attention"],
    about:
      "The spatial counterpart to digit span. Nine blocks sit in a deliberately irregular arrangement — irregular so you cannot fall back on a tidy verbal description like 'top row, left to right'. They light in sequence and you tap them back. Most healthy adults land somewhere between five and seven.",
    how: [
      "Watch the blocks light up one after another.",
      "Tap them back in the same order — or in reverse, in reverse mode.",
      "Each success adds one block to the sequence.",
      "Two failures at the same length end the run.",
    ],
    origin: "Corsi (1972)",
    metricLabel: "Block span",
    icon: "blocks",
    accentVar: "--stim-6",
    hasTutorial: true,
    minutes: 5,
  },
  {
    id: "pasat",
    name: "PASAT",
    tagline: "Add each number to the one before it",
    category: "training",
    trains: ["Processing speed", "Working memory", "Sustained attention"],
    about:
      "Paced Auditory Serial Addition. Numbers arrive at a fixed rhythm that does not wait for you, and each answer must be added to the number before it — not to your running total. The moment you slip, the next item is already arriving, which is what makes this the most demanding exercise here.",
    how: [
      "A digit is spoken (or shown) every few seconds.",
      "Add it to the digit immediately before it, and answer with that sum.",
      "Do not keep a running total. Each sum uses only the last two digits.",
      "Answer accurately and the pace quickens. Miss too many and it eases back.",
    ],
    origin: "Gronwall (1977)",
    metricLabel: "Correct sums",
    icon: "pulse",
    accentVar: "--stim-4",
    hasTutorial: true,
    minutes: 4,
  },
  {
    id: "mental-math",
    name: "Mental Math",
    tagline: "Arithmetic in your head, against the clock",
    category: "training",
    trains: ["Numerical fluency", "Processing speed", "Working memory"],
    about:
      "Addition, subtraction, multiplication and division, with no pen and no calculator. Difficulty is tracked separately for each side of the problem, so if three-digit multipliers are what slows you down, that is the side that stays put while the other keeps growing.",
    how: [
      "A problem appears. Solve it in your head and type the answer.",
      "Speed counts as well as accuracy.",
      "Each operand has its own digit-length level, and they move independently.",
      "Mix mode shuffles all four operations so you cannot anticipate the next one.",
    ],
    origin: "Standard arithmetic fluency training",
    metricLabel: "Correct",
    icon: "calculator",
    accentVar: "--stim-2",
    hasTutorial: false,
    minutes: 5,
  },
  {
    id: "cryptogram",
    name: "Cryptogram",
    tagline: "Decode a famous quote from a number cipher",
    category: "game",
    trains: ["Logic", "Pattern recognition", "Deduction"],
    about:
      "Every letter of the alphabet has been swapped for a number. A quotation sits on screen with only a few of those pairings revealed, and the rest is deduction — letter frequencies, one-letter words, the shapes of common endings. Unlike the exercises here it is untimed, which makes it the one to reach for when you want to think rather than react.",
    how: [
      "Each number stands for one letter, consistently, throughout the quote.",
      "A few pairings are given to start you off.",
      "Click a cell and type the letter you think belongs there.",
      "Conflicts are highlighted. A hint reveals one pairing, at a cost to your score.",
    ],
    origin: "Classic substitution puzzle",
    metricLabel: "Solved",
    icon: "cipher",
    accentVar: "--stim-5",
    hasTutorial: false,
    minutes: 10,
  },
];

export const GAME_BY_ID: Record<GameId, GameMeta> = Object.fromEntries(
  GAMES.map((g) => [g.id, g]),
) as Record<GameId, GameMeta>;

export const TRAINING_GAMES = GAMES.filter((g) => g.category === "training");
export const CASUAL_GAMES = GAMES.filter((g) => g.category === "game");

export function isGameId(value: string): value is GameId {
  return value in GAME_BY_ID;
}
