// 오디오: 마이크 분석(온셋 + 음높이 추정), 미리 듣기 신시사이저, 메트로놈
// 판정 방식: 악보에서 "어떤 음이 나와야 하는지" 알고 있으므로, 소리 시작(온셋) 직후의
// 스펙트럼에서 해당 음의 배음 에너지가 새로 생겼는지 확인한다 (MIDI 연결 없이 마이크만 사용).

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NAMES = ['도', '도#', '레', '미b', '미', '파', '파#', '솔', '솔#', '라', '시b', '시'];
export const midiNameKo = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

let sharedCtx = null;
export function getCtx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (sharedCtx.state === 'suspended') sharedCtx.resume();
  return sharedCtx;
}

const MIDI_LO = 28, MIDI_HI = 100;
const HARM_W = [1, 0.8, 0.6, 0.45, 0.35];

export class Mic {
  constructor() {
    this.listeners = new Set();
    this.level = 0;
    this.running = false;
    this.sensitivity = 5; // 1..10
    this.latency = 0;     // 초 (지연 보정)
  }

  async start() {
    if (this.running) return;
    const ctx = (this.ctx = getCtx());
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const src = ctx.createMediaStreamSource(this.stream);
    this.fast = ctx.createAnalyser(); this.fast.fftSize = 1024; this.fast.smoothingTimeConstant = 0;
    this.slow = ctx.createAnalyser(); this.slow.fftSize = 8192; this.slow.smoothingTimeConstant = 0;
    src.connect(this.fast); src.connect(this.slow);
    this.src = src;
    this.fastBuf = new Float32Array(this.fast.frequencyBinCount);
    // 3틱(약 24ms) 전 스펙트럼과 비교 → 같은 음 연타처럼 천천히 커지는 어택도 잡는다
    this.prevRing = [0, 1, 2].map(() => new Float32Array(this.fast.frequencyBinCount));
    this.ringPos = 0;
    // 배경 소음 기준(적응형): 태블릿 마이크 입력이 작아도 같은 기준으로 감지되게 한다
    this.noiseAmp = 1e-4;
    this.noiseRms = 0.001;
    this.slowBuf = new Float32Array(this.slow.frequencyBinCount);
    this.timeBuf = new Float32Array(this.fast.fftSize);
    this.fluxHist = [];
    this.lastOnset = 0;
    this.running = true;
    this.timer = setInterval(() => this.tick(), 8);
  }

  stop() {
    if (!this.running) return;
    clearInterval(this.timer);
    this.stream.getTracks().forEach((t) => t.stop());
    this.src.disconnect();
    this.running = false;
    this.level = 0;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  tick() {
    const ctx = this.ctx;
    this.fast.getFloatTimeDomainData(this.timeBuf);
    let rms = 0;
    for (let i = 0; i < this.timeBuf.length; i++) rms += this.timeBuf[i] * this.timeBuf[i];
    rms = Math.sqrt(rms / this.timeBuf.length);
    this.level = Math.min(1, rms * 8);

    // spectral flux (로그 압축) → 온셋
    this.fast.getFloatFrequencyData(this.fastBuf);
    const binHz = ctx.sampleRate / this.fast.fftSize;
    const lo = Math.max(1, Math.floor(50 / binHz)), hi = Math.min(this.fastBuf.length - 1, Math.floor(6000 / binHz));
    // 이번 프레임의 대역 중앙 크기 → 소음 기준 추적 (내려갈 땐 바로, 올라갈 땐 천천히)
    const amps = new Float32Array(hi - lo);
    for (let i = lo; i < hi; i++) amps[i - lo] = Math.pow(10, this.fastBuf[i] / 20);
    const frameMed = Float32Array.from(amps).sort()[amps.length >> 1] || 1e-7;
    this.noiseAmp = Math.min(3e-3, Math.max(1e-6, frameMed < this.noiseAmp ? frameMed : this.noiseAmp * 1.001));
    this.noiseRms = Math.max(1e-5, rms < this.noiseRms ? rms : this.noiseRms * 1.001);
    const scale = 1 / (this.noiseAmp * 3); // 소음 ≈ 0.3, 소음보다 30dB 크면 ≈ 2.4
    const prev = this.prevRing[this.ringPos];
    let flux = 0;
    for (let i = lo; i < hi; i++) {
      const v = Math.log1p(amps[i - lo] * scale);
      const d = v - prev[i];
      if (d > 0) flux += d;
      prev[i] = v;
    }
    this.ringPos = (this.ringPos + 1) % this.prevRing.length;
    const hist = this.fluxHist;
    hist.push(flux); if (hist.length > 60) hist.shift();
    const sorted = [...hist].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] || 0;
    // 감도 1(둔감)~10(민감)
    const k = 2.6 - this.sensitivity * 0.16;
    const floor = 9 - this.sensitivity * 0.7;
    const now = ctx.currentTime;
    if (flux > med * k + floor && rms > Math.max(3e-4, this.noiseRms * 2) && now - this.lastOnset > 0.07) {
      this.lastOnset = now;
      const pre = this.salience();
      const t = now - (this.fast.fftSize / ctx.sampleRate) * 0.5 - this.latency;
      // 소리가 충분히 퍼진 뒤 음높이 측정
      setTimeout(() => {
        if (!this.running) return;
        const post = this.salience();
        const ev = makeOnset(t, pre, post, this.sensitivity);
        this.listeners.forEach((fn) => fn(ev));
      }, 90);
    }
  }

