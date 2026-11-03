import { Mic, getCtx, playTone, click, midiNameKo } from './audio.js';
import { Score, COLORS } from './score.js';
import { loadProfile, saveProfile, resetProfile, levelInfo, currentStreak, recordResult, grade, cheer, BADGES } from './game.js';

const $ = (id) => document.getElementById(id);
const USER_KEY = 'pianoStar.userScores.v1';
const HIDDEN_KEY = 'pianoStar.hiddenSongs.v1';   // 삭제한 기본 곡 id (파일은 서버에 있으니 목록에서만 숨김)
const RENAME_KEY = 'pianoStar.renamedSongs.v1';  // 기본 곡 id → 바꾼 이름

const profile = loadProfile();
const mic = new Mic();
let score = null;
let song = null;
let mode = 'rhythm';
let session = null;   // 연주 중 상태
let preview = null;   // 미리 듣기 상태
let lastSongs = [];
let listMode = '';     // '' | 'del' | 'rename'
let delTarget = null;
let renameTarget = null;

// ================= 화면 전환 =================
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// ================= 홈 =================
function renderProfile() {
  const li = levelInfo(profile.xp);
  $('lvNum').textContent = li.lv;
  $('lvTitle').textContent = li.title;
  $('xpText').textContent = `${li.cur} / ${li.need} XP`;
  $('xpFill').style.width = `${(li.cur / li.need) * 100}%`;
  const st = currentStreak(profile);
  $('streakNum').textContent = st;
  const playedToday = profile.lastDay === localDay();
  $('dailyMsg').textContent = playedToday
    ? `오늘도 연습 완료! 🔥 ${st}일 연속이에요. 한 곡 더 하면 XP가 쌓여요.`
    : st > 0 ? `오늘 한 곡 연주하면 🔥 ${st + 1}일 연속! 연속 기록을 지켜요.` : '오늘의 첫 연주를 시작해 볼까요? 🎹';
}
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function userScores() { try { return JSON.parse(localStorage.getItem(USER_KEY)) || []; } catch { return []; } }
function hiddenSongs() { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY)) || []; } catch { return []; } }
function renamedSongs() { try { return JSON.parse(localStorage.getItem(RENAME_KEY)) || {}; } catch { return {}; } }

async function loadSongs() {
  let builtin = [];
  try {
    const r = await fetch('scores/index.json', { cache: 'no-cache' });
    builtin = (await r.json()).songs.map((s) => ({ ...s, src: 'builtin' }));
  } catch { toast('곡 목록을 불러오지 못했어요'); }
  const hidden = hiddenSongs();
  const renamed = renamedSongs();
  builtin = builtin.filter((s) => !hidden.includes(s.id))
    .map((s) => (renamed[s.id] ? { ...s, origTitle: s.title, title: renamed[s.id] } : s));
  $('btnRestore').hidden = !(listMode === 'del' && hidden.length);
  const mine = userScores().map((s) => ({ id: s.id, title: s.title, level: '내 파일', src: 'user' }));
  lastSongs = [...builtin, ...mine];
  const list = $('songList');
  list.innerHTML = '';
  for (const s of lastSongs) {
    const b = profile.best[s.id];
    const card = document.createElement('div');
    card.className = 'song-card';
    card.innerHTML = `
      <h3>${esc(s.title)}</h3>
      <div class="song-meta">${s.level ? `<span class="lv-tag lv-${esc(s.level)}">${esc(s.level)}</span>` : ''}
        ${s.measures ? `<span>${s.measures}마디</span>` : ''}${s.tempo ? `<span>♩=${s.tempo}</span>` : ''}</div>
      <div class="best">${b ? `<span class="g">${b.grade}</span> 최고 ${Math.round(b.score)}점 ${sparkline(b.history)}` : '<span style="color:var(--mute)">아직 기록 없음</span>'}</div>`;
    card.onclick = () => (listMode === 'del' ? askDelete(s) : listMode === 'rename' ? askRename(s) : openSong(s));
    list.appendChild(card);
  }
}

