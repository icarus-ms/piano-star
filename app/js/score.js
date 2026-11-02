// OSMD 래퍼: 악보 렌더링, 커서 이동, 연주 타임라인(이벤트) 생성, 음표 색칠

export const COLORS = { blue: '#1f6bff', yellow: '#e6a800', red: '#ff2a3d', current: '#ff2fa0' };

export class Score {
  constructor(container) {
    this.container = container;
    this.osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
      autoResize: false,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
      drawCredits: false,
      followCursor: true,
      cursorsOptions: [{ type: 0, color: '#ff7ac6', alpha: 0.35, follow: true }],
    });
    this.colors = []; // step index -> color (재렌더링 시 복원)
  }

  async load(xmlText) {
    await this.osmd.load(xmlText);
    this.title = this.osmd.Sheet.TitleString || '';
    this.bpm = this.osmd.Sheet.DefaultStartTempoInBpm || 100;
    const m0 = this.osmd.Sheet.SourceMeasures[0];
    this.beatsPerMeasure = m0 ? Math.round(m0.ActiveTimeSignature.RealValue * 4) || 4 : 4;
    this.render();
  }

  render() {
    const w = this.container.clientWidth || 1000;
    this.osmd.zoom = w < 900 ? 0.85 : w > 1400 ? 1.15 : 1.0;
    this.osmd.render();
    this.buildSteps();
    this.colors.forEach((c, i) => c && this.colorStep(i, c, true));
    this.osmd.cursor.show();
    this.osmd.cursor.reset();
    this.cursorStep = 0;
  }

  // 커서를 처음부터 끝까지 움직이며 "동시에 시작하는 음들"을 한 스텝으로 묶는다
  buildSteps() {
    const cur = this.osmd.cursor;
    cur.show();
    cur.reset();
    const steps = [];
    while (!cur.Iterator.EndReached) {
      const it = cur.Iterator;
      const ts = it.currentTimeStamp.RealValue; // 온음표 단위
      const gnotes = cur.GNotesUnderCursor();
      const notes = [];
      const seen = new Set();
      const playback = [];
      for (const gn of gnotes) {
        const n = gn.sourceNote;
        if (!n || n.isRest() || !n.Pitch) continue;
        if (n.ParentVoiceEntry && n.ParentVoiceEntry.IsGrace) continue;
        const midi = n.halfTone + 12;
        const tieCont = n.NoteTie && n.NoteTie.StartNote !== n;
        const len = n.NoteTie && !tieCont ? tieLength(n) : n.Length.RealValue;
        if (!tieCont) playback.push({ midi, len });
        if (tieCont || seen.has(midi)) { notes.push({ midi, gn, judge: false }); continue; }
        seen.add(midi);
        notes.push({ midi, gn, judge: true, staff: n.ParentStaff ? n.ParentStaff.idInMusicSheet : 0 });
      }
      steps.push({
        ts,
        measure: it.CurrentMeasureIndex,
        notes,
        expect: [...seen],
        playback,
        judgeable: seen.size > 0,
      });
      cur.next();
    }
    this.steps = steps;
    this.totalWhole = steps.length ? Math.max(...steps.map((s) => s.ts + Math.max(0, ...s.playback.map((p) => p.len)))) : 0;
    this.measureCount = this.osmd.Sheet.SourceMeasures.length;
  }

  // 스텝 i 의 시작 시간(초): 템포 bpm(4분음표 기준)
  stepTime(i, bpm) { return (this.steps[i].ts * 4 * 60) / bpm; }

  moveCursorTo(i) {
    const cur = this.osmd.cursor;
    if (i < this.cursorStep) { cur.reset(); this.cursorStep = 0; }
    while (this.cursorStep < i && !cur.Iterator.EndReached) { cur.next(); this.cursorStep++; }
    this.highlightCurrent(i);
  }

  highlightCurrent(i) {
    if (this._hl != null && this._hl !== i) {
      const prev = this.colors[this._hl];
      this.colorStep(this._hl, prev || null, true);
    }
    this._hl = i;
    if (this.steps[i] && !this.colors[i]) this.colorStep(i, COLORS.current, true);
  }

  resetCursor() {
    this.osmd.cursor.reset();
    this.cursorStep = 0;
    this._hl = null;
  }

  clearColors() {
    this.colors.forEach((c, i) => c && this.colorStep(i, null, true));
    this.colors = [];
    if (this._hl != null) this.colorStep(this._hl, null, true);
    this._hl = null;
  }

  // color: null → 원래 색(검정)
  colorStep(i, color, temp = false, onlyMidis = null) {
    const st = this.steps[i];
    if (!st) return;
    if (!temp) this.colors[i] = color;
    for (const n of st.notes) {
      if (onlyMidis && !onlyMidis.includes(n.midi)) continue;
      const g = n.gn.getSVGGElement && n.gn.getSVGGElement();
      if (!g) continue;
      g.querySelectorAll('path, ellipse').forEach((p) => {
        if (color) { p.style.fill = color; p.style.stroke = color; }
        else { p.style.fill = ''; p.style.stroke = ''; }
      });
    }
  }
}

function tieLength(n) {
  let len = 0;
  for (const tn of n.NoteTie.Notes) len += tn.Length.RealValue;
  return len;
}
