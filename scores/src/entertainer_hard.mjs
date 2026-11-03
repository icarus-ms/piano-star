// 엔터테이너 (스콧 조플린, 1902) — 첫 주제, 왼손은 쿵-짝 반주
const C = 'C3:8 E3+G3 G2 E3+G3', C7 = 'C3:8 E3+Bb3 G2 E3+Bb3', G7 = 'G2:8 F3+B3 D3 F3+B3', D7 = 'D3:8 F#3+C4 A2 F#3+C4';
const M1 = ['E4:16 C5:8 E4:16 C5:8 E4:16 C5:16~', C];
const M3 = ['E5:16 C5 D5 E5:8 B4:16 D5:8', G7];
export default { id: 'entertainer_hard', title: '엔터테이너 (어려움)', composer: 'S. 조플린', key: 0, time: '2/4', tempo: 76,
  pickup: ['D4:16 D#4', 'r:8'],
  measures: [
    M1, ['C5:4 r:16 C5 D5 D#5', C7], M3, ['C5:4. D4:16 D#4', C],
    M1, ['C5:4 r:16 A4 G4 F#4', D7], ['A4:16 C5 E5:8 D5:16 C5 A4 D5~', D7], ['D5:4. D4:16 D#4', G7],
    M1, ['C5:4 r:16 C5 D5 D#5', C7], M3, ['C5:4 r:16 C5 D5 E5', C],
    ['C5:16 D5 E5:8 C5:16 D5 C5 E5', C], ['C5:16 D5 E5:8 C5:16 D5 C5 E5', C], M3, ['C5:4 r:4', 'C3+G3+C4:4 r:4'],
  ] };