// ================= 목록 편집 모드 (삭제 / 이름 바꾸기) =================
function setListMode(m) {
  listMode = m;
  $('home').classList.toggle('del-mode', m === 'del');
  $('home').classList.toggle('rename-mode', m === 'rename');
  $('btnDelMode').textContent = m === 'del' ? '✔ 완료' : '🗑 삭제하기';
  $('btnRenameMode').textContent = m === 'rename' ? '✔ 완료' : '✏️ 이름 바꾸기';
  $('btnDelMode').hidden = m === 'rename';
  $('btnRenameMode').hidden = m === 'del';
  $('btnRestore').hidden = !(m === 'del' && hiddenSongs().length);
  if (m) toast(m === 'del' ? '지울 곡을 누르세요' : '이름을 바꿀 곡을 누르세요');
}

// ================= 곡 이름 바꾸기 =================
function askRename(s) {
  renameTarget = s;
  $('renameInput').value = s.title;
  $('btnRenameReset').hidden = !s.origTitle;
  $('renameModal').classList.add('show');
  $('renameInput').focus();
  $('renameInput').select();
}
async function saveRename(title) {
  const s = renameTarget;
  $('renameModal').classList.remove('show');
  if (!s) return;
  if (s.src === 'user') {
    const list = userScores();
    const u = list.find((x) => x.id === s.id);
    if (u) u.title = title;
    localStorage.setItem(USER_KEY, JSON.stringify(list));
  } else {
    const map = renamedSongs();
    if (title === (s.origTitle || s.title) || !title) delete map[s.id]; else map[s.id] = title;
    localStorage.setItem(RENAME_KEY, JSON.stringify(map));
  }
  await loadSongs();
  toast(`"${title}"(으)로 바꿨어요`);
}
$('btnRenameMode').onclick = () => setListMode(listMode === 'rename' ? '' : 'rename');
$('btnRenameCancel').onclick = () => $('renameModal').classList.remove('show');
$('btnRenameOk').onclick = () => {
  const t = $('renameInput').value.trim();
  if (!t) { toast('이름을 입력해 주세요'); return; }
  saveRename(t);
};
$('btnRenameReset').onclick = () => saveRename(renameTarget.origTitle);
$('renameInput').onkeydown = (e) => { if (e.key === 'Enter') $('btnRenameOk').click(); };

// ================= 곡 삭제 =================
function askDelete(s) {
  delTarget = s;
  $('delMsg').innerHTML = `<b>"${esc(s.title)}"</b> 곡을 목록에서 지울까요?<br><span class="hint">` +
    (s.src === 'user' ? '내가 추가한 악보라 되돌릴 수 없어요.' : "기본 곡은 '↩ 기본 곡 되돌리기'로 다시 꺼낼 수 있어요.") + '</span>';
  $('delModal').classList.add('show');
}
$('btnDelMode').onclick = () => setListMode(listMode === 'del' ? '' : 'del');
$('btnDelCancel').onclick = () => $('delModal').classList.remove('show');
$('btnDelOk').onclick = async () => {
  const s = delTarget;
  $('delModal').classList.remove('show');
  if (!s) return;
  if (s.src === 'user') localStorage.setItem(USER_KEY, JSON.stringify(userScores().filter((u) => u.id !== s.id)));
  else localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set([...hiddenSongs(), s.id])]));
  await loadSongs();
  toast(`"${s.title}" 삭제됨`);
};
$('btnRestore').onclick = async () => {
  localStorage.removeItem(HIDDEN_KEY);
  await loadSongs();
  toast('기본 곡을 모두 되돌렸어요');
};
function sparkline(h) {
  if (!h || h.length < 2) return '';
  const pts = h.slice(-10), w = 60, ht = 18;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * w},${ht - (v / 100) * ht}`).join(' ');
  return `<svg width="${w}" height="${ht}" style="margin-left:6px"><polyline points="${d}" fill="none" stroke="#3ddc97" stroke-width="2"/></svg>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// 내 곡 추가 (파일 열기 / 붙여넣기 공통). 같은 제목이면 새 버전으로 교체 (기록 유지)
