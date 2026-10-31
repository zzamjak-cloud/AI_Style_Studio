// Gemini/OpenAI 직접 API 클라이언트
// openrouter.ts 의 chatComplete·generateImagesViaOpenRouter 가 직접 키가 있을 때 이 모듈로 위임한다.
// 요청/응답 형태는 OpenRouter 경로와 같게 맞춰 호출부가 경로 차이를 모르게 한다.

import { logger } from '../logger';
import type { DirectProvider } from './providerKeys';

export const GEMINI_DIRECT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const OPENAI_DIRECT_BASE_URL = 'https://api.openai.com/v1';

/**
 * 텍스트/비전 요청의 원 모델 제공사 키가 없을 때 다른 직접 키로 대체할 모델.
 * 앱의 텍스트 모델(번역·분석)은 전부 Gemini 라서 OpenAI 키만 있는 경우에 필요하다.
 */
export const DIRECT_TEXT_FALLBACK_MODEL: Record<DirectProvider, string> = {
  gemini: 'gemini-3.8-flash',
  openai: 'gpt-5.6-luna',
};

interface ChatEndpoint {
  url: string;
  headers: Record<string, string>;
  /** 출력 토큰 한도 필드명 — OpenAI 최신 모델은 max_tokens 를 거부한다 */
  maxTokensField: 'max_tokens' | 'max_completion_tokens';
}

/** OpenAI 호환 chat/completions 엔드포인트 (Gemini 는 공식 OpenAI 호환 레이어 사용) */
export function directChatEndpoint(provider: DirectProvider, apiKey: string): ChatEndpoint {
  const headers = {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  };
  if (provider === 'gemini') {
    return {
      url: `${GEMINI_DIRECT_BASE_URL}/openai/chat/completions`,
      headers,
      maxTokensField: 'max_tokens',
    };
  }
  return {
    url: `${OPENAI_DIRECT_BASE_URL}/chat/completions`,
    headers,
    maxTokensField: 'max_completion_tokens',
  };
}

// ---------------------------------------------------------------------------
// 이미지 생성
// ---------------------------------------------------------------------------

export interface DirectImageRequest {
  model: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: string;
  background?: string;
  inputReferences?: string[];
  n?: number;
  signal?: AbortSignal;
}

export interface DirectImageResult {
  images: { base64: string; mediaType: string }[];
  usage?: Record<string, unknown>;
}

function splitDataUrl(input: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(input);
  if (match) return { mimeType: match[1] || 'image/png', data: match[2] };
  return { mimeType: 'image/png', data: input };
}

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

async function throwApiError(response: Response, label: string): Promise<never> {
  const errorText = await response.text();
  logger.error(`❌ ${label} 오류:`, response.status, errorText);
  // formatImageApiError 가 상태 코드를 읽는 형식을 OpenRouter 경로와 동일하게 유지
  throw new Error(`API 오류 (${response.status}): ${errorText}`);
}

