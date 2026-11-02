#!/usr/bin/env node
// 악보 도구: MusicXML 검증 + 앱 곡 목록(app/scores/index.json) 갱신
//   node tools/score-tool.mjs validate <file.musicxml>...
//   node tools/score-tool.mjs index
// 의존성 없음 (Node 18+)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCORES = join(ROOT, 'app', 'scores');

// ---------- minimal XML parser ----------
function parseXml(src) {
  const root = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m, line = 1, last = 0;
  const lineAt = (i) => { while (last < i) { if (src.charCodeAt(last) === 10) line++; last++; } return line; };
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1];
    if (m[2]) {
      if (top.name !== m[2]) throw new Error(`XML 오류 (줄 ${lineAt(m.index)}): </${m[2]}> 가 <${top.name}> 를 닫으려 함`);
      stack.pop();
    } else if (m[3]) {
      const attrs = {};
      (m[4] || '').replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, a, b) => { attrs[k] = a ?? b; });
      const el = { name: m[3], attrs, children: [], text: '', line: lineAt(m.index) };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] != null) {
      if (m[6].trim()) top.text += m[6].trim();
    } else if (m[1] != null) top.text += m[1];
  }
  if (stack.length !== 1) throw new Error(`XML 오류: <${stack[stack.length - 1].name}> 가 닫히지 않음`);
  return root;
}
const kid = (el, n) => el.children.find(c => c.name === n);
const kids = (el, n) => el.children.filter(c => c.name === n);
const txt = (el, n) => { const k = kid(el, n); return k ? k.text : undefined; };

// ---------- validate ----------
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const midiName = (m) => NAMES[m % 12] + (Math.floor(m / 12) - 1);