async function addUserScore(xml, fallbackTitle) {
  xml = xml.trim();
  if (!xml.includes('<score-partwise')) { toast('MusicXML 이 아니에요 (.musicxml 파일 또는 복사한 MusicXML 내용)', 3500); return false; }
  const title = (xml.match(/<work-title>([^<]*)</) || xml.match(/<movement-title>([^<]*)</) || [])[1] || fallbackTitle || '내 악보';
  const list = userScores();
  const same = list.findIndex((u) => u.title === title);
  const entry = { id: same >= 0 ? list[same].id : 'user_' + Date.now(), title, xml };
  if (same >= 0) list[same] = entry; else list.push(entry);
  try { localStorage.setItem(USER_KEY, JSON.stringify(list)); } catch { toast('저장 공간이 부족해요. 안 쓰는 곡을 지워 주세요'); return false; }
  await loadSongs();
  toast(same >= 0 ? `"${title}" 새 버전으로 바꿨어요` : `"${title}" 추가됨`);
  return true;
}
$('fileInput').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  await addUserScore(await f.text(), f.name.replace(/\.\w+$/, ''));
  e.target.value = '';
};
$('btnPaste').onclick = async () => {
  $('pasteText').value = '';
  try { const t = await navigator.clipboard.readText(); if (t.includes('<score-partwise')) $('pasteText').value = t; } catch {}
  $('pasteModal').classList.add('show');
};
$('btnPasteCancel').onclick = () => $('pasteModal').classList.remove('show');
$('btnPasteOk').onclick = async () => { if (await addUserScore($('pasteText').value)) $('pasteModal').classList.remove('show'); };

// ================= 곡 열기 =================
async function openSong(s) {
  song = s;
  show('play');
  $('playTitle').textContent = s.title;
  $('osmd').innerHTML = '';
  const xml = s.src === 'user' ? userScores().find((u) => u.id === s.id)?.xml : await (await fetch('scores/' + s.file, { cache: 'no-cache' })).text();
  score = new Score($('osmd'));
  try { await score.load(xml); } catch (e) { console.error(e); toast('악보를 읽지 못했어요: ' + e.message, 4000); return; }
  resetHud();
}

$('btnBack').onclick = () => { stopAll(); show('home'); renderProfile(); loadSongs(); };
$('modeSeg').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b || session) return;
  mode = b.dataset.mode;
  [...$('modeSeg').children].forEach((x) => x.classList.toggle('on', x === b));
  $('metroOn').parentElement.style.visibility = mode === 'rhythm' ? 'visible' : 'hidden';
  $('tempoPct').parentElement.style.visibility = mode === 'rhythm' ? 'visible' : 'hidden';
};
$('tempoPct').oninput = () => { $('tempoText').textContent = $('tempoPct').value + '%'; };

let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (score && !session && !preview && $('play').classList.contains('active')) score.render(); }, 300);
});

// ================= HUD =================
function resetHud() {
  $('hudScore').textContent = '0';
  $('cntBlue').textContent = $('cntYellow').textContent = $('cntRed').textContent = '0';
  $('hudCombo').textContent = '';
  $('waitBar').classList.remove('show');
}
function popJudge(kind, extra = '') {
  const p = $('judgePop');
  const map = { blue: ['완벽!', COLORS.blue], yellow: ['좋아요', COLORS.yellow], red: ['미스', COLORS.red] };
  p.textContent = map[kind][0] + extra;
  p.style.color = map[kind][1];
  p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
}

// ================= 판정 기준 =================
function judgeParams() {
  const L = profile.settings.lenient; // 1 엄격 ~ 5 너그러움
  return {
    blueTol: 0.06 + L * 0.012,
    yellowTol: 0.16 + L * 0.03,
    ratio: [1, 0.9, 0.75, 0.66, 0.5][L - 1],
  };
}
const needCount = (n, ratio) => Math.max(1, Math.ceil(n * ratio - 1e-9));

// ================= 연주 시작/정지 =================
$('btnStart').onclick = () => (session ? stopSession(true) : startSession());