  // 각 MIDI 음에 대해 배음 가중 합 (선형 크기)
  salience() {
    this.slow.getFloatFrequencyData(this.slowBuf);
    const binHz = this.ctx.sampleRate / this.slow.fftSize;
    const n = this.slowBuf.length;
    const s = new Float32Array(128);
    for (let m = MIDI_LO; m <= MIDI_HI; m++) {
      const f0 = midiToFreq(m);
      let sum = 0;
      for (let h = 0; h < HARM_W.length; h++) {
        const f = f0 * (h + 1);
        const c = f / binHz;
        if (c >= n - 2) break;
        const w = Math.max(1, Math.round((f * 0.015) / binHz));
        let peak = -Infinity;
        for (let b = Math.max(1, Math.round(c) - w); b <= Math.round(c) + w; b++) peak = Math.max(peak, this.slowBuf[b]);
        sum += HARM_W[h] * Math.pow(10, peak / 20);
      }
      s[m] = sum;
    }
    return s;
  }
}

// 온셋 이벤트: 새로 생긴 음(novelty)을 정규화해서 "어떤 음이 쳐졌는지" 판단할 수 있게 한다
function makeOnset(time, pre, post, sens) {
  const nov = new Float32Array(128);
  let max = 0;
  for (let m = MIDI_LO; m <= MIDI_HI; m++) {
    const d = post[m] - pre[m] * 0.85;
    nov[m] = d > 0 ? d : 0;
    if (nov[m] > max) max = nov[m];
  }
  let postMax = 0;
  for (let m = MIDI_LO; m <= MIDI_HI; m++) if (post[m] > postMax) postMax = post[m];
  const isPeak = (a, m) => a[m] >= a[m - 1] * 0.9 && a[m] >= a[m + 1] * 0.9;
  // 같은 음 연타: 직전 음이 아직 울려서 "새 음"으로는 작게 보이지만, 다시 쳤으니 줄지 않고 커진다
  const restruck = (m) => post[m] >= pre[m] * 1.05 && post[m] >= postMax * 0.35 && isPeak(post, m);
  const thr = 0.42 - sens * 0.025; // 감도 높을수록 약한 음도 인정
  return {
    time, nov, max, used: new Set(),
    // m 음이 이번에 쳐졌는가 (반음 옆 음보다 강해야 함)
    has(m) {
      if (max > 0 && nov[m] >= max * thr && isPeak(nov, m)) return true;
      return restruck(m);
    },
    // 가장 강한 음들 (오답 표시용)
    top(k = 3) {
      const arr = [];
      for (let m = MIDI_LO; m <= MIDI_HI; m++) if (this.has(m)) arr.push([m, nov[m]]);
      return arr.sort((a, b) => b[1] - a[1]).slice(0, k).map((x) => x[0]);
    },
  };
}

// ---------- 미리 듣기용 간단한 피아노 소리 ----------
export function playTone(ctx, midi, when, dur, vel = 0.25, dest = ctx.destination) {
  const f = midiToFreq(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(vel, when + 0.008);
  g.gain.exponentialRampToValueAtTime(vel * 0.35, when + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0008, when + Math.max(0.3, dur) + 0.25);
  g.connect(dest);
  const parts = [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]];
  const end = when + Math.max(0.3, dur) + 0.3;
  for (const [mul, type, amp] of parts) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type; o.frequency.value = f * mul; og.gain.value = amp;
    o.connect(og); og.connect(g);
    o.start(when); o.stop(end);
  }
}

// 메트로놈 클릭: 음높이가 없는 노이즈 (마이크 음 판정에 덜 섞이게)
let noiseBuf = null;
export function click(ctx, when, accent = false, dest = ctx.destination) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = accent ? 3000 : 5000;
  const g = ctx.createGain(); g.gain.value = accent ? 0.9 : 0.5;
  s.connect(hp); hp.connect(g); g.connect(dest);
  s.start(when);
}
