// 스카버러 페어 (영국 민요) — 1절은 화음 반주, 2절은 왼손 분산화음
const C1 = { Dm: 'D3+A3:2.', C: 'C3+G3:2.', G: 'G2+D3:2.', Am: 'A2+E3:2.', F: 'F2+C3:2.' };
const C2 = { Dm: 'D3:8 A3 D4 A3 F3 A3', C: 'C3:8 G3 C4 G3 E3 G3', G: 'G2:8 D3 G3 D3 B2 D3', Am: 'A2:8 E3 A3 E3 C3 E3', F: 'F2:8 C3 F3 C3 A2 C3' };
const MEL = ['D4:2 D4:4', 'A4:2 A4:4', 'E4:4. F4:8 E4:4', 'D4:2.', 'r:4 A4 C5', 'D5:2 C5:4', 'A4:4 B4 G4', 'A4:2.',
  'r:4 D5 D5', 'D5:2 C5:4', 'A4:2 A4:4', 'G4:4 F4 E4', 'D4:2 A4:4', 'G4:2 F4:4', 'E4:4 D4 C4', 'D4:2.'];
const CH = ['Dm', 'Dm', 'C', 'Dm', 'Dm', 'Dm', 'G', 'Am', 'Dm', 'Dm', 'F', 'C', 'Dm', 'F', 'C', 'Dm'];
export default { id: 'scarborough_fair_normal', title: '스카버러 페어 (보통)', composer: '영국 민요', key: 0, time: '3/4', tempo: 100,
  measures: [...MEL.map((m, i) => [m, C1[CH[i]]]), ...MEL.map((m, i) => [m, C2[CH[i]]])] };