async function startSession() {
  if (!score) return;
  stopPreview();
  try {
    mic.sensitivity = profile.settings.sensitivity;
    mic.latency = profile.settings.latencyMs / 1000;
    await mic.start();
  } catch (e) {
    console.error(e);
    toast('마이크를 사용할 수 없어요. 권한을 허용해 주세요 (https 주소 필요)', 4000);
    return;
  }
  const ctx = getCtx();
  score.clearColors();
  score.resetCursor();
  resetHud();
  const out = ctx.createGain(); out.connect(ctx.destination);
  const tempoPct = mode === 'rhythm' ? +$('tempoPct').value : 100;
  const bpm = score.bpm * tempoPct / 100;
  const spb = 60 / bpm;
  const jp = judgeParams();
  const judgeable = score.steps.map((s, i) => (s.judgeable ? i : -1)).filter((i) => i >= 0);
  session = {
    mode, ctx, out, bpm, spb, tempoPct, jp, judgeable,
    results: new Array(score.steps.length).fill(null),
    onsets: [], combo: 0, maxCombo: 0, cnt: { blue: 0, yellow: 0, red: 0 }, points: 0, judged: 0,
    next: 0,
  };
  session.unsub = mic.on((o) => onOnset(o));
  try { session.wake = await navigator.wakeLock?.request('screen'); } catch {}
  $('btnStart').textContent = '■ 정지';

  if (mode === 'rhythm') {
    // 카운트다운 없이: 첫 음을 치는 순간이 곧 시작 (그 시각에 맞춰 박자 기준 t0 를 정한다)
    session.t0 = null;
    session.times = score.steps.map((_, i) => score.stepTime(i, bpm));
    session.end = (session.times[session.times.length - 1] || 0) + 1.2;
    const first = judgeable[0];
    if (first == null) { stopSession(true); return; }
    score.moveCursorTo(first);
    const names = score.steps[first].expect.slice().sort((a, b) => a - b).map(midiNameKo).join(' + ');
    $('waitHint').textContent = `준비되면 첫 음 ${names} 을(를) 치세요 — 치는 순간 시작해요`;
    $('btnSkip').style.display = 'none';
    $('waitBar').classList.add('show');
  } else {
    session.cur = 0;
    session.acc = new Map();
    session.wrongs = 0;
    gotoWaitStep();
    $('btnSkip').style.display = '';
    $('waitBar').classList.add('show');
  }
  loop();
}

function stopSession(userStopped) {
  if (!session) return;
  session.unsub();
  session.out.disconnect();
  session.wake?.release?.();
  cancelAnimationFrame(session.raf);
  mic.stop();
  $('waitBar').classList.remove('show');
  $('btnStart').textContent = '▶ 시작';
  const s = session;
  session = null;
  if (userStopped) { toast('연주를 멈췄어요'); return; }
  finish(s);
}
function stopAll() { stopSession(true); stopPreview(); }

function loop() {
  const s = session;
  if (!s) return;
  $('micLevel').style.width = `${mic.level * 100}%`;
  if (s.mode === 'rhythm') {
    if (s.t0 != null) {
      const t = s.ctx.currentTime - s.t0;
      let i = s.next;
      while (i + 1 < s.times.length && s.times[i + 1] <= t + 0.02) i++;
      if (i !== s.next || !s.started) { s.next = i; s.started = true; score.moveCursorTo(i); }
      for (const idx of s.judgeable) {
        if (s.results[idx] == null && s.times[idx] + s.jp.yellowTol + 0.12 < t) judgeRhythm(idx);
      }
      if (t > s.end && s.judgeable.every((i2) => s.results[i2] != null)) { stopSession(false); return; }
    }
  }
  s.raf = requestAnimationFrame(loop);
}

function onOnset(o) {
  const s = session;
  if (!s) return;
  if (s.mode === 'rhythm') {
    if (s.t0 == null && !startOnFirstNote(o)) return;
    o.t = o.time - s.t0;
    s.onsets.push(o);
    if (s.onsets.length > 200) s.onsets.splice(0, 50);
  } else onWaitOnset(o);
}

// 리듬 모드: 첫 음이 맞게 들리면 그 시각을 기준으로 연주 시작
function startOnFirstNote(o) {
  const s = session, first = s.judgeable[0], st = score.steps[first];
  const hit = st.expect.filter((m) => o.has(m)).length;
  if (hit < needCount(st.expect.length, s.jp.ratio)) {
    const top = o.top(1);
    if (top.length) $('waitHint').textContent = `앗, ${midiNameKo(top[0])} 이(가) 들렸어요 → 첫 음 ${st.expect.map(midiNameKo).join(' + ')} 를 치면 시작해요`;
    return false;
  }
  s.t0 = o.time - s.times[first];
  $('waitBar').classList.remove('show');
  if ($('metroOn').checked) {
    const bpmMeasure = score.beatsPerMeasure, beats = Math.ceil(score.totalWhole * 4), now = s.ctx.currentTime + 0.02;
    for (let k = 0; k < beats; k++) { const at = s.t0 + k * s.spb; if (at > now) click(s.ctx, at, k % bpmMeasure === 0, s.out); }
  }
  return true;
}

