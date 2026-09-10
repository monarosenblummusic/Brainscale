export interface Passage {
  /** The passage itself, one or two sentences. */
  text: string;
  /** A comprehension check with exactly one right answer. */
  question: string;
  options: [string, string, string];
  /** Index into `options`. */
  answer: number;
}

/**
 * Passages for Processing and Error Locator.
 *
 * Written rather than quoted, for three reasons. They need a controlled length
 * (35-60 words, so a run at 500 wpm lasts a few seconds); they need to be
 * answerable from the passage alone, so the question tests reading rather than
 * general knowledge; and they need ordinary vocabulary, since a rare word
 * stalls the reader for reasons that have nothing to do with reading speed.
 */
export const PASSAGES: Passage[] = [
  {
    text: "The lighthouse keeper kept a log of every ship that passed the point. Most nights he recorded nothing at all. But on the night of the storm he counted eleven vessels, all of them running for the shelter of the harbour before the wind turned.",
    question: "How many vessels did he count on the night of the storm?",
    options: ["Eleven", "Seven", "None"],
    answer: 0,
  },
  {
    text: "Bees returning to the hive perform a small dance on the comb. The angle of the dance tells the others which way to fly relative to the sun, and the length of it tells them how far. A longer dance means a longer journey.",
    question: "What does the length of the dance communicate?",
    options: ["The distance to fly", "The direction to fly", "How much nectar was found"],
    answer: 0,
  },
  {
    text: "The old bridge was built without a single nail. Its beams were cut to interlock so tightly that the weight of the structure held it together, and the heavier the load crossing it, the more firmly the joints pressed into one another.",
    question: "What held the bridge together?",
    options: ["The weight of the structure", "Iron nails", "Ropes and cable"],
    answer: 0,
  },
  {
    text: "She had planned to take the coast road, but the tide was higher than the forecast promised and the causeway had already gone under. So she turned inland instead, adding an hour to the drive and arriving after the shop had closed.",
    question: "Why did she turn inland?",
    options: ["The causeway was underwater", "The coast road was closed for repairs", "She wanted to visit the shop"],
    answer: 0,
  },
  {
    text: "The library kept its rarest books in a room with no windows. Light fades ink over time, and even the reflected glow from a corridor was thought too much. Readers were given copies, and the originals were brought out perhaps twice a year.",
    question: "Why did the room have no windows?",
    options: ["Light fades ink", "The room was underground", "To keep the books cool"],
    answer: 0,
  },
  {
    text: "Volcanic soil is unusually fertile because the ash that settles after an eruption is rich in minerals plants need. Farmers have long returned to the slopes for exactly that reason, accepting the risk in exchange for harvests that outstrip anything the lowlands can offer.",
    question: "Why do farmers return to volcanic slopes?",
    options: ["The soil is far more fertile", "The land is cheaper there", "The climate is milder"],
    answer: 0,
  },
  {
    text: "The clockmaker refused to sell his best piece. He had spent four years on it and said that finishing a thing was not the same as being done with it. Every few months he opened the case and adjusted something only he could see.",
    question: "How long had he spent on the clock?",
    options: ["Four years", "Four months", "Most of his life"],
    answer: 0,
  },
  {
    text: "Some birds navigate by the stars. Raised indoors under an artificial sky, they will orient themselves towards whatever pattern they were shown, even when it bears no relation to the real one. The map, it seems, is learned rather than inherited.",
    question: "What does the experiment suggest about the birds' star map?",
    options: ["It is learned, not inherited", "It is inherited from their parents", "It only works at certain times of year"],
    answer: 0,
  },
  {
    text: "The train was late, which mattered less than it might have, since the connection was late too. They stood on the same platform for forty minutes watching the departure board revise itself, and in the end arrived within a few minutes of the original schedule.",
    question: "How did the delay end up affecting their arrival?",
    options: ["They arrived close to schedule", "They missed the connection entirely", "They arrived an hour late"],
    answer: 0,
  },
  {
    text: "Paper was once so expensive that letters were written across the page and then turned ninety degrees and written across again. The result is difficult to read but perfectly legible once you know to expect it, and a great deal of correspondence survives in that form.",
    question: "Why were letters written twice across the same page?",
    options: ["Paper was expensive", "It was a way of encoding secrets", "Ink dried too slowly"],
    answer: 0,
  },
  {
    text: "The cook insisted the soup be made a day early. Flavours need time to settle into one another, she said, and a soup eaten straight from the pot tastes like a list of its ingredients rather than a single thing.",
    question: "Why did she make the soup a day early?",
    options: ["To let the flavours settle", "To save time on the day", "Because the stove was needed"],
    answer: 0,
  },
  {
    text: "Desert plants often have very small leaves, or none at all. A leaf is where water escapes, so shedding them is the simplest defence available. Photosynthesis moves instead into the stem, which is why so many of these plants are green all the way down.",
    question: "Why are many desert plants green all the way down?",
    options: ["Photosynthesis happens in the stem", "They store water in the bark", "The colour reflects sunlight"],
    answer: 0,
  },
  {
    text: "He learned to sail on a boat with no engine, which he later said was the only way to learn properly. Without the option of simply motoring out of trouble, you pay attention to the wind long before it becomes a problem.",
    question: "What did sailing without an engine teach him?",
    options: ["To read the wind early", "To navigate by the stars", "To repair his own sails"],
    answer: 0,
  },
  {
    text: "The map was wrong in one particular: it showed a road where there had only ever been a track. The error had been copied from an earlier map, and from that one into a dozen others, until the road existed everywhere except on the ground.",
    question: "How did the error spread?",
    options: ["It was copied from map to map", "A surveyor measured the track wrongly", "The road was demolished later"],
    answer: 0,
  },
  {
    text: "Sound travels roughly four times faster through water than through air. Whales exploit this, calling at frequencies that carry for hundreds of miles, so two animals that will never meet may nonetheless be in something like conversation.",
    question: "How much faster does sound travel through water?",
    options: ["About four times", "About twice", "About ten times"],
    answer: 0,
  },
  {
    text: "The garden was designed to look untended. Every apparently wild corner had been planned, and the gardener spent as much effort keeping the disorder convincing as another might spend on straight edges and clipped hedges.",
    question: "What did the gardener work to maintain?",
    options: ["A convincing appearance of wildness", "Perfectly straight edges", "A collection of rare species"],
    answer: 0,
  },
  {
    text: "Coins were once weighed rather than counted, because their value lay in the metal rather than the stamp. Clipping small slivers from the edges was common enough that milled edges were introduced, making any theft immediately visible.",
    question: "Why were milled edges introduced?",
    options: ["To make clipping visible", "To make coins easier to stack", "To mark their country of origin"],
    answer: 0,
  },
  {
    text: "She kept two notebooks: one for what happened and one for what she thought about it. Mixing them, she found, made both harder to trust later, because a memory recorded alongside an opinion tends to take the shape of that opinion.",
    question: "Why did she keep the notebooks separate?",
    options: ["Opinions reshape recorded memories", "One was for work and one for home", "She wrote in different languages"],
    answer: 0,
  },
  {
    text: "The tunnel was dug from both ends at once, which halved the time and doubled the risk. The two teams met forty feet below the ridge, and the join was off by less than the width of a hand — an accuracy nobody had promised beforehand.",
    question: "How accurate was the join?",
    options: ["Off by less than a hand's width", "Off by several feet", "Exactly aligned"],
    answer: 0,
  },
  {
    text: "Snow reflects most of the light that falls on it, which is why it is slow to melt even under a bright sun. Once a patch of ground is exposed, though, the darker surface absorbs heat and the thaw accelerates around it.",
    question: "Why does the thaw accelerate once ground is exposed?",
    options: ["Darker ground absorbs heat", "Wind reaches the snow more easily", "The ground is warmer underneath"],
    answer: 0,
  },
];
