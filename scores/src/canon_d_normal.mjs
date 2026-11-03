// 캐논 D장조 (파헬벨) — 같은 베이스 위에 멜로디가 점점 빨라지는 편곡
const L = ['D3+A3:2 A2+E3', 'B2+F#3:2 F#2+C#3', 'G2+D3:2 D2+A2', 'G2+D3:2 A2+E3'];
const v = (rh) => rh.map((r, i) => [r, L[i]]);
export default { id: 'canon_d_normal', title: '캐논 (보통)', composer: 'J. 파헬벨', key: 2, time: '4/4', tempo: 72,
measures: [
 ...v(['F#5:2 E5', 'D5:2 C#5', 'B4:2 A4', 'B4:2 C#5']),
 ...v(['D5:2 C#5', 'B4:2 A4', 'G4:2 F#4', 'G4:2 E4']),
 ...v(['D4:4 F#4 A4 G4', 'F#4:4 D4 F#4 E4', 'D4:4 B3 D4 A4', 'G4:4 B4 A4 G4']),
 ...v(['F#5:8 E5 D5 E5 C#5 B4 A4 C#5', 'D5:8 C#5 B4 D5 C#5 A4 F#4 A4', 'B4:8 A4 G4 B4 A4 F#4 D4 F#4', 'G4:8 B4 D5 B4 C#5 E5 A5 C#5']),
 ['D5+F#5+A5:1', 'D2+A2+D3:1'],
] };
