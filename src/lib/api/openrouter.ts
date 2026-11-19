// OpenRouter 통합 API 클라이언트
// - 텍스트/비전: POST /api/v1/chat/completions (OpenAI 호환)
// - 이미지 생성: POST /api/v1/images (전용 Image API, input_references 지원)
// Gemini/OpenAI/Anthropic 직접 키가 설정돼 있으면 해당 제공사 모델은 직접 API 로 보내고(providerKeys),
// 없으면 OpenRouter 통합 키로 보낸다.

import { logger } from '../logger';
import {
  getProviderKeys,
  providerOfModel,
  resolveOpenRouterKey,
  toDirectModelId,
  type DirectProvider,
} from './providerKeys';
import { DIRECT_TEXT_FALLBACK_MODEL, directChatEndpoint, generateImagesDirect } from './directProviders';
import { anthropicChatComplete } from './anthropicClient';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// 앱 식별용 선택 헤더 (openrouter.ai 대시보드에서 앱 단위 사용량 추적)
const APP_TITLE = 'AI Style Studio';

export function openrouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
    'X-OpenRouter-Title': APP_TITLE,
  };
}

// ---------------------------------------------------------------------------
// Chat Completions (텍스트 생성 · 비전 분석)
// ---------------------------------------------------------------------------

interface ChatTextPart {
  type: 'text';
  text: string;
}

interface ChatImagePart {
  type: 'image_url';
  image_url: { url: string };
}

export type ChatContentPart = ChatTextPart | ChatImagePart;

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

interface ChatCompleteParams {
  model: string;
  messages: ChatMessageInput[];
  maxTokens?: number;
}

/** data URL을 chat completions image_url 파트로 변환 */
export function toImagePart(imageDataUrlOrBase64: string): ChatImagePart {
  const url = imageDataUrlOrBase64.startsWith('data:')
    ? imageDataUrlOrBase64
    : `data:image/png;base64,${imageDataUrlOrBase64}`;
  return { type: 'image_url', image_url: { url } };
}

/**
 * 텍스트 응답을 반환하는 chat completions 호출.
 * finish_reason이 length/content_filter면 상황을 알 수 있는 에러를 던진다.
 */
type ChatRoute =
  | {
      kind: 'openai-compatible';
      url: string;
      headers: Record<string, string>;
      model: string;
      maxTokensField: 'max_tokens' | 'max_completion_tokens';
    }
  | { kind: 'anthropic'; apiKey: string; model: string };

/**
 * 텍스트 요청 경로 결정: 원 제공사 직접 키 → OpenRouter → 다른 직접 키(대체 모델).
 * 텍스트 모델은 대체해도 기능이 같으므로 마지막 단계까지 허용한다.
 * 단, 사용자가 Claude 모델을 직접 고른 경우는 다른 모델로 몰래 바꾸지 않고 에러를 낸다.
 */
function resolveChatRoute(apiKey: string, model: string): ChatRoute {
  const keys = getProviderKeys();
  const provider = providerOfModel(model);
  const direct = (p: DirectProvider, directModel: string): ChatRoute => ({
    kind: 'openai-compatible',
    ...directChatEndpoint(p, keys[p]),
    model: directModel,
  });

  if (provider === 'anthropic' && keys.anthropic) {
    return { kind: 'anthropic', apiKey: keys.anthropic, model: toDirectModelId(model) };
  }
  if (provider && provider !== 'anthropic' && keys[provider]) {
    return direct(provider, toDirectModelId(model));
  }

  const openrouterKey = resolveOpenRouterKey(apiKey) || keys.openrouter;
  if (openrouterKey) {
    return {
      kind: 'openai-compatible',
      url: `${OPENROUTER_BASE_URL}/chat/completions`,
      headers: openrouterHeaders(openrouterKey),
      model,
      maxTokensField: 'max_tokens',
    };
  }

  if (provider === 'anthropic') {
    throw new Error('Claude 모델을 쓰려면 설정에서 Anthropic(Claude) 또는 OpenRouter API 키를 입력하세요.');
  }

  if (keys.gemini) return direct('gemini', DIRECT_TEXT_FALLBACK_MODEL.gemini);
  if (keys.openai) return direct('openai', DIRECT_TEXT_FALLBACK_MODEL.openai);
  if (keys.anthropic) return { kind: 'anthropic', apiKey: keys.anthropic, model: keys.anthropicTextModel };

  throw new Error(
    'API Key가 비어있습니다. 설정에서 OpenRouter·Gemini·OpenAI·Anthropic 중 하나의 키를 입력하세요.'
  );
}

