// 자장가 (브람스, Op.49-4) — 왈츠 반주
const C = { C: 'C3:4 E3+G3 E3+G3', G7: 'G2:4 B2+F3 B2+F3', F: 'F2:4 A2+C3 A2+C3' };
const M = [
  ['G4:4. E4:8 E4:4', 'C'], ['G4:2 E4:8 G4', 'C'], ['C5:4 B4:4. A4:8', 'G7'], ['A4:4 G4 D4:8 E4', 'G7'],
  ['F4:4 D4 D4:8 E4', 'G7'], ['F4:2 D4:8 F4', 'G7'], ['B4:8 A4 G4:4 B4', 'G7'], ['C5:2 C4:8 C4', 'C'],
  ['C5:2 A4:8 F4', 'F'], ['G4:2 E4:8 C4', 'C'], ['F4:4 G4 A4', 'G7'], ['G4:2 C4:8 C4', 'C'],
  ['C5:2 A4:8 F4', 'F'], ['G4:2 E4:8 C4', 'C'], ['F4:4 E4 D4', 'G7'], ['C4:2.', 'C3+G3:2.'],
];
export default { id: 'brahms_lullaby_normal', title: '브람스 자장가 (보통)', composer: 'J. 브람스', key: 0, time: '3/4', tempo: 84,
  pickup: ['E4:8 E4', 'r:4'], measures: M.map(([r, l]) => [r, C[l] || l]) };
