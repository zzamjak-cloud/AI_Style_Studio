# Changelog

이 프로젝트의 모든 주요 변경 사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 기반으로 합니다.

## [Unreleased]

### Added

- **나노바나나 2.1 이미지 모델**: 이미지 모델 목록에 나노바나나 2.1이 추가되었습니다. 해상도는 1K·2K·4K입니다.

### Changed

- **나노바나나 프로·나노바나나2 정식판 전환**: 프리뷰 모델 대신 정식판 모델을 씁니다. 예전 프리뷰 모델로 저장된 세션과 MCP 호출은 자동으로 정식판으로 이어집니다.

## [1.3.0] - 2026-11-20

### Added

- **Anthropic(Claude) API Key 입력**: 설정에서 Claude API Key를 입력할 수 있습니다.
- **Claude로 참조 이미지 분석**: 분석 모델 목록에 Claude Opus 5.5·Claude Sonnet 5.5가 추가되었습니다. Claude 키가 있으면 Claude API로 직접 호출하고, 없으면 OpenRouter 키로 호출합니다. 두 키가 모두 없으면 다른 모델로 바꾸지 않고 안내 메시지를 띄웁니다.
  - 안전 필터 오탐으로 거절되면 서버가 다른 Claude 모델로 자동 재시도합니다(Haiku 제외).
- **Claude 텍스트 모델 선택**: Claude 키만 있을 때 번역·요약에 쓸 모델(Opus 5.5·Sonnet 5.5·Haiku 5.5)을 설정에서 고를 수 있습니다.
- **MCP 서버**: 앱 설정의 Claude 키와 텍스트 모델 설정을 함께 읽습니다. `ss_info`의 `api_keys`에 `anthropic`이 추가되었습니다.

## [1.2.0] - 2026-11-12

### Added

- **덕테이프 2.6 플레어·선버스트 모델 추가**: GPT Image 2.6을 이미지 모델 목록에 추가했습니다. 플레어는 2.5보다 약 50% 빠르게 생성하고, 선버스트는 반복 편집에서 디테일 일관성이 좋아졌습니다. 품질 xhigh/max와 투명 배경을 지원합니다.

## [1.1.0] - 2026-11-01

### Added

- **Gemini·OpenAI API Key 직접 입력**: 설정에서 OpenRouter 외에 Google Gemini API Key와 OpenAI API Key를 입력할 수 있습니다. 하나 이상만 입력하면 됩니다.
  - 해당 제공사 키가 있으면 그 모델(Gemini 이미지·분석·번역 / GPT Image)은 제공사 API로 직접 호출하고, 없으면 OpenRouter 키로 호출합니다.
  - 번역·분석은 Gemini 키와 OpenRouter 키가 모두 없으면 OpenAI 텍스트 모델로 대체됩니다.
  - OpenAI 직접 호출 시 비율은 표준 크기(1024×1024, 1536×1024, 1024×1536)로 맞춰지고, 품질 xhigh/max는 high로 처리됩니다.
- **MCP 서버 다중 키 지원**: MCP 서버도 앱 설정의 Gemini·OpenAI 키를 읽어 같은 규칙으로 호출합니다. `ss_info`에 제공사별 키 설정 여부(`api_keys`)가 추가되었습니다.

## [1.0.0] - 2026-10-28

AI Style Studio 첫 공개 버전입니다. [StyleStudio](https://github.com/zzamjak-cloud/StyleStudio) v0.11.0을 기반으로 한 별도 프로젝트로, 로그인 없이 누구나 OpenRouter API Key만 입력해 사용할 수 있습니다.

### Changed — StyleStudio v0.11.0 대비 수정 사항

- **Google 계정 로그인 제거**: 앱 실행 시 로그인 화면이 없고, 특정 도메인 계정 제한도 없습니다. 설정에서 OpenRouter API Key를 입력하면 바로 사용할 수 있습니다.
  - 로그인 게이트(`AuthGuard`·`LoginScreen`·`useAuth`·`authService`)와 설정 화면의 계정/로그아웃 섹션을 제거했습니다.
  - OAuth 콜백 로컬 서버(`oauth_server.rs`, 포트 9528), deep-link 플러그인, Google OAuth HTTP 허용 오리진, `.env`의 OAuth 환경 변수를 제거했습니다.
- **앱 식별자 분리**: 앱 이름 `AI Style Studio`, 번들 식별자 `com.zzamjak.ai-style-studio`. 원본 StyleStudio와 한 PC에 함께 설치해도 설정·세션 데이터가 섞이지 않습니다.
- **MCP 서버 등록 이름 분리**: AI 에이전트 설정에 `ai-style-studio` 이름으로 등록되며, 데이터 경로 환경 변수는 `AI_STYLE_STUDIO_DATA_DIR` 입니다.
- **자동 업데이트 채널 분리**: 이 저장소의 릴리스와 새 서명 키를 사용합니다.

### 포함된 기능

- 세션 기반 이미지 생성: 채팅·스타일·캐릭터·배경·아이콘·픽셀아트·UI·로고·일러스트·컨셉·타일맵
- 참조 이미지 분석, 참조 문서(PDF·엑셀·CSV·마크다운·웹페이지·구글 스프레드시트)
- 폴더 관리, 세션/폴더 내보내기·불러오기 (StyleStudio에서 내보낸 `.stylestudio.json` 파일도 불러올 수 있습니다)
- AI 에이전트 대량 배치 생성 (MCP)
- 인앱 자동 업데이트
