/**
 * Asset-free WebAudio SFX. The context is created lazily by `unlock()` from a user
 * gesture handler; every sound is a no-op (and never throws) while the context is
 * missing, suspended or closed, so gameplay code can call `sfx.*` unconditionally.
 */
const MIN_GAP_MS = 45;
const MASTER_GAIN = 0.25;
const NOISE_SECONDS = 0.5;

let ctx: AudioContext | null = null;
let bus: AudioNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let unavailable = false;
const lastPlayed: Record<string, number> = {};

function unlock(): void {
 if (unavailable) return;

 try {
  if (!ctx) {
   if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') {
    unavailable = true;
    return;
   }

   const context = new window.AudioContext();
   const master = context.createGain();
   master.gain.value = MASTER_GAIN;
   // A storm can stack several voices inside one frame; the limiter keeps the bus from clipping.
   const limiter = context.createDynamicsCompressor();
   limiter.threshold.value = -12;
   limiter.knee.value = 6;
   limiter.ratio.value = 12;
   limiter.attack.value = 0.003;
   limiter.release.value = 0.12;
   limiter.connect(master);
   master.connect(context.destination);

   ctx = context;
   bus = limiter;
   noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * NOISE_SECONDS), context.sampleRate);
   const samples = noiseBuffer.getChannelData(0);
   for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }

  if (ctx.state === 'suspended') void ctx.resume().catch(() => { });
 } catch {
  unavailable = true;
  ctx = null;
  bus = null;
  noiseBuffer = null;
 }
}

/** Rate limit gate: one voice per sound name per gap, using the audio clock. */
function ready(name: string): boolean {
 const audio = ctx;
 if (!audio || !bus || audio.state !== 'running') return false;

 const nowMs = audio.currentTime * 1000;
 if (nowMs - (lastPlayed[name] || 0) < MIN_GAP_MS) return false;

 lastPlayed[name] = nowMs;
 return true;
}

/** Pitched partial with a percussive attack and an exponential tail. */
function tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0): void {
 const audio = ctx;
 const out = bus;
 if (!audio || !out) return;

 try {
  const t = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const env = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
 } catch {
  // A failed voice must never break gameplay.
 }
}

/** Filtered slice of the shared noise buffer, used for cracks, crunches and hiss. */
function noise(dur: number, gain: number, kind: BiquadFilterType, f0: number, f1 = f0, q = 1, delay = 0): void {
 const audio = ctx;
 const out = bus;
 const buffer = noiseBuffer;
 if (!audio || !out || !buffer) return;

 try {
  const t = audio.currentTime + delay;
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = kind;
  filter.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  filter.Q.value = q;
  const env = audio.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
 } catch {
  // A failed voice must never break gameplay.
 }
}

const vary = (amount: number): number => 1 - amount + Math.random() * amount * 2;

export const sfx = {
 unlock,

 pistol(): void {
  if (!ready('pistol')) return;
  noise(0.05, 0.45, 'highpass', 1600, 900, 0.7);
  tone('square', 900, 420, 0.02, 0.1);
  tone('triangle', 260, 70, 0.1, 0.35);
 },

 zombieShot(): void {
  if (!ready('zombieShot')) return;
  noise(0.08, 0.4, 'lowpass', 1200, 600, 0.6);
  tone('sawtooth', 150, 55, 0.14, 0.3);
 },

 ricochet(): void {
  if (!ready('ricochet')) return;
  const d = vary(0.06);
  noise(0.02, 0.15, 'highpass', 3000, 2400, 0.7);
  tone('triangle', 2600 * d, 1500 * d, 0.16, 0.2);
  tone('triangle', 3480 * d, 2010 * d, 0.11, 0.09);
 },

 woodHit(): void {
  if (!ready('woodHit')) return;
  const d = vary(0.1);
  noise(0.05, 0.16, 'lowpass', 700, 380, 0.8);
  tone('triangle', 190 * d, 110 * d, 0.09, 0.3);
 },

 woodBreak(): void {
  if (!ready('woodBreak')) return;
  noise(0.3, 0.4, 'bandpass', 950, 500, 0.7);
  noise(0.06, 0.3, 'bandpass', 1800, 1200, 1.2, 0.04);
  noise(0.06, 0.24, 'bandpass', 2200, 1500, 1.4, 0.12);
  tone('triangle', 165, 80, 0.2, 0.25);
 },

 metalHit(): void {
  if (!ready('metalHit')) return;
  const d = vary(0.08);
  tone('triangle', 720 * d, 640 * d, 0.2, 0.18);
  tone('triangle', 1150 * d, 980 * d, 0.13, 0.09);
 },

 metalBreak(): void {
  if (!ready('metalBreak')) return;
  const d = vary(0.1);
  noise(0.28, 0.3, 'highpass', 900, 500, 0.6);
  tone('triangle', 380 * d, 250 * d, 0.42, 0.2);
  tone('triangle', 780 * d, 600 * d, 0.28, 0.11);
 },

 chainSnap(): void {
  if (!ready('chainSnap')) return;
  noise(0.03, 0.3, 'highpass', 2600, 2000, 0.8);
  tone('triangle', 1500, 700, 0.34, 0.2);
  tone('triangle', 2050, 1000, 0.2, 0.07);
 },

 anvilImpact(): void {
  if (!ready('anvilImpact')) return;
  noise(0.12, 0.25, 'lowpass', 520, 200, 0.7);
  tone('sine', 95, 45, 0.55, 0.5);
  tone('triangle', 620, 470, 0.55, 0.12);
 },

 crush(): void {
  if (!ready('crush')) return;
  noise(0.22, 0.42, 'lowpass', 1100, 400, 0.8);
  noise(0.07, 0.22, 'bandpass', 700, 500, 1.5, 0.03);
  tone('sine', 130, 45, 0.28, 0.4);
 },

 explosion(): void {
  if (!ready('explosion')) return;
  noise(0.55, 0.5, 'lowpass', 1500, 110, 0.7);
  noise(0.05, 0.35, 'highpass', 3400, 2600, 0.7, 0.012);
  tone('sine', 130, 32, 0.7, 0.55);
  tone('triangle', 240, 70, 0.4, 0.16);
 },

 zombieDeath(): void {
  if (!ready('zombieDeath')) return;
  const d = vary(0.08);
  noise(0.3, 0.1, 'lowpass', 600, 280, 0.8);
  tone('sawtooth', 235 * d, 78 * d, 0.4, 0.26);
 },

 coreHit(): void {
  if (!ready('coreHit')) return;
  noise(0.1, 0.22, 'lowpass', 800, 320, 0.7);
  tone('sine', 160, 70, 0.34, 0.38);
  tone('triangle', 325, 250, 0.3, 0.11);
 },

 playerHit(): void {
  if (!ready('playerHit')) return;
  tone('sine', 175, 60, 0.14, 0.4);
 },

 place(): void {
  if (!ready('place')) return;
  noise(0.025, 0.14, 'highpass', 2400, 2000, 0.7);
  tone('triangle', 330, 260, 0.06, 0.16);
 },

 deny(): void {
  if (!ready('deny')) return;
  tone('square', 130, 118, 0.18, 0.18);
  tone('square', 139, 126, 0.18, 0.1);
 },
};
