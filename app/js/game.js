// 진행 기록: 경험치·레벨, 연속 연습일, 곡별 최고 기록, 배지 (localStorage)
const KEY = 'pianoStar.profile.v1';

const DEFAULT = {
  xp: 0, plays: 0, streak: 0, lastDay: null, days: [],
  best: {},        // songId -> { score, grade, at, history: [score...] }
  badges: [],
  settings: { sensitivity: 5, lenient: 3, latencyMs: 120 },
};

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p) return { ...structuredClone(DEFAULT), ...p, settings: { ...DEFAULT.settings, ...(p.settings || {}) } };
  } catch {}
  return structuredClone(DEFAULT);
}
export function saveProfile(p) { localStorage.setItem(KEY, JSON.stringify(p)); }
export function resetProfile() { localStorage.removeItem(KEY); }

// 레벨 n 까지 필요한 누적 XP: 100, 250, 450, 700 ... (점점 늘어남)
export function levelInfo(xp) {
  let lv = 1, need = 100, base = 0;
  while (xp >= base + need) { base += need; lv++; need = 100 + (lv - 1) * 50; }
  return { lv, cur: xp - base, need, title: TITLES[Math.min(TITLES.length - 1, Math.floor((lv - 1) / 3))] };
}
const TITLES = ['새싹 피아니스트', '건반 탐험가', '리듬 수호자', '멜로디 마법사', '하모니 기사', '콘서트 스타', '전설의 마에스트로'];

export const BADGES = [
  { id: 'first', ic: '🎉', name: '첫 연주', desc: '처음으로 끝까지 연주' },
  { id: 'gradeA', ic: '🅰️', name: 'A 등급', desc: 'A 등급 이상 받기' },
  { id: 'gradeS', ic: '🌟', name: 'S 등급', desc: 'S 등급 받기' },
  { id: 'perfect', ic: '💎', name: '퍼펙트', desc: '미스 없이 전부 파랑' },
  { id: 'combo30', ic: '⚡', name: '콤보 30', desc: '30 콤보 달성' },
  { id: 'combo100', ic: '🌪️', name: '콤보 100', desc: '100 콤보 달성' },
  { id: 'streak3', ic: '🔥', name: '3일 연속', desc: '3일 연속 연습' },
  { id: 'streak7', ic: '🏆', name: '일주일 개근', desc: '7일 연속 연습' },
  { id: 'plays10', ic: '🎹', name: '연습벌레', desc: '10번 연주' },
  { id: 'plays50', ic: '👑', name: '피아노 마스터', desc: '50번 연주' },
  { id: 'improve10', ic: '📈', name: '쑥쑥 성장', desc: '같은 곡 최고점 10점 이상 갱신' },
  { id: 'fullSpeed', ic: '🚀', name: '원래 속도', desc: '100% 속도 리듬 모드에서 B 이상' },
  { id: 'songs5', ic: '📚', name: '레퍼토리', desc: '서로 다른 곡 5개 연주' },
];

export function grade(score) {
  return score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
}

const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function currentStreak(p) {
  if (!p.lastDay) return 0;
  const y = new Date(); y.setDate(y.getDate() - 1);
  return p.lastDay === dayStr() || p.lastDay === dayStr(y) ? p.streak : 0;
}

// 연주 결과 반영 → { xpGain, newBadges, prevBest, levelUp }
export function recordResult(p, r) {
  // r: { songId, score, maxCombo, blue, yellow, red, mode, tempoPct }
  const today = dayStr();
  if (p.lastDay !== today) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    p.streak = p.lastDay === dayStr(y) ? p.streak + 1 : 1;
    p.lastDay = today;
    p.days = [...(p.days || []), today].slice(-60);
  }
  p.plays++;
  const g = grade(r.score);
  const prev = p.best[r.songId];
  const prevBest = prev ? prev.score : null;
  const hist = prev ? prev.history || [] : [];
  hist.push(Math.round(r.score));
  if (!prev || r.score > prev.score) p.best[r.songId] = { score: r.score, grade: g, at: today, history: hist.slice(-20) };
  else prev.history = hist.slice(-20);

  const gradeBonus = { S: 50, A: 30, B: 15, C: 5, D: 0 }[g];
  const modeMul = r.mode === 'rhythm' ? 1 : 0.7;
  const xpGain = Math.round((r.score + r.maxCombo * 0.5 + gradeBonus) * modeMul * (0.5 + r.tempoPct / 200)) + (prevBest != null && r.score > prevBest ? 20 : 0);
  const before = levelInfo(p.xp).lv;
  p.xp += xpGain;
  const levelUp = levelInfo(p.xp).lv > before;

  const has = new Set(p.badges);
  const earn = (id, cond) => { if (cond && !has.has(id)) { has.add(id); newBadges.push(BADGES.find((b) => b.id === id)); } };
  const newBadges = [];
  earn('first', true);
  earn('gradeA', g === 'S' || g === 'A');
  earn('gradeS', g === 'S');
  earn('perfect', r.yellow === 0 && r.red === 0 && r.blue > 0);
  earn('combo30', r.maxCombo >= 30);
  earn('combo100', r.maxCombo >= 100);
  earn('streak3', p.streak >= 3);
  earn('streak7', p.streak >= 7);
  earn('plays10', p.plays >= 10);
  earn('plays50', p.plays >= 50);
  earn('improve10', prevBest != null && r.score - prevBest >= 10);
  earn('fullSpeed', r.mode === 'rhythm' && r.tempoPct >= 100 && r.score >= 70);
  earn('songs5', Object.keys(p.best).length >= 5);
  p.badges = [...has];
  saveProfile(p);
  return { xpGain, newBadges, prevBest, levelUp, grade: g };
}

export function cheer(score, prevBest) {
  if (prevBest != null && score > prevBest) return `최고 기록 갱신! 지난번보다 +${Math.round(score - prevBest)}점 🎉`;
  if (score >= 95) return '완벽에 가까워요! 무대에 서도 되겠는데요? ✨';
  if (score >= 85) return '정말 잘했어요! 조금만 더 하면 S 등급! 💪';
  if (score >= 70) return '좋아요! 빨간 마디만 몇 번 더 연습해 봐요 🙂';
  if (score >= 50) return '절반 넘게 성공! 🐢 연습 모드나 느린 속도로 해 보면 금방 늘어요';
  return '처음엔 다 어려워요. 속도를 70%로 낮춰서 다시 해 볼까요? 🌱';
}
