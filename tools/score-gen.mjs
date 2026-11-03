// 간단한 음표 텍스트 → 앱용 MusicXML 생성기
//   node tools/score-gen.mjs scores/src/*.mjs      → app/scores/<id>.musicxml
//
// 곡 파일(scores/src/*.mjs) 형식:
//   export default { id, title, composer, key: 0(샵+ / 플랫-), time: '3/4', tempo: 90, pickup: ['RH', 'LH'],
//                    measures: [['RH 토큰들', 'LH 토큰들'], '=3'(3번째 마디 복사), ...] }
// 토큰: 음높이:길이   예) E5:8  C4+E4+G4:2.  r:4(쉼표)  F#4:16  Bb3:4~(붙임줄 시작)
//   길이 1 2 4 8 16, 점은 '.', 길이를 생략하면 같은 손의 앞 길이를 그대로 쓴다.
//   음높이에 #/b 를 붙이면 그 음 자체(조표와 무관하게 절대 음높이)로 해석한다. 조표는 key 로 지정.
import { writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const DIV = 4; // 16분음표 = 1
const TYPES = { 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th' };
const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = 'FCGDAEB', FLAT_ORDER = 'BEADGCF';

function keyAlter(fifths, step) {
  if (fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(step)) return 1;
  if (fifths < 0 && FLAT_ORDER.slice(0, -fifths).includes(step)) return -1;
  return 0;
}

function parseHand(text, state) {
  const out = [];
  for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^([^:~]+)(?::(\d+)(\.?))?(~?)$/);
    if (!m) throw new Error('잘못된 토큰: ' + tok);
    if (m[2]) state.dur = { base: +m[2], dot: !!m[3] };
    const { base, dot } = state.dur;
    const len = (16 / base) * (dot ? 1.5 : 1);
    if (!TYPES[base] || len % 1) throw new Error('지원하지 않는 길이: ' + tok);
    const pitches = m[1] === 'r' ? [] : m[1].split('+').map((p) => {
      const pm = p.match(/^([A-G])(#|b|n)?(\d)$/);
      if (!pm) throw new Error('잘못된 음높이: ' + p);
      return { step: pm[1], acc: pm[2] || '', oct: +pm[3] };
    });
    out.push({ pitches, len, base, dot, tie: !!m[4] });
  }
  return out;
}

function noteXml(n, p, i, voice, staff, fifths, tieStop, beam) {
  const alter = p ? (p.acc === '#' ? 1 : p.acc === 'b' ? -1 : p.acc === 'n' ? 0 : keyAlter(fifths, p.step)) : 0;
  let x = '<note>';
  if (i > 0) x += '<chord/>';
  x += p ? `<pitch><step>${p.step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${p.oct}</octave></pitch>` : '<rest/>';
  x += `<duration>${n.len}</duration>`;
  if (tieStop) x += '<tie type="stop"/>';
  if (n.tie && p) x += '<tie type="start"/>';
  x += `<voice>${voice}</voice><type>${TYPES[n.base]}</type>${n.dot ? '<dot/>' : ''}<staff>${staff}</staff>`;
  if (i === 0 && beam) x += beam;
  const tied = [tieStop ? '<tied type="stop"/>' : '', n.tie && p ? '<tied type="start"/>' : ''].join('');
  if (tied) x += `<notations>${tied}</notations>`;
  return x + '</note>';
}

// 박 단위로 8분·16분음표를 묶어 beam 을 만든다
function beams(notes, beatLen) {
  const res = notes.map(() => '');
  let pos = 0;
  const groups = [];
  let cur = [];
  const flush = () => { if (cur.length > 1) groups.push(cur); cur = []; };
  notes.forEach((n, i) => {
    const beat = Math.floor(pos / beatLen);
    const beamable = n.pitches.length && n.base >= 8;
    if (!beamable) flush();
    else {
      if (cur.length && cur.beat !== beat) flush();
      if (!cur.length) cur.beat = beat;
      cur.push(i);
    }
    pos += n.len;
  });
  flush();
  for (const g of groups) {
    g.forEach((idx, k) => {
      const lv1 = k === 0 ? 'begin' : k === g.length - 1 ? 'end' : 'continue';
      let b = `<beam number="1">${lv1}</beam>`;
      if (notes[idx].base === 16) {
        const prev = k > 0 && notes[g[k - 1]].base === 16, next = k < g.length - 1 && notes[g[k + 1]].base === 16;
        const lv2 = prev && next ? 'continue' : prev ? 'end' : next ? 'begin' : k === 0 ? 'forward hook' : 'backward hook';
        b += `<beam number="2">${lv2}</beam>`;
      }
      res[idx] = b;
    });
  }
  return res;
}

export function build(song) {
  const [beats, beatType] = song.time.split('/').map(Number);
  const measLen = (16 / beatType) * beats;
  const compound = beatType === 8 && beats % 3 === 0 && beats > 3;
  const beatLen = beatType === 8 ? (compound ? 6 : measLen) : 16 / beatType;
  const fifths = song.key || 0;
  const list = [];
  if (song.pickup) list.push({ m: song.pickup, num: 0 });
  song.measures.forEach((m, i) => {
    let src = m;
    while (typeof src === 'string') src = song.measures[+src.slice(1) - 1];
    list.push({ m: src, num: i + 1 });
  });
  const st = { rh: { dur: { base: 4, dot: false } }, lh: { dur: { base: 4, dot: false } } };
  const tiePend = { rh: new Set(), lh: new Set() };
  let body = '';
  list.forEach(({ m, num }, li) => {
    let x = `<measure number="${num}"${num === 0 ? ' implicit="yes"' : ''}>`;
    if (li === 0) {
      x += `<attributes><divisions>${DIV}</divisions><key><fifths>${fifths}</fifths></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><staves>2</staves>` +
        '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>' +
        `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${song.tempo}</per-minute></metronome></direction-type><sound tempo="${song.tempo}"/></direction>`;
    }
    let len0 = 0;
    ['rh', 'lh'].forEach((h, hi) => {
      if (!m[hi]) throw new Error(`${song.id} ${num}마디 ${h} 비어 있음`);
      const notes = parseHand(m[hi], st[h]);
      const total = notes.reduce((a, n) => a + n.len, 0);
      const want = num === 0 ? total : measLen;
      if (total !== want) throw new Error(`${song.id} ${num}마디 ${h === 'rh' ? '오른손' : '왼손'} 길이 ${total}/${want} (16분 단위)`);
      if (hi === 0) len0 = total;
      else x += `<backup><duration>${len0}</duration></backup>`;
      const bm = beams(notes, beatLen);
      notes.forEach((n, ni) => {
        const key = (p) => p.step + p.acc + p.oct;
        if (!n.pitches.length) { x += noteXml(n, null, 0, hi ? 5 : 1, hi + 1, fifths, false, ''); tiePend[h].clear(); return; }
        const next = new Set();
        n.pitches.forEach((p, i) => {
          x += noteXml(n, p, i, hi ? 5 : 1, hi + 1, fifths, tiePend[h].has(key(p)), bm[ni]);
          if (n.tie) next.add(key(p));
        });
        tiePend[h] = next;
      });
    });
    body += x + '</measure>\n';
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${song.title}</work-title></work>
  <identification><creator type="composer">${song.composer || ''}</creator></identification>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
${body}  </part>
</score-partwise>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const OUT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'app', 'scores');
  for (const f of process.argv.slice(2)) {
    const song = (await import(pathToFileURL(f).href)).default;
    const file = join(OUT, song.id + '.musicxml');
    writeFileSync(file, build(song));
    console.log('→', basename(file), `(${song.title})`);
  }
}
