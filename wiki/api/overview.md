# API 공통 — 에러 처리 · 번역 · 키/경로

앱의 외부 API 호출은 **OpenRouter 통합 키 또는 Gemini/OpenAI 직접 키**로 나간다(하나 이상 입력). 경로는 `chatComplete`/`generateImagesViaOpenRouter` 내부에서 모델별로 정해진다 — **원 제공사 직접 키 → OpenRouter 키 → (텍스트만) 다른 직접 키의 대체 모델**. 이미지 모델은 대체하지 않고 키가 없으면 에러. 텍스트/비전은 `chat/completions`, 이미지 생성은 `images` 엔드포인트를 쓴다. **표준화된 API 에러 파싱/사용자 메시지 변환**(`apiErrorHandler`), **한↔영 자동 번역**(`useGeminiTranslator`, 이미지 프롬프트용), **생성 결과물 저장 경로**(`config/paths`)를 다룬다. API 키는 사용자가 설정에서 입력하며 Tauri `store` 에 영속된다.

## 관련 파일
- `src/lib/api/openrouter.ts` — OpenRouter 공통 클라이언트. `OPENROUTER_BASE_URL`(`https://openrouter.ai/api/v1`), `openrouterHeaders`(Bearer + `X-OpenRouter-Title`), `chatComplete`(텍스트/비전, `finish_reason` 처리 — `length`/`content_filter` 는 항상 에러), `toImagePart`(data URL→image_url 파트), `generateImageViaOpenRouter`(Image API)
- `src/lib/api/providerKeys.ts` — 제공사별 키 레지스트리(`setProviderKeys`/`getProviderKeys`), 슬러그→제공사(`providerOfModel`)·직접 모델 ID(`toDirectModelId`, 접두사 제거). 직접 키만 있을 때 앱 `apiKey` 자리에 `DIRECT_KEYS_ONLY_MARKER` 를 넣어 호출부 `!apiKey` 가드를 통과시킨다(Bearer 로 전송되지 않음 — `resolveOpenRouterKey`)
- `src/lib/api/directProviders.ts` — 직접 API. 텍스트: Gemini OpenAI 호환 레이어(`/v1beta/openai/chat/completions`)·OpenAI `chat/completions`(`max_completion_tokens`). 이미지: Gemini `generateContent`(`responseModalities:['IMAGE']`, `imageConfig`), OpenAI `images/generations`·참조 있으면 `images/edits`(multipart `image[]`). 대체 텍스트 모델 `DIRECT_TEXT_FALLBACK_MODEL`
- `src/lib/apiErrorHandler.ts` — API 에러 파싱·메시지·로깅. `parseApiError`/`getUserFriendlyErrorMessage`/`handleApiError`/`extractErrorFromResponse`
- `src/hooks/api/useGeminiTranslator.ts` — 한↔영 번역 훅 (`chatComplete` + Gemini Flash)
- `src/lib/config/paths.ts` — 결과물 저장 폴더 경로 헬퍼(`~/Downloads/AI_Gen/`)
- `src/lib/storage.ts` — API 키 영속(`saveProviderApiKeys`/`loadProviderApiKeys`, store 키 `openrouter_api_key`/`gemini_api_key`/`openai_api_key`. 빈 값은 항목 삭제)
- `src/components/common/SettingsModal.tsx` — OpenRouter·Gemini·OpenAI 키 3필드 입력 UI(`wiki/ui/overview.md`)
- `src-tauri/capabilities/default.json` — `openrouter.ai`·`generativelanguage.googleapis.com`·`api.openai.com` HTTP allow

## 데이터 모델

```ts
ApiError = { message: string, code?: string | number, status?: number, details?: unknown }
```

## API 에러 처리 (apiErrorHandler.ts)

4개 함수로 구성:

| 함수 | 역할 |
|------|------|
| `parseApiError(unknown)` | Error/OpenRouter 형식(`error.error = {code, message, metadata}`)/일반 객체/원시값을 `ApiError` 로 정규화 |
| `getUserFriendlyErrorMessage(ApiError)` | 숫자 code(=HTTP 상태 체계) → 한국어 메시지 매핑 |
| `handleApiError(unknown)` | parse + friendly + `logger.error` 로깅, 사용자 메시지 반환 |
| `extractErrorFromResponse(Response)` | fetch `Response` 본문에서 에러 추출(JSON/텍스트 fallback) |

### 상태 → 메시지 매핑 (OpenRouter 에러 코드 체계)
- `401`(키 확인), `402`(**크레딧 부족**), `403`(입력 차단/moderation), `408`(시간 초과), `429`(요청 과다), `500`/`502`(서버·실패한 생성), `503`(가용 provider 없음)

## 번역 (useGeminiTranslator.ts)

이미지 생성 API 는 영어 프롬프트를 쓰지만 사용자는 한국어로 입력할 수 있다. 이 훅이 `GEMINI_FLASH_TEXT_MODEL`(**`google/gemini-3.8-flash`**, OpenRouter chat completions)로 상호 번역한다. 5개 함수 반환:

| 함수 | 방향 | 용도 |
|------|------|------|
| `translateToEnglish(key, text)` | 한→영 | API 전달용 |
| `translateToKorean(key, text)` | 영→한 | 화면 표시용 |
| `translateBatchToEnglish(key, texts[])` | 한→영 | `[n]` 프리픽스 배치(API 호출 최적화) |
| `translateBatchToKorean(key, texts[])` | 영→한 | 배치 |
| `containsKorean(text)` | — | `[가-힣ㄱ-ㅎㅏ-ㅣ]` 정규식 감지 |

공통 규칙:
- **언어 스킵**: 대상 언어가 이미 포함돼 있으면(예: 한→영인데 한글 없음) 원본 그대로 반환
- **실패 안전**: API 오류/예외 시 로깅 후 **원본 텍스트 반환**(throw 안 함) — 내부 `translate` 헬퍼가 공통 처리
- **배치 파싱**: `[번호]` 프리픽스로 라인 매칭(`parseBatchResult`), 매칭 실패 시 해당 인덱스는 원본 유지
- 응답 추출 경로: `choices[0].message.content`
- 키는 `Authorization: Bearer` 헤더로 전달 (구 Gemini의 `?key=` 쿼리 방식 폐기)

## 기타 OpenRouter 사용처

- `src/hooks/api/useGeminiAnalyzer.ts` — 참조 분석(비전). `chatComplete` + `max_tokens: 32768`(`ANALYSIS_MAX_TOKENS`). 레거시 분석 모델 ID는 `normalizeAnalysisModel` 로 `google/` 접두어 부여 → `wiki/analysis/analysis-prompt.md`
- `src/lib/sketch/analyzeSketch.ts` — 구도 스케치 분석(비전)
- `src/lib/utils/fileOptimization.ts` — 참조 문서 요약(`generateFileSummary`)
- `src/hooks/useChatImageGeneration.ts` — 채팅 생성·대화 요약 → `wiki/chat/overview.md`
- `src/hooks/api/useImageGenerator.ts` — 이미지 생성 → `wiki/generator/image-generation-api.md`

## API 키 / 저장 경로 (config/paths.ts)

**키**: OpenRouter·Gemini·OpenAI 키를 `SettingsModal` 에서 입력(하나 이상) → `store` 영속. `useSessionManagement` 가 로드해 `setProviderKeys` 로 레지스트리에 넣고, App 은 `toAppApiKey` 결과를 `apiKey` prop 으로 각 패널에 배선(원본 키는 `providerKeys` 로 설정 모달에만). `.env` 의 `VITE_*` 는 **OAuth 전용**. 키가 하나도 없으면 설정 모달 자동 오픈. **OpenAI 직접 경로 차이**: 비율은 표준 size 3종(1024², 1536×1024, 1024×1536)으로, 품질 `xhigh`/`max` 는 `high` 로 수렴. MCP 서버도 같은 세 키를 `settings.json` 에서 읽어 같은 레지스트리로 라우팅한다(`mcp/src/env.ts`, `wiki/infra/mcp.md`).

**결과물 폴더**(`paths.ts`, Tauri `path`/`fs` 사용):
- `AI_GEN_ROOT_SEGMENT = 'AI_Gen'`, `SESSIONS_SEGMENT = 'Sessions'`
- `getAiGenRoot()` → `~/Downloads/AI_Gen/`(없으면 생성)
- `getSessionsRoot()` → `~/Downloads/AI_Gen/Sessions/`
- `getSessionImageFolder(name)` → `~/Downloads/AI_Gen/{sanitized}/`
- `sanitizeFolderName()` — `\ / : * ? " < > |` → `_`, 빈 이름은 `untitled`

## 회귀 증상별 원인

| 증상 | 원인 |
|------|------|
| 에러 메시지가 영문 raw 로 노출 | `handleApiError`/`getUserFriendlyErrorMessage` 미경유 |
| 402/크레딧 메시지 안 뜸 | 응답이 `code`·`status` 없이 옴 → `parseApiError` fallback message |
| 번역이 원문 그대로 나옴 | API 실패 시 원본 반환(설계), 또는 이미 대상 언어 포함으로 스킵 |
| 배치 번역 개수/순서 어긋남 | 응답 `[번호]` 프리픽스 유실 → 인덱스별 원본 fallback |
| API 호출이 CSP/권한 차단 | `capabilities/default.json` 에 `https://openrouter.ai/*` 오리진 필요 |
| 결과 폴더 경로에 특수문자로 저장 실패 | `sanitizeFolderName` 미적용 |
| API 키 없이 호출 / 업데이트 후 전부 인증 실패 | OpenRouter 키 미입력 — `loadOpenRouterApiKey` null (구 Gemini/OpenAI 키는 사용 안 함) |