// ---------- 리듬 모드 판정 ----------
function judgeRhythm(idx) {
  const s = session, st = score.steps[idx], T = s.times[idx];
  const cands = s.onsets.filter((o) => Math.abs(o.t - T) <= s.jp.yellowTol);
  const found = [];
  for (const m of st.expect) {
    let best = null;
    for (const o of cands) {
      if (o.used.has(m) || !o.has(m)) continue;
      if (!best || Math.abs(o.t - T) < Math.abs(best.t - T)) best = o;
    }
    if (best) found.push([m, best]);
  }
  const need = needCount(st.expect.length, s.jp.ratio);
  let kind;
  if (found.length >= need) {
    const dt = Math.max(...found.map(([, o]) => Math.abs(o.t - T)));
    kind = dt <= s.jp.blueTol ? 'blue' : 'yellow';
  } else kind = found.length > 0 ? 'yellow' : 'red';
  found.forEach(([m, o]) => o.used.add(m));
  let extra = '';
  if (kind === 'red') {
    const wrong = cands.flatMap((o) => o.top(1))[0];
    if (wrong != null) extra = ` (${midiNameKo(wrong)})`;
  }
  applyResult(idx, kind, extra);
}

// ---------- 연습(기다림) 모드 ----------
function gotoWaitStep() {
  const s = session;
  if (s.cur >= s.judgeable.length) { stopSession(false); return; }
  const idx = s.judgeable[s.cur];
  score.moveCursorTo(idx);
  s.acc = new Map();
  s.wrongs = 0;
  const names = score.steps[idx].expect.slice().sort((a, b) => a - b).map(midiNameKo).join(' + ');
  $('waitHint').textContent = `이 음을 쳐 보세요: ${names}`;
}
function onWaitOnset(o) {
  const s = session;
  if (s.cur >= s.judgeable.length) return;
  const idx = s.judgeable[s.cur];
  const st = score.steps[idx];
  const now = o.time;
  for (const [m, t] of s.acc) if (now - t > 0.6) s.acc.delete(m);
  let hit = 0;
  for (const m of st.expect) if (o.has(m)) { s.acc.set(m, now); hit++; }
  if (s.acc.size >= needCount(st.expect.length, s.jp.ratio)) {
    const kind = s.wrongs === 0 ? 'blue' : s.wrongs <= 2 ? 'yellow' : 'red';
    applyResult(idx, kind);
    s.cur++;
    gotoWaitStep();
    return;
  }
  if (hit === 0) {
    const top = o.top(1);
    if (top.length) {
      s.wrongs++;
      score.colorStep(idx, COLORS.red, true);
      setTimeout(() => session && score.colorStep(idx, COLORS.current, true), 250);
      $('waitHint').textContent = `앗, ${midiNameKo(top[0])} 이(가) 들렸어요 → ${st.expect.map(midiNameKo).join(' + ')} 를 쳐 보세요`;
    }
  }
}
$('btnSkip').onclick = () => {
  const s = session;
  if (!s || s.mode !== 'wait' || s.cur >= s.judgeable.length) return;
  applyResult(s.judgeable[s.cur], 'red');
  s.cur++;
  gotoWaitStep();
};

// ---------- 결과 반영 ----------
function applyResult(idx, kind, extra = '') {
  const s = session;
  s.results[idx] = kind;
  s.cnt[kind]++;
  s.judged++;
  s.points += kind === 'blue' ? 1 : kind === 'yellow' ? 0.5 : 0;
  s.combo = kind === 'red' ? 0 : s.combo + 1;
  s.maxCombo = Math.max(s.maxCombo, s.combo);
  score.colorStep(idx, COLORS[kind]);
  $('cnt' + kind[0].toUpperCase() + kind.slice(1)).textContent = s.cnt[kind];
  $('hudScore').textContent = Math.round((s.points / s.judged) * 100);
  const c = $('hudCombo');
  c.textContent = s.combo >= 3 ? `${s.combo} 콤보!` + (s.combo % 10 === 0 ? ' 🔥' : '') : '';
  c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse');
  popJudge(kind, extra);
}

