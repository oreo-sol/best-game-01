// Procedural sound effects: every sound is a WebAudio oscillator or filtered
// noise burst, so the game ships no audio files and makes no network request.
// The context is created on the first user gesture; until then every call is a no-op.
export function createSoundBank() {
  let context = null;
  let muted = false;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    } catch {
      context = null;
    }
    return context;
  }

  /** A short oscillator blip that slides from `from` Hz to `to` Hz. */
  function tone(from, to, duration, type, volume) {
    const ctx = ensure();
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, from), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  /** A burst of white noise through a low-pass filter (explosions, hits). */
  function noiseBurst(duration, volume, cutoff) {
    const ctx = ensure();
    if (!ctx || muted) return;
    try {
      const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  return {
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shoot() {
      tone(880, 320, 0.08, 'square', 0.05);
    },
    enemyDie() {
      noiseBurst(0.18, 0.16, 1200);
      tone(320, 60, 0.18, 'sawtooth', 0.08);
    },
    playerHit() {
      noiseBurst(0.25, 0.22, 700);
      tone(160, 40, 0.3, 'sawtooth', 0.14);
    },
    pickup() {
      tone(520, 520, 0.07, 'sine', 0.1);
      setTimeout(() => tone(780, 780, 0.09, 'sine', 0.1), 60);
    },
    waveStart() {
      tone(220, 440, 0.22, 'triangle', 0.12);
      setTimeout(() => tone(330, 660, 0.22, 'triangle', 0.1), 120);
    },
    bossWarn() {
      tone(110, 55, 0.5, 'sawtooth', 0.16);
      setTimeout(() => tone(110, 55, 0.5, 'sawtooth', 0.16), 300);
    },
    gameOver() {
      tone(330, 55, 0.9, 'sawtooth', 0.14);
    },
    victory() {
      [523, 659, 784, 1047].forEach((freq, i) => setTimeout(() => tone(freq, freq, 0.25, 'triangle', 0.12), i * 130));
    },
    upgrade() {
      tone(440, 880, 0.16, 'triangle', 0.12);
    },
  };
}
