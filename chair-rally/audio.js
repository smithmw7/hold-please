const NOTES = {
  E1: 41.2,
  E2: 82.41,
  G2: 98,
  A2: 110,
  B2: 123.47,
  D3: 146.83,
  E3: 164.81,
  G3: 196,
  A3: 220,
  B3: 246.94,
  E4: 329.63,
  B4: 493.88,
  E5: 659.25,
  B5: 987.77,
  E6: 1318.51,
};

export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.sfxBus = null;
    this.bassFilter = null;
    this.saturator = null;
    this.rollerGain = null;
    this.noiseBuffer = null;
    this.started = false;
    this.muted = localStorage.getItem("chair-rally-muted") === "1";
    this.nextStep = 0;
    this.step = 0;
    this.speed = 0;
    this.air = 0;
    this.coffee = 0;
    this.paused = false;
  }

  async start() {
    if (!this.ctx) this.create();
    await this.ctx.resume();
    this.nextStep = this.ctx.currentTime + 0.05;
    if (!this.started) {
      this.started = true;
      this.startCue();
    }
  }

  create() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -8;
    compressor.knee.value = 8;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.66;
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.42;
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.72;
    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = "lowpass";
    this.bassFilter.frequency.value = 520;
    this.bassFilter.Q.value = 1.2;
    this.saturator = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < curve.length; i += 1) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.3) * 0.82;
    }
    this.saturator.curve = curve;
    this.saturator.oversample = "2x";

    this.bassFilter.connect(this.saturator);
    this.saturator.connect(this.music);
    this.music.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(this.ctx.destination);

    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    const roller = this.ctx.createBufferSource();
    const rollerFilter = this.ctx.createBiquadFilter();
    this.rollerGain = this.ctx.createGain();
    roller.buffer = buffer;
    roller.loop = true;
    rollerFilter.type = "bandpass";
    rollerFilter.frequency.value = 720;
    rollerFilter.Q.value = 3.5;
    this.rollerGain.gain.value = 0;
    roller.connect(rollerFilter);
    rollerFilter.connect(this.rollerGain);
    this.rollerGain.connect(this.music);
    roller.start();
  }

  setState({ speed = 0, air = 0, coffee = 0, battery = 100, paused = false }) {
    const wasPaused = this.paused;
    this.speed = speed;
    this.air = air;
    this.coffee = coffee;
    this.paused = paused;
    if (!this.ctx || !this.music) return;
    const now = this.ctx.currentTime;
    if (wasPaused && !paused) this.nextStep = now + 0.05;
    const target = paused ? 0 : battery < 20 ? 0.28 : air > 1.3 ? 0.3 : 0.42;
    this.music.gain.setTargetAtTime(target, now, 0.04);
    const airCut = air > 1.3 ? 220 : 0;
    this.bassFilter.frequency.setTargetAtTime(
      300 + Math.min(1, speed / 1700) * 900 + (coffee > 0 ? 500 : 0) - airCut,
      now,
      0.05,
    );
    this.rollerGain?.gain.setTargetAtTime(paused || air > 0.08 ? 0 : Math.min(0.035, speed / 48000), now, 0.035);
  }

  update() {
    if (!this.ctx || !this.started) return;
    if (this.paused || this.muted) {
      this.nextStep = this.ctx.currentTime + 0.05;
      return;
    }
    const beat = 60 / 152;
    const stepLength = beat / 4;
    while (this.nextStep < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextStep, stepLength);
      this.nextStep += stepLength;
      this.step = (this.step + 1) % 64;
    }
  }

  scheduleStep(step, time, length) {
    const kickSteps = new Set([0, 7, 16, 22, 32, 39, 48, 54]);
    const snareSteps = new Set([8, 24, 40, 56]);
    const bassPattern = [
      NOTES.E2, null, NOTES.E2, NOTES.G2, null, NOTES.B2, NOTES.A2, null, NOTES.E2, null, NOTES.D3, null, NOTES.B2, NOTES.A2, null, NOTES.G2,
      NOTES.E2, NOTES.G2, null, NOTES.A2, NOTES.B2, null, NOTES.D3, null, NOTES.E2, null, NOTES.B2, NOTES.A2, null, NOTES.G2, NOTES.A2, null,
    ];
    const local = step % 32;

    if (kickSteps.has(step)) this.kick(time, 0.32, this.music);
    if (snareSteps.has(step)) this.snare(time, 0.18, this.music);
    if (step % 2 === 1 && (this.speed > 350 || step % 4 === 3)) this.hat(time, step % 4 === 3 ? 0.055 : 0.025, this.music);

    const bassNote = bassPattern[local];
    if (bassNote) this.tone(bassNote, time, length * 0.82, "sawtooth", 0.055 + Math.min(0.025, this.speed / 80000), this.bassFilter);
    this.tone(bassNote ? bassNote / 2 : 0, time, length * 0.78, "sine", bassNote ? 0.075 : 0, this.music);

    if ((step === 12 || step === 28 || step === 44 || step === 60) && this.speed > 650) {
      const lead = step % 32 === 12 ? NOTES.B3 : NOTES.E4;
      this.tone(lead, time, length * 1.4, "square", 0.028 + (this.coffee > 0 ? 0.018 : 0), this.music);
    }
  }

  tone(frequency, time, duration, type, volume, destination) {
    if (!frequency || !volume || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  noise(time, duration, filterType, frequency, volume, destination = this.sfxBus) {
    if (!this.ctx || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(time);
    source.stop(time + duration);
  }

  kick(time, volume = 0.35, destination = this.sfxBus) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.09);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(time);
    osc.stop(time + 0.12);
  }

  snare(time, volume = 0.2, destination = this.sfxBus) {
    this.noise(time, 0.11, "bandpass", 1600, volume, destination);
    this.tone(190, time, 0.09, "triangle", volume * 0.45, destination);
  }

  hat(time, duration, destination = this.sfxBus) {
    this.noise(time, duration, "highpass", 8200, 0.035, destination);
  }

  sfx(name, intensity = 1) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (name === "battery") {
      [NOTES.E5, NOTES.B5, NOTES.E6].forEach((note, i) => this.tone(note, now + i * 0.055, 0.11, "square", 0.08, this.sfxBus));
    } else if (name === "coffee") {
      this.tone(280, now, 0.12, "sine", 0.09, this.sfxBus);
      this.tone(190, now + 0.09, 0.15, "sine", 0.08, this.sfxBus);
      this.noise(now + 0.04, 0.16, "highpass", 5200, 0.07);
    } else if (name === "landing") {
      this.kick(now, 0.24 * intensity);
      this.noise(now, 0.09, "bandpass", 850, 0.12 * intensity);
      this.tone(820, now + 0.015, 0.05, "triangle", 0.06, this.sfxBus);
    } else if (name === "takeoff") {
      this.noise(now, 0.13, "highpass", 2400, 0.075);
    } else if (name === "trick") {
      [NOTES.E3, NOTES.A3, NOTES.B3].forEach((note, i) => this.tone(note, now + i * 0.035, 0.16, "sawtooth", 0.055, this.sfxBus));
    } else if (name === "crash") {
      this.noise(now, 0.24, "lowpass", 900, 0.24);
      this.tone(74, now, 0.22, "triangle", 0.16, this.sfxBus);
    } else if (name === "ui") {
      this.tone(640, now, 0.04, "square", 0.05, this.sfxBus);
    }
  }

  startCue() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [NOTES.E3, NOTES.B3, NOTES.E4].forEach((note, i) => this.tone(note, now + i * 0.08, 0.12, "square", 0.07, this.sfxBus));
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem("chair-rally-muted", this.muted ? "1" : "0");
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.66, this.ctx.currentTime, 0.025);
      if (!this.muted) this.nextStep = this.ctx.currentTime + 0.05;
    }
    return this.muted;
  }
}