// ================= 결과 화면 =================
function finish(s) {
  const total = s.judgeable.length || 1;
  const sc = (s.points / total) * 100;
  const r = recordResult(profile, { songId: song.id, score: sc, maxCombo: s.maxCombo, ...s.cnt, mode: s.mode, tempoPct: s.tempoPct });
  $('resGrade').textContent = r.grade;
  $('resScore').textContent = sc.toFixed(1);
  $('resMsg').textContent = cheer(sc, r.prevBest);
  $('resBlue').textContent = s.cnt.blue;
  $('resYellow').textContent = s.cnt.yellow;
  $('resRed').textContent = s.cnt.red;
  $('resCombo').textContent = s.maxCombo;
  // 마디별 히트맵
  const per = new Map();
  s.judgeable.forEach((i) => {
    const m = score.steps[i].measure;
    const v = per.get(m) || [0, 0];
    const k = s.results[i];
    v[0] += k === 'blue' ? 1 : k === 'yellow' ? 0.5 : 0; v[1]++;
    per.set(m, v);
  });
  $('resHeat').innerHTML = [...per.entries()].map(([m, [p, n]]) => {
    const a = p / n;
    const bg = a >= 0.9 ? '#7fb0ff' : a >= 0.6 ? '#ffd76a' : '#ff8a95';
    return `<span style="background:${bg}" title="${Math.round(a * 100)}%">${m + 1}</span>`;
  }).join('');
  $('resXp').textContent = `+${r.xpGain} XP` + (r.levelUp ? `  🎊 레벨 업! Lv.${levelInfo(profile.xp).lv}` : '');
  $('resBadges').innerHTML = r.newBadges.map((b) => `<div class="nb">${b.ic} 새 배지: <b>${b.name}</b></div>`).join('');
  show('result');
  if (r.grade === 'S' || r.levelUp) fanfare();
}
function fanfare() {
  const ctx = getCtx();
  [72, 76, 79, 84].forEach((m, i) => playTone(ctx, m, ctx.currentTime + 0.1 + i * 0.12, 0.3, 0.18));
}
$('btnResRetry').onclick = () => { show('play'); startSession(); };
$('btnResList').onclick = () => { show('home'); renderProfile(); loadSongs(); };

// ================= 미리 듣기 =================
$('btnPreview').onclick = () => (preview ? stopPreview() : startPreview());
function startPreview() {
  if (!score || session) return;
  const ctx = getCtx();
  const out = ctx.createGain(); out.connect(ctx.destination);
  const tempoPct = mode === 'rhythm' ? +$('tempoPct').value : 100;
  const bpm = score.bpm * tempoPct / 100;
  const t0 = ctx.currentTime + 0.3;
  const times = score.steps.map((_, i) => score.stepTime(i, bpm));
  score.steps.forEach((st, i) => st.playback.forEach((p) => playTone(ctx, p.midi, t0 + times[i], (p.len * 240) / bpm, 0.2, out)));
  score.clearColors();
  score.resetCursor();
  preview = { ctx, out, t0, times, idx: -1, end: times[times.length - 1] + 1.5 };
  $('btnPreview').textContent = '■ 그만 듣기';
  const tick = () => {
    if (!preview) return;
    const t = ctx.currentTime - t0;
    let i = Math.max(0, preview.idx);
    while (i + 1 < times.length && times[i + 1] <= t) i++;
    if (i !== preview.idx && t >= 0) { preview.idx = i; score.moveCursorTo(i); }
    if (t > preview.end) { stopPreview(); return; }
    preview.raf = requestAnimationFrame(tick);
  };
  tick();
}
function stopPreview() {
  if (!preview) return;
  cancelAnimationFrame(preview.raf);
  preview.out.disconnect();
  preview = null;
  $('btnPreview').textContent = '🎧 미리 듣기';
  score?.clearColors();
  score?.resetCursor();
}

