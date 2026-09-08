/**
 * Audio for the exercises.
 *
 * Two independent voices, because neither alone is sufficient:
 *
 *  - `speech` uses SpeechSynthesis. It is what BrainScale does and keeps the
 *    task auditory-verbal, as the research paradigm intends. But voice
 *    availability is an OS concern: plenty of Linux browsers ship with none
 *    installed, and Chrome's voice list arrives asynchronously.
 *  - `tones` uses Web Audio oscillators. Always available, perfectly timed,
 *    but changes the task from verbal to pitch discrimination.
 *
 * The player picks; if speech is selected and no voice materialises, we fall
 * back to tones rather than running a silent audio n-back, which would be
 * unscoreable without the player realising why.
 */

export type AudioMode = "speech" | "tones";

/** The Jaeggi letter set: chosen to be acoustically distinct from each other. */
export const LETTERS = ["c", "h", "k", "l", "q", "r", "s", "t"] as const;
export type Letter = (typeof LETTERS)[number];

/** Pentatonic-ish pitches, spaced widely enough to tell apart under load. */
const TONE_HZ = [262, 311, 370, 440, 523, 622, 740, 880];

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers suspend the context until a user gesture; every play screen has
  // a Start button, so resuming here is enough.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Must be called from a user gesture, once, before a session starts. */
export function unlockAudio(): void {
  const c = audioContext();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  gain.gain.value = 0;
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.01);

  // Chrome only populates getVoices() after it has been asked once.
  if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
}

export function speechAvailable(): boolean {
  return typeof speechSynthesis !== "undefined" && speechSynthesis.getVoices().length > 0;
}

/** Resolves once voices are loaded, or after `timeout` if they never arrive. */
export function waitForVoices(timeout = 1200): Promise<boolean> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve(false);
  if (speechSynthesis.getVoices().length > 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      speechSynthesis.removeEventListener("voiceschanged", onChange);
      clearTimeout(timer);
      resolve(ok);
    };
    const onChange = () => done(speechSynthesis.getVoices().length > 0);
    const timer = setTimeout(() => done(speechSynthesis.getVoices().length > 0), timeout);
    speechSynthesis.addEventListener("voiceschanged", onChange);
  });
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const english = voices.filter((v) => v.lang.startsWith("en"));
  const pool = english.length > 0 ? english : voices;
  return pool.find((v) => v.localService) ?? pool[0] ?? null;
}

function speakLetter(letter: string): boolean {
  if (typeof speechSynthesis === "undefined") return false;
  const voice = pickVoice();
  if (!voice) return false;

  // Cancel first: a queued utterance from a previous trial arriving late would
  // desynchronise the audio channel from the visual one.
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(letter.toUpperCase());
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1.05;
  u.pitch = 1;
  u.volume = 1;
  speechSynthesis.speak(u);
  return true;
}

function playTone(index: number, durationMs = 320): void {
  const c = audioContext();
  if (!c) return;
  const hz = TONE_HZ[index % TONE_HZ.length]!;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = "sine";
  osc.frequency.value = hz;
  // Envelope, not a hard gate — a square-edged gain change clicks audibly.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.015);
  gain.gain.setValueAtTime(0.22, now + durationMs / 1000 - 0.06);
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000);

  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

/**
 * Present stimulus `index` on the auditory channel. Returns the mode actually
 * used, which may differ from the one requested if speech was unavailable.
 */
export function playStimulus(index: number, mode: AudioMode): AudioMode {
  if (mode === "speech") {
    const letter = LETTERS[index % LETTERS.length]!;
    if (speakLetter(letter)) return "speech";
    playTone(index);
    return "tones";
  }
  playTone(index);
  return "tones";
}

export function speakNumber(n: number): boolean {
  if (typeof speechSynthesis === "undefined") return false;
  const voice = pickVoice();
  if (!voice) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(n));
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 1.1;
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeech(): void {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/* --------------------------------------------------------------- UI cues */

type Cue = "correct" | "wrong" | "tick" | "start" | "finish";

const CUES: Record<Cue, { hz: number[]; dur: number; gain: number }> = {
  correct: { hz: [660, 880], dur: 90, gain: 0.12 },
  wrong: { hz: [200, 150], dur: 130, gain: 0.12 },
  tick: { hz: [1200], dur: 25, gain: 0.05 },
  start: { hz: [523, 659, 784], dur: 90, gain: 0.1 },
  finish: { hz: [784, 659, 523, 659], dur: 110, gain: 0.1 },
};

export function playCue(cue: Cue): void {
  const c = audioContext();
  if (!c) return;
  const spec = CUES[cue];
  spec.hz.forEach((hz, i) => {
    const start = c.currentTime + (i * spec.dur) / 1000;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(spec.gain, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + spec.dur / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + spec.dur / 1000 + 0.02);
  });
}