export function validate(xml) {
  const errors = [], warnings = [];
  const doc = parseXml(xml);
  const sp = kid(doc, 'score-partwise');
  if (!sp) return { errors: ['score-partwise 루트가 없습니다 (timewise 는 미지원)'], warnings, info: {} };
  const title = txt(kid(sp, 'work') || { children: [] }, 'work-title') || txt(sp, 'movement-title') || '(제목 없음)';
  const pl = kid(sp, 'part-list');
  const ids = pl ? kids(pl, 'score-part').map(p => p.attrs.id) : [];
  const parts = kids(sp, 'part');
  if (!parts.length) errors.push('part 가 없습니다');
  for (const p of parts) if (!ids.includes(p.attrs.id)) errors.push(`part id="${p.attrs.id}" 가 part-list 에 없습니다`);

  let noteCount = 0, minMidi = 999, maxMidi = -1, tempo = null, measuresN = 0;
  for (const part of parts) {
    let divisions = null, beats = 4, beatType = 4;
    const ms = kids(part, 'measure');
    measuresN = Math.max(measuresN, ms.length);
    ms.forEach((meas, mi) => {
      const num = meas.attrs.number;
      const at = kid(meas, 'attributes');
      if (at) {
        if (txt(at, 'divisions')) divisions = +txt(at, 'divisions');
        const t = kid(at, 'time');
        if (t) { beats = +txt(t, 'beats'); beatType = +txt(t, 'beat-type'); }
      }
      if (!divisions) { errors.push(`마디 ${num}: divisions 가 정의되지 않음`); return; }
      const expected = divisions * beats * 4 / beatType;
      let pos = 0, maxPos = 0, lastStart = 0;
      const voiceEnd = {};
      for (const el of meas.children) {
        if (el.name === 'direction') {
          const s = kid(el, 'sound'); if (s && s.attrs.tempo && tempo == null) tempo = +s.attrs.tempo;
        } else if (el.name === 'sound' && el.attrs.tempo && tempo == null) tempo = +el.attrs.tempo;
        else if (el.name === 'backup') { pos -= +txt(el, 'duration'); if (pos < 0) errors.push(`마디 ${num}: backup 이 마디 시작보다 앞으로 감`); }
        else if (el.name === 'forward') { pos += +txt(el, 'duration'); maxPos = Math.max(maxPos, pos); }
        else if (el.name === 'note') {
          const isChord = !!kid(el, 'chord'), isGrace = !!kid(el, 'grace');
          const dur = isGrace ? 0 : +(txt(el, 'duration') ?? NaN);
          if (!isGrace && !(dur > 0)) errors.push(`마디 ${num} (줄 ${el.line}): duration 이 없거나 0`);
          if (!kid(el, 'type') && !kid(el, 'rest')) warnings.push(`마디 ${num} (줄 ${el.line}): <type> 없음 (표시가 이상할 수 있음)`);
          const pitch = kid(el, 'pitch');
          if (pitch) {
            const step = txt(pitch, 'step'), oct = +txt(pitch, 'octave'), alt = +(txt(pitch, 'alter') || 0);
            if (!(step in STEP) || isNaN(oct)) errors.push(`마디 ${num} (줄 ${el.line}): 잘못된 pitch`);
            else {
              const midi = 12 * (oct + 1) + STEP[step] + alt;
              const tie = kids(el, 'tie').map(t => t.attrs.type);
              if (!tie.includes('stop') && !isGrace) noteCount++;
              minMidi = Math.min(minMidi, midi); maxMidi = Math.max(maxMidi, midi);
              if (midi < 21 || midi > 108) errors.push(`마디 ${num}: 피아노 음역 밖의 음 ${midiName(midi)}`);
            }
          }
          if (isChord) { pos = lastStart + dur; }
          else { lastStart = pos; pos += dur; }
          maxPos = Math.max(maxPos, pos);
          const v = (txt(el, 'staff') || '1') + '/' + (txt(el, 'voice') || '1');
          voiceEnd[v] = Math.max(voiceEnd[v] || 0, pos);
        }
      }
      const implicit = meas.attrs.implicit === 'yes';
      const isPickup = mi === 0 && maxPos < expected;
      if (maxPos > expected) errors.push(`마디 ${num}: 박자 초과 (${maxPos / divisions}박 > ${expected / divisions}박)`);
      else if (!implicit && !isPickup && mi !== ms.length - 1) {
        for (const [v, end] of Object.entries(voiceEnd))
          if (end < expected) errors.push(`마디 ${num}: 성부 ${v}(staff/voice) 박자 부족 (${end / divisions}박 < ${expected / divisions}박)`);
      } else if (isPickup && !implicit) warnings.push(`마디 ${num}: 못갖춘마디로 보임 → implicit="yes" 권장`);
    });
  }
  if (tempo == null) warnings.push('템포(<sound tempo>) 없음 → 앱에서 기본 100 사용');
  return {
    errors, warnings,
    info: { title, parts: parts.length, measures: measuresN, notes: noteCount, tempo, range: noteCount ? `${midiName(minMidi)}~${midiName(maxMidi)}` : '-' },
  };
}

// ---------- index ----------
const LEVELS = { easy: '쉬움', normal: '보통', original: '원곡', hard: '어려움' };
function buildIndex() {
  const files = readdirSync(SCORES).filter(f => /\.(musicxml|xml)$/i.test(f)).sort();
  const songs = [];
  for (const f of files) {
    const xml = readFileSync(join(SCORES, f), 'utf8');
    const r = validate(xml);
    if (r.errors.length) { console.log(`✗ ${f}: 오류 ${r.errors.length}개 → 목록에서 제외`); continue; }
    const lv = (basename(f).match(/_(easy|normal|original|hard)\./i) || [])[1];
    songs.push({ id: f.replace(/\.(musicxml|xml)$/i, ''), file: f, title: r.info.title, level: LEVELS[lv?.toLowerCase()] || '', tempo: r.info.tempo || 100, measures: r.info.measures, notes: r.info.notes });
    console.log(`✓ ${f}  (${r.info.title})`);
  }
  writeFileSync(join(SCORES, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), songs }, null, 2) + '\n');
  console.log(`index.json 갱신: ${songs.length}곡`);
}