/** Gemini generateContent 이미지 생성 (n 은 1 고정) */
async function generateGeminiImage(apiKey: string, req: DirectImageRequest): Promise<DirectImageResult> {
  const parts: Record<string, unknown>[] = (req.inputReferences ?? []).map((ref) => {
    const { mimeType, data } = splitDataUrl(ref);
    return { inline_data: { mime_type: mimeType, data } };
  });
  parts.push({ text: req.prompt });

  const imageConfig: Record<string, string> = {};
  if (req.aspectRatio) imageConfig.aspectRatio = req.aspectRatio;
  if (req.resolution) imageConfig.imageSize = req.resolution;

  const response = await fetch(`${GEMINI_DIRECT_BASE_URL}/models/${req.model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig },
    }),
    signal: req.signal,
  });
  if (!response.ok) await throwApiError(response, 'Gemini Image API');

  const result = await response.json();
  const blockReason: string | undefined = result?.promptFeedback?.blockReason;
  const candidate = result?.candidates?.[0];
  const outParts: unknown[] = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  const images = outParts
    .map((p) => (p as { inlineData?: { mimeType?: string; data?: string } }).inlineData)
    .filter((d): d is { mimeType?: string; data: string } => typeof d?.data === 'string' && d.data.length > 0)
    .map((d) => ({ base64: d.data, mediaType: d.mimeType || 'image/png' }));

  if (images.length === 0) {
    if (blockReason || candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'IMAGE_SAFETY') {
      throw new Error(`API 오류 (403): Gemini 안전 필터 차단 (${blockReason || candidate?.finishReason})`);
    }
    throw new Error(`Gemini 응답에서 이미지 데이터를 찾을 수 없습니다 (finishReason: ${candidate?.finishReason ?? '없음'})`);
  }
  return { images, usage: result?.usageMetadata };
}

/** 'W:H' 비율 → OpenAI Images API 표준 size */
function toOpenAISize(aspectRatio?: string): string {
  const [w, h] = (aspectRatio ?? '').split(':').map(Number);
  if (!w || !h) return 'auto';
  if (w === h) return '1024x1024';
  return w > h ? '1536x1024' : '1024x1536';
}

/** OpenRouter 품질 단계 → OpenAI 직접 API 품질 (xhigh/max 는 high 로 수렴) */
function toOpenAIQuality(quality?: string): string | undefined {
  if (!quality) return undefined;
  if (quality === 'xhigh' || quality === 'max') return 'high';
  return ['low', 'medium', 'high', 'auto'].includes(quality) ? quality : undefined;
}

/** OpenAI Images API — 참조가 있으면 edits(multipart), 없으면 generations */
async function generateOpenAIImage(apiKey: string, req: DirectImageRequest): Promise<DirectImageResult> {
  const fields: Record<string, string> = {
    model: req.model,
    prompt: req.prompt,
    size: toOpenAISize(req.aspectRatio),
  };
  const quality = toOpenAIQuality(req.quality);
  if (quality) fields.quality = quality;
  if (req.background) fields.background = req.background;
  if (req.n && req.n > 1) fields.n = String(req.n);

  const refs = req.inputReferences ?? [];
  const auth = { Authorization: `Bearer ${apiKey.trim()}` };
  let response: Response;

  if (refs.length > 0) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    refs.forEach((ref, index) => {
      const { mimeType, data } = splitDataUrl(ref);
      const ext = mimeType.split('/')[1] || 'png';
      form.append('image[]', base64ToBlob(data, mimeType), `reference-${index}.${ext}`);
    });
    response = await fetch(`${OPENAI_DIRECT_BASE_URL}/images/edits`, {
      method: 'POST',
      headers: auth,
      body: form,
      signal: req.signal,
    });
  } else {
    const body: Record<string, unknown> = { ...fields };
    if (req.n && req.n > 1) body.n = req.n;
    response = await fetch(`${OPENAI_DIRECT_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  }
  if (!response.ok) await throwApiError(response, 'OpenAI Image API');

  const result = await response.json();
  const mediaType = `image/${typeof result?.output_format === 'string' ? result.output_format : 'png'}`;
  const items: unknown[] = Array.isArray(result?.data) ? result.data : [];
  const images = items
    .map((item) => (item as { b64_json?: unknown }).b64_json)
    .filter((b64): b64 is string => typeof b64 === 'string' && b64.length > 0)
    .map((base64) => ({ base64, mediaType }));

  if (images.length === 0) {
    throw new Error('OpenAI 응답에서 이미지 데이터를 찾을 수 없습니다 (b64_json)');
  }
  return { images, usage: result?.usage };
}

export function generateImagesDirect(
  provider: DirectProvider,
  apiKey: string,
  req: DirectImageRequest
): Promise<DirectImageResult> {
  return provider === 'gemini' ? generateGeminiImage(apiKey, req) : generateOpenAIImage(apiKey, req);
}
