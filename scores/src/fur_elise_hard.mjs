// 엘리제를 위하여 (베토벤, WoO 59) — A–B–A 부분, 도돌이는 펼쳐 씀. B 뒤 이음 부분은 짧게 줄임
const A1 = ['E5:16 D#5 E5 B4 D5 C5', 'r:4.'];
const A2 = ['A4:8 r:16 C4 E4 A4', 'A2:16 E3 A3 r:8.'];
const A3 = ['B4:8 r:16 E4 G#4 B4', 'E2:16 E3 G#3 r:8.'];
const A4 = ['C5:8 r:16 E4 E5 D#5', 'A2:16 E3 A3 r:8.'];
const A7 = ['B4:8 r:16 E4 C5 B4', 'E2:16 E3 G#3 r:8.'];
const A = [A1, A2, A3, A4, A1, A2, A7];
export default { id: 'fur_elise_hard', title: '엘리제를 위하여 (어려움)', composer: 'L. v. 베토벤', key: 0, time: '3/8', tempo: 66,
pickup: ['E5:16 D#5', 'r:8'],
measures: [
 ...A, ['A4:8 r:8 E5:16 D#5', 'A2:16 E3 A3 r:8.'],
 ...A, ['A4:8 r:16 B4 C5 D5', 'A2:16 E3 A3 r:8.'],
 ['E5:8. G4:16 F5 E5', 'C3:16 G3 C4 r:8.'], ['D5:8. F4:16 E5 D5', 'G2:16 G3 B3 r:8.'], ['C5:8. E4:16 D5 C5', 'A2:16 E3 A3 r:8.'],
 ['B4:8 r:16 E4 E5 r:16', 'E2:16 E3 r:16 r:8.'], ['r:16 E5 E6 r r D#5', 'r:4.'], ['E5:16 r r D#5 E5 D#5', 'r:4.'],
 ...A, ['A4:4.', 'A2:16 E3 A3 r:8.'],
] };
