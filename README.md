# Auto Tactile — 정적 웹앱 (GitHub Pages 배포용)

키워드/카테고리/랜덤 → R형 촉각 그래픽 후보 → 다중 선택 → 본인 텍타일 월드 계정으로 일괄 공개.
**백엔드 없음.** 변환 엔진(`convert.js`)이 브라우저에서 직접 돌아 GitHub Pages 정적 호스팅만으로
전 세계 어디서나 동작합니다.

## 구성 (이 `docs/` 폴더가 배포 루트)
- `index.html` — SPA (로그인·공개·UI)
- `convert.js` — dotpad 변환 엔진의 브라우저 JS 포팅 (Iconify 수급 + rich/ref 변환 + 품질/유사도)
- `config.json` — Supabase URL + publishable(anon) key (브라우저 공개용, 비밀 아님)
- `topics.json` — 카테고리 탐색용 토픽 풀 (generation_topics.txt를 카테고리 분류)
- `reference_profile.json` — 레퍼런스 유사도 목표 프로파일

## GitHub Pages 배포 (한 번)
1. GitHub에 새 저장소 생성 (예: `auto-tactile`).
2. 이 `docs/` 폴더 내용을 저장소 루트(또는 `docs/`)에 올린다.
   ```bash
   cd tactile_team_app/docs
   git init && git add . && git commit -m "Auto Tactile static app"
   git branch -M main
   git remote add origin https://github.com/<계정>/auto-tactile.git
   git push -u origin main
   ```
3. 저장소 Settings → Pages → Source: `main` 브랜치 `/ (root)` 선택 → Save.
4. 몇 분 후 `https://<계정>.github.io/auto-tactile/` 주소가 발급됨.
5. **Supabase 대시보드 → Authentication → URL Configuration → Redirect URLs**에
   그 주소를 추가 (예: `https://<계정>.github.io/auto-tactile/`). 이래야 Google 로그인이 복귀함.

이후 전 세계 팀원이 그 https 주소로 접속 → Google 로그인 → 생성 → 공개.

## 로컬 미리보기
```bash
cd tactile_team_app/docs && python3 -m http.server 8770
# http://localhost:8770/?demo=1  (demo=1 이면 로그인 없이 생성·선택 UI 확인)
```

## 참고
- `?demo=1` 은 로그인 없이 생성/선택까지만 보는 모드. 실제 공개는 로그인 필요.
- 변환은 파이썬 dotpad 패키지와 동일 알고리즘. 이미지 리샘플링이 브라우저(canvas) 기반이라
  파이썬(PIL) 대비 유사도가 ±1점 내외로 미세하게 다를 수 있음(스타일·모드 선택은 동일).
- 자동 파이프라인(맥의 매일 수급·변환·공개)과 이 팀앱은 별개로, 같은 텍타일 월드에 함께 쌓임.