// ---------- MIDI 내보내기 (PC에서 더블클릭으로 들어보기) ----------
export function toMidi(xml, tempoPct = 100) {
  const sp = kid(parseXml(xml), 'score-partwise');
  const TPQ = 480;
  const notes = []; // {start, dur, midi} in ticks
  let tempo = null;
  for (const part of kids(sp, 'part')) {
    let divisions = 1, measureStart = 0;
    const open = new Map(); // midi -> note (tie 이어붙이기)
    for (const meas of kids(part, 'measure')) {
      const at = kid(meas, 'attributes');
      if (at && txt(at, 'divisions')) divisions = +txt(at, 'divisions');
      let pos = 0, lastStart = 0, maxPos = 0;
      for (const el of meas.children) {
        if (el.name === 'direction') { const s = kid(el, 'sound'); if (s?.attrs.tempo && tempo == null) tempo = +s.attrs.tempo; }
        else if (el.name === 'backup') pos -= +txt(el, 'duration');
        else if (el.name === 'forward') { pos += +txt(el, 'duration'); maxPos = Math.max(maxPos, pos); }
        else if (el.name === 'note') {
          if (kid(el, 'grace')) continue;
          const dur = +txt(el, 'duration');
          const start = kid(el, 'chord') ? lastStart : pos;
          if (!kid(el, 'chord')) { lastStart = pos; pos += dur; }
          maxPos = Math.max(maxPos, pos);
          const p = kid(el, 'pitch');
          if (!p) continue;
          const midi = 12 * (+txt(p, 'octave') + 1) + STEP[txt(p, 'step')] + +(txt(p, 'alter') || 0);
          const tk = (x) => Math.round(((measureStart + x) / divisions) * TPQ);
          const ties = kids(el, 'tie').map((t) => t.attrs.type);
          if (ties.includes('stop') && open.has(midi)) open.get(midi).end = tk(start + dur);
          else { const n = { start: tk(start), end: tk(start + dur), midi }; notes.push(n); open.set(midi, n); }
          if (!ties.includes('start')) open.delete(midi);
        }
      }
      measureStart += maxPos;
    }
  }
  const bpm = (tempo || 100) * tempoPct / 100;
  const ev = [];
  for (const n of notes) { ev.push([n.start, 1, n.midi]); ev.push([Math.max(n.start + 1, n.end - 10), 0, n.midi]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const bytes = [];
  const vlq = (v) => { const out = [v & 0x7f]; while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80); bytes.push(...out); };
  const us = Math.round(60000000 / bpm);
  vlq(0); bytes.push(0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  vlq(0); bytes.push(0xc0, 0); // Acoustic Grand Piano
  let t = 0;
  for (const [tick, on, m] of ev) { vlq(tick - t); t = tick; bytes.push(on ? 0x90 : 0x80, m, on ? 80 : 0); }
  vlq(0); bytes.push(0xff, 0x2f, 0);
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, TPQ >> 8, TPQ & 255];
  const len = bytes.length;
  return Buffer.from([...head, 0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255, ...bytes]);
}

// ---------- CLI ----------
const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'validate') {
  let bad = 0;
  for (const f of args) {
    try {
      const r = validate(readFileSync(f, 'utf8'));
      console.log(`\n== ${f}\n제목: ${r.info.title} | 마디 ${r.info.measures} | 음표 ${r.info.notes} | 음역 ${r.info.range} | 템포 ${r.info.tempo ?? '-'}`);
      r.errors.forEach(e => console.log('  ✗ ' + e));
      r.warnings.forEach(w => console.log('  ! ' + w));
      if (!r.errors.length) console.log('  ✓ 검증 통과');
      bad += r.errors.length ? 1 : 0;
    } catch (e) { console.log(`\n== ${f}\n  ✗ ${e.message}`); bad++; }
  }
  process.exit(bad ? 1 : 0);
} else if (cmd === 'index') buildIndex();
else if (cmd === 'midi') {
  // node tools/score-tool.mjs midi <file.musicxml>... [--tempo 80]  → scores/listen/<이름>.mid
  const ti = args.indexOf('--tempo');
  const pct = ti >= 0 ? +args.splice(ti, 2)[1] : 100;
  const outDir = join(ROOT, 'scores', 'listen');
  mkdirSync(outDir, { recursive: true });
  for (const f of args) {
    const out = join(outDir, basename(f).replace(/\.(musicxml|xml)$/i, '') + (pct !== 100 ? `_${pct}pct` : '') + '.mid');
    writeFileSync(out, toMidi(readFileSync(f, 'utf8'), pct));
    console.log('🎧 ' + out);
  }
}
else console.log('사용법:\n  node tools/score-tool.mjs validate <file>...\n  node tools/score-tool.mjs index\n  node tools/score-tool.mjs midi <file>... [--tempo 80]');
