# 🎹 피아노 스타

태블릿 마이크로 피아노 연주를 듣고, 악보 위에 🔵 정확 / 🟡 아쉬움 / 🔴 미스 를 실시간으로 표시하는 연습 앱.

## 구성
```
app/                 ← 태블릿 앱 (이 폴더만 웹에 올리면 됨)
  scores/            ← 앱에 나오는 악보(.musicxml) + index.json
scores/inbox/        ← 변환할 PDF·사진을 넣는 곳
scores/listen/       ← PC에서 들어보는 .mid 파일
tools/score-tool.mjs ← 악보 검증 / 곡 목록 갱신 / MIDI 만들기
tools/serve.mjs      ← PC에서 앱 실행용 로컬 서버
.claude/skills/score-convert/ ← Claude 악보 변환 스킬
```

## 새 곡 넣기 — Claude 프로젝트 (태블릿만으로 가능)
1. Claude 앱 → 프로젝트 → 새 프로젝트 "🎹 피아노 악보 도우미"
   - 지침: `docs/claude-project/프로젝트_지침.md` 내용 붙여넣기
   - 파일: `docs/claude-project/악보플레이어_템플릿.html`, `docs/claude-project/twinkle_easy.musicxml`
2. 프로젝트에서 새 채팅 → 악보 사진/PDF 첨부 → "쉬움 버전으로 바꿔줘"
3. 채팅 안의 악보 플레이어로 듣고, 말로 수정 요청 ("왼손 더 쉽게", "두 버전 들려줘")
4. 플레이어의 ⬇ MusicXML 받기 / 📋 복사 → 피아노 스타의 📂 파일 열기 / 📋 붙여넣기

(PC의 Claude Code 에서는 `/score-convert` 스킬로 같은 작업을 하고 `app/scores/` 기본 곡 목록에 넣을 수 있다.)

## 태블릿에 설치 (GitHub Pages)
안드로이드 크롬은 **https 에서만 마이크를 허용**하므로 GitHub Pages 로 배포한다.
- 저장소 Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save
- 주소: `https://<아이디>.github.io/piano-star/` (→ `app/` 으로 이동), 안내: `.../docs/guide.html`
- 태블릿 크롬 ⋮ → 홈 화면에 추가

## PC에서 미리 실행
```bash
node tools/serve.mjs      # → http://localhost:8080 (PC 크롬에서 마이크 사용 가능)
```

## 처음 쓸 때 설정 (⚙️)
- **🎤 마이크 테스트**: 건반을 쳤을 때 "들린 음: 도4" 처럼 맞게 나오는지 확인. 잘 안 잡히면 감도↑.
- **🎯 자동 보정**: 태블릿 마이크 지연을 맞춘다. 리듬 모드에서 전부 노란색이 나오면 꼭 실행.
- **판정 너그러움**: 화음이 자꾸 노란색이면 '너그러움'으로.
- 태블릿은 피아노 보면대에 두고, 피아노 볼륨은 보통 정도가 가장 잘 인식된다.

## 모드
- 🎵 **리듬**: 정해진 템포로 커서가 움직임. 음 + 박자 판정. 속도 50~120% 조절, 🥁 메트로놈.
- 🐢 **연습**: 맞는 음을 칠 때까지 기다려 줌. 틀리면 무슨 음이 들렸는지 알려줌. 한 번에 맞히면 🔵.

## 알려진 한계
- 마이크 판정이라 MIDI 연결보다 덜 정확하다(특히 4음 이상 화음, 아주 빠른 패시지, 매우 작은 소리).
- 도돌이표는 따라가지 않는다 → 변환 스킬이 반복을 펼쳐서 쓴다.
- 기록(점수·배지)은 태블릿 브라우저에 저장된다. 크롬 데이터를 지우면 초기화된다.