export async function chatComplete(apiKey: string, params: ChatCompleteParams): Promise<string> {
  const route = resolveChatRoute(apiKey, params.model);

  if (route.kind === 'anthropic') {
    return anthropicChatComplete(route.apiKey, { ...params, model: route.model });
  }

  const body: Record<string, unknown> = {
    model: route.model,
    messages: params.messages,
  };
  if (params.maxTokens !== undefined) {
    body[route.maxTokensField] = params.maxTokens;
  }

  const response = await fetch(route.url, {
    method: 'POST',
    headers: route.headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ Chat API 오류:', route.url, response.status, errorText);
    throw new Error(`API 오류 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const choice = result?.choices?.[0];

  if (!choice) {
    throw new Error('API 응답에 choices가 없습니다. API 키나 요청을 확인하세요.');
  }

  const finishReason: string | undefined = choice.finish_reason;
  const text: string = typeof choice.message?.content === 'string' ? choice.message.content : '';

  if (finishReason === 'content_filter') {
    throw new Error('요청이 콘텐츠 필터에 의해 차단되었습니다. 다른 이미지나 프롬프트로 시도해주세요.');
  }
  // 'length' 는 텍스트가 일부라도 왔더라도 반드시 에러다.
  // 예전에는 `!text` 조건이 붙어 있어, 잘린 JSON 이 그대로 파서로 넘어가
  // "잘림" 이 아니라 정체불명의 파싱 실패로 보고되었다.
  if (finishReason === 'length') {
    throw new Error(
      '응답이 출력 토큰 한도에 걸려 잘렸습니다. 참조 이미지 수나 입력을 줄이고 다시 시도해주세요.'
    );
  }
  if (!text) {
    throw new Error('API 응답에 텍스트가 없습니다. 다시 시도해주세요.');
  }

  return text;
}

// ---------------------------------------------------------------------------
// Image API (이미지 생성)
// ---------------------------------------------------------------------------

export interface ImageApiRequest {
  model: string;
  prompt: string;
  /** '1:1' | '3:2' | '16:9' | '21:9' 등 — 모델별 지원 목록은 imageModels.ts가 정한다 */
  aspectRatio?: string;
  /** '1K' | '2K' | '4K' — Gemini 계열 전용 */
  resolution?: string;
  /** 'low' | 'medium' | 'high' | 'xhigh' | 'max' — gpt-image 계열 전용 */
  quality?: string;
  /** 'transparent' | 'opaque' | 'auto' — transparent는 gpt-image-2.5 계열만 지원 */
  background?: string;
  /** 참조 이미지 data URL 배열 */
  inputReferences?: string[];
  /**
   * 한 번에 받을 장수 (gpt-image 계열 1~10, Gemini 계열 1 고정 — `supports.maxImagesPerRequest`).
   * 같은 프롬프트로 여러 장이 필요할 때 요청 수를 줄이는 비용 레버다. 생략하면 1장.
   */
  n?: number;
  /** 요청 취소·타임아웃 신호 (MCP 배치는 요청당 5분 제한을 건다) */
  signal?: AbortSignal;
}

export interface GeneratedImage {
  base64: string;
  mediaType: string;
}

/** Image API 응답 전체 — `n` 장 결과와 과금 정보(OpenRouter 가 주면) */
export interface GeneratedImageBatch {
  images: GeneratedImage[];
  /** 응답의 `usage` 원본 (cost 등). 제공되지 않으면 undefined */
  usage?: Record<string, unknown>;
  /** 응답 id — 과금 조회(`/generation?id=`)에 쓸 수 있다 */
  id?: string;
}

/**
 * OpenRouter Image API 호출. base64 이미지와 media_type을 반환한다.
 * 파라미터는 모델별 supported_parameters에 맞는 것만 전달할 것
 * (미지원 파라미터는 400 원인이 될 수 있다).
 */
export async function generateImageViaOpenRouter(
  apiKey: string,
  request: ImageApiRequest
): Promise<GeneratedImage> {
  const batch = await generateImagesViaOpenRouter(apiKey, request);
  return batch.images[0];
}

/**
 * OpenRouter Image API 호출 — `n` 장 결과를 모두 돌려준다.
 * 앱은 `generateImageViaOpenRouter`(첫 장)를, MCP 배치(`mcp/`)는 이 함수를 쓴다.
 */
export async function generateImagesViaOpenRouter(
  apiKey: string,
  request: ImageApiRequest
): Promise<GeneratedImageBatch> {
  // 원 제공사 직접 키가 있으면 직접 API 로 보낸다 (이미지 모델은 대체 불가)
  const keys = getProviderKeys();
  const provider = providerOfModel(request.model);
  if (provider === 'anthropic') {
    throw new Error('Claude 모델은 이미지 생성을 지원하지 않습니다.');
  }
  if (provider && keys[provider]) {
    const direct = await generateImagesDirect(provider, keys[provider], {
      ...request,
      model: toDirectModelId(request.model),
    });
    return { images: direct.images, usage: direct.usage };
  }

  const cleanApiKey = resolveOpenRouterKey(apiKey) || keys.openrouter;
  if (!cleanApiKey) {
    const needed = provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : '해당 제공사';
    throw new Error(`이 모델을 쓰려면 설정에서 ${needed} API 키 또는 OpenRouter API 키를 입력하세요.`);
  }

  const body: Record<string, unknown> = {
    model: request.model,
    prompt: request.prompt,
  };
  if (request.aspectRatio) body.aspect_ratio = request.aspectRatio;
  if (request.resolution) body.resolution = request.resolution;
  if (request.quality) body.quality = request.quality;
  if (request.background) body.background = request.background;
  if (request.n && request.n > 1) body.n = request.n;
  if (request.inputReferences && request.inputReferences.length > 0) {
    body.input_references = request.inputReferences.map((img) => ({
      type: 'image_url',
      image_url: {
        url: img.startsWith('data:') ? img : `data:image/png;base64,${img}`,
      },
    }));
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/images`, {
    method: 'POST',
    headers: openrouterHeaders(cleanApiKey),
    body: JSON.stringify(body),
    signal: request.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('❌ OpenRouter Image API 오류:', response.status, errorText);
    throw new Error(`API 오류 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const items: unknown[] = Array.isArray(result?.data) ? result.data : [];
  const images: GeneratedImage[] = [];
  for (const item of items) {
    const entry = item as { b64_json?: unknown; media_type?: unknown };
    if (typeof entry?.b64_json === 'string' && entry.b64_json.length > 0) {
      images.push({
        base64: entry.b64_json,
        mediaType: typeof entry.media_type === 'string' ? entry.media_type : 'image/png',
      });
    }
  }

  if (images.length === 0) {
    throw new Error('OpenRouter 응답에서 이미지 데이터를 찾을 수 없습니다 (b64_json)');
  }

  return {
    images,
    usage: result?.usage && typeof result.usage === 'object' ? result.usage : undefined,
    id: typeof result?.id === 'string' ? result.id : undefined,
  };
}
