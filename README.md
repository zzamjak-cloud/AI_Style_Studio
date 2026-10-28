# AI Style Studio - AI 게임 아트 제작 워크스테이션

AI를 활용한 게임 아트 제작용 데스크톱 애플리케이션입니다. 로그인 없이 **OpenRouter API Key 하나만 입력하면 누구나** 사용할 수 있습니다.

## 시작하기

1. [Releases](https://github.com/zzamjak-cloud/AI_Style_Studio/releases)에서 OS에 맞는 설치 파일을 내려받아 설치합니다 (Windows / macOS Universal).
2. [OpenRouter](https://openrouter.ai/settings/keys)에서 API Key를 발급합니다.
3. 앱을 실행하고 **설정 → OpenRouter API Key** 에 키를 입력해 저장합니다.

- 키는 이 PC의 앱 설정 저장소에만 보관되며, 이미지 생성 요청은 사용자 PC에서 OpenRouter로 직접 전송됩니다. 사용 요금은 입력한 키의 OpenRouter 계정으로 청구됩니다.
- 생성한 이미지는 `~/Downloads/AI_Gen/` 아래 세션별 폴더에 저장됩니다.

## 주요 기능

### 세션 기반 워크플로우

참조 이미지를 업로드하면 AI가 스타일, 캐릭터, 구도를 분석하고, 분석 결과를 기반으로 일관된 이미지를 생성합니다.

### 세션 타입

| 타입 | 설명 | 주요 기능 |
|------|------|----------|
| **기본 (채팅)** | 대화형 이미지 생성 | 채팅으로 이미지 생성 및 이어서 편집 |
| **스타일** | 특정 화풍 학습 | 참조 이미지의 아트 스타일 재현 |
| **캐릭터** | 캐릭터 외형 학습 | 일관성 있는 캐릭터 생성 |
| **배경** | 배경 스타일 학습 | 다양한 환경 배경 생성 |
| **아이콘** | 아이템/아이콘 스타일 학습 | 게임 오브젝트 생성 |
| **픽셀 캐릭터 / 배경 / 아이콘** | 픽셀아트 | 스프라이트 시트·게임 씬·UI 요소 생성 |
| **UI 디자인** | UI/UX 디자인 | 참조 문서(PDF/Excel) 기반 인터페이스 화면 생성 |
| **로고** | 게임 타이틀 로고 | 브랜드 로고 생성 |
| **일러스트** | 다중 캐릭터 씬 | 캐릭터별 참조 이미지 + 배경 조합 |
| **컨셉** | 게임 컨셉 아트 | 장르/스타일 프리셋 기반 컨셉 생성 |
| **타일맵** | 타일 세트 | 변형 세트·룰타일 → 유니티용 타일 내보내기 |

### 그 밖의 기능

- 계층적 폴더로 세션 정리, 드래그 앤 드롭 이동, 폴더 단위 내보내기/불러오기
- 비율·해상도·참조 이미지 영향력·카메라 앵글/렌즈 프리셋·픽셀 그리드 레이아웃
- 세션 자동 저장, 생성 히스토리(즐겨찾기) 관리
- 인앱 자동 업데이트
- **AI 에이전트 연동 (MCP)**: 설정 → AI 에이전트 연동에서 등록하면 Claude Code·Codex·Claude 데스크톱이 앱의 세션별 생성 기능으로 이미지를 대량 배치 생성할 수 있습니다 (앱이 꺼져 있어도 동작, 앱에 저장된 OpenRouter 키 사용).

## 기술 스택

- **프론트엔드**: React 19 + TypeScript 5.8 + Tailwind CSS 3
- **데스크톱**: Tauri v2
- **빌드**: Vite 7
- **상태 관리**: Zustand 5
- **AI API**: OpenRouter (Gemini / OpenAI 이미지 모델)
- **문서 처리**: pdfjs-dist, xlsx

## 개발 환경

### 권장 IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

### 개발 서버

```bash
npm install
npm run tauri:dev
```

별도 `.env` 설정은 필요 없습니다. API Key는 앱 설정 화면에서 입력합니다.

## 빌드 가이드

### 로컬 빌드
개발/테스트용 로컬 빌드는 자동 업데이트 서명 없이 빌드합니다.

```bash
npm run tauri:build:local
```

- 내부적으로 `src-tauri/tauri.local.conf.json`을 사용하여 `createUpdaterArtifacts=false`로 빌드합니다.
- `TAURI_SIGNING_PRIVATE_KEY`가 없어도 빌드됩니다.
- MCP 서버 번들(`npm run mcp:build`)에는 [Bun](https://bun.sh)이 필요합니다.

### 릴리스 빌드 (태그 푸시)
1. `scripts/bump-version.sh`로 `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` 버전을 맞추고 `CHANGELOG.md`를 갱신합니다.
2. 커밋 후 **새 버전 태그만** 푸시합니다. 예:
   ```bash
   git push origin main
   git push origin v1.0.1
   ```
3. GitHub Actions가 macOS (Universal) / Windows 빌드 및 GitHub Releases 아티팩트를 생성합니다.
4. 릴리스에는 저장소 secrets `STYLESTUDIO_SIGNING_KEY_BASE64`(업데이터 서명 개인 키 파일의 base64)와 `STYLESTUDIO_SIGNING_KEY_PASSWORD`가 필요합니다.

**태그와 워크플로 버전:** 태그 `push`로 돌리면 **그 태그 커밋에 들어 있는** `.github/workflows/release.yml`이 쓰입니다. 같은 버전으로 다시 빌드하려면 (1) **새 패치 태그**를 푸시하거나 (2) **Actions → Run workflow**에서 브랜치 **`main`**, 입력 태그 **`v…`** 로 수동 실행하세요.

---

## 라이선스 (License)

Copyright (C) 2026 최진평 (Jinpyoung Choi)

AI Style Studio는 [StyleStudio](https://github.com/zzamjak-cloud/StyleStudio) v0.11.0에서 파생된 자유 소프트웨어입니다.
**GNU General Public License v3.0 이상** (GPL-3.0-or-later) 조건에 따라 재배포하거나 수정할 수 있습니다.
원본 대비 수정 사항은 [CHANGELOG.md](CHANGELOG.md)의 1.0.0 항목을 참고하세요.

이 프로그램은 유용하게 쓰이기를 바라며 배포되지만, **어떠한 보증도 하지 않습니다.**
상품성이나 특정 목적 적합성에 대한 묵시적 보증조차 없습니다.
자세한 내용은 GNU 일반 공중 사용 허가서를 참고하세요.

- 라이선스 전문: [LICENSE](LICENSE) · <https://www.gnu.org/licenses/gpl-3.0.html>
- 저작자 및 기여자: [AUTHORS.md](AUTHORS.md)
- 서드파티 라이선스: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
- 소스 코드: <https://github.com/zzamjak-cloud/AI_Style_Studio>

### GPL 준수 시 유의사항

- 이 프로그램(또는 파생 저작물)을 **배포**하는 경우, 동일한 GPL-3.0-or-later 조건으로
  **전체 소스 코드**를 함께 제공해야 합니다.
- 소스 코드를 수정한 경우, 수정 사실과 날짜를 명시해야 합니다.
- 저작권 표시와 라이선스 고지를 제거하거나 변경해서는 안 됩니다.

### 기여

Pull Request를 보내는 것은 해당 기여물을 GPL-3.0-or-later 조건으로
배포하는 데 동의함을 의미합니다. 자세한 내용은 [AUTHORS.md](AUTHORS.md)를 참고하세요.

### 생성 결과물의 권리

GPL-3.0은 **이 프로그램의 소스 코드**에만 적용됩니다.
프로그램을 사용해 생성한 이미지 등 결과물에는 적용되지 않으며,
해당 결과물의 권리·이용 조건은 사용된 AI 제공자(OpenRouter 및 각 모델 제공사)의 약관을 따릅니다.