// ================= 설정 =================
function bindSetting(id, key, fmt) {
  const el = $(id);
  el.value = profile.settings[key];
  const upd = () => { profile.settings[key] = +el.value; $(id + 'Text').textContent = fmt(+el.value); saveProfile(profile); };
  el.oninput = upd;
  $(id + 'Text').textContent = fmt(+el.value);
}
function openSettings() {
  bindSetting('setSens', 'sensitivity', (v) => (v <= 3 ? '둔감 ' : v >= 8 ? '민감 ' : '') + v);
  bindSetting('setLenient', 'lenient', (v) => ['엄격', '조금 엄격', '보통', '너그러움', '아주 너그러움'][v - 1]);
  bindSetting('setLatency', 'latencyMs', (v) => v + ' ms');
  $('settingsModal').classList.add('show');
}
$('btnSettings').onclick = openSettings;
$('btnCloseSettings').onclick = () => { stopMicTest(); $('settingsModal').classList.remove('show'); };
$('btnReset').onclick = () => {
  if ($('btnReset').dataset.armed) { resetProfile(); location.reload(); return; }
  $('btnReset').dataset.armed = '1';
  $('btnReset').textContent = '한 번 더 누르면 초기화';
  setTimeout(() => { delete $('btnReset').dataset.armed; $('btnReset').textContent = '기록 초기화'; }, 3000);
};

// 자동 지연 보정: 클릭 8번에 맞춰 C4 를 친다 → (감지 시각 - 클릭 시각)의 중앙값
$('btnCalib').onclick = async () => {
  if (session) return;
  stopMicTest();
  try { mic.latency = 0; mic.sensitivity = profile.settings.sensitivity; await mic.start(); } catch { $('calibMsg').textContent = '마이크를 쓸 수 없어요'; return; }
  const ctx = getCtx();
  const spb = 0.75, n = 8, t0 = ctx.currentTime + 1.5;
  const clicks = [];
  for (let k = -2; k < n; k++) { click(ctx, t0 + k * spb, k < 0); if (k >= 0) clicks.push(t0 + k * spb); }
  const hits = [];
  const un = mic.on((o) => { if ([48, 60, 72].some((m) => o.has(m))) hits.push(o.time); });
  $('calibMsg').textContent = '딱 2번 들린 뒤부터 8번, 소리에 맞춰 도(C4)를 치세요…';
  setTimeout(() => {
    un(); mic.stop();
    const offs = clicks.map((c) => {
      const near = hits.filter((h) => h - c > -0.15 && h - c < 0.5).sort((a, b) => Math.abs(a - c) - Math.abs(b - c))[0];
      return near != null ? near - c : null;
    }).filter((x) => x != null).sort((a, b) => a - b);
    if (offs.length < 4) { $('calibMsg').textContent = `감지된 소리가 부족해요 (${offs.length}/8). 조금 더 세게 쳐 보세요`; return; }
    const med = offs[Math.floor(offs.length / 2)];
    const ms = Math.max(0, Math.min(400, Math.round((med * 1000) / 10) * 10));
    profile.settings.latencyMs = ms;
    saveProfile(profile);
    $('setLatency').value = ms;
    $('setLatencyText').textContent = ms + ' ms';
    $('calibMsg').textContent = `보정 완료: ${ms} ms (${offs.length}/8 감지)`;
  }, (1.5 + n * spb + 0.8) * 1000);
};

let micTest = null;
$('btnMicTest').onclick = async () => {
  if (micTest) { stopMicTest(); return; }
  if (session) return;
  try { mic.sensitivity = profile.settings.sensitivity; mic.latency = 0; await mic.start(); } catch { $('micTestMsg').textContent = '마이크를 쓸 수 없어요'; return; }
  $('btnMicTest').textContent = '■ 테스트 끝';
  const un = mic.on((o) => { const t = o.top(4); $('micTestMsg').textContent = t.length ? '들린 음: ' + t.sort((a, b) => a - b).map(midiNameKo).join(', ') : '소리는 들리는데 음을 못 찾았어요'; });
  micTest = { un };
};
function stopMicTest() {
  if (!micTest) return;
  micTest.un(); mic.stop(); micTest = null;
  $('btnMicTest').textContent = '🎤 마이크 테스트';
}

// ================= 배지 =================
$('btnBadges').onclick = () => {
  const got = new Set(profile.badges);
  $('badgeGrid').innerHTML = BADGES.map((b) => `<div class="badge ${got.has(b.id) ? 'got' : ''}"><span class="ic">${b.ic}</span><b>${b.name}</b>${b.desc}</div>`).join('');
  $('badgeModal').classList.add('show');
};
$('btnCloseBadges').onclick = () => $('badgeModal').classList.remove('show');

// ================= 시작 =================
renderProfile();
loadSongs();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__app = { get score() { return score; }, get session() { return session; }, profile, grade };
