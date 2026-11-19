// Anthropic(Claude) 직접 API 클라이언트 — 텍스트/비전 전용
// openrouter.ts 의 chatComplete 가 Claude 모델 + Anthropic 키일 때 이 모듈로 위임한다.
// 입력은 chat/completions 형식(ChatMessageInput)이라 Messages API 형식으로 바꿔 보내고,
// 결과·오류는 OpenRouter 경로와 같은 문자열/메시지 규약으로 돌려준다.

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger';
import type { ChatMessageInput } from './openrouter';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
const SUPPORTED_IMAGE_TYPES: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

let cachedClient: { key: string; client: Anthropic } | null = null;

function getClient(apiKey: string): Anthropic {
  const key = apiKey.trim();
  if (cachedClient?.key === key) return cachedClient.client;
  // 데스크톱 앱 웹뷰에서 사용자 본인 키로 직접 호출하므로 브라우저 사용을 허용한다
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  cachedClient = { key, client };
  return client;
}

function toImageBlock(url: string): Anthropic.Beta.BetaImageBlockParam {
  if (!url.startsWith('data:')) {
    return { type: 'image', source: { type: 'url', url } };
  }
  const match = /^data:([^;,]+)?(?:;[^;,]*)*;base64,(.*)$/s.exec(url);
  if (!match) {
    throw new Error('이미지 데이터 형식을 읽을 수 없습니다 (base64 data URL 이 아님).');
  }
  const mime = (match[1] || 'image/png').toLowerCase().replace('image/jpg', 'image/jpeg');
  if (!SUPPORTED_IMAGE_TYPES.includes(mime as ImageMediaType)) {
    throw new Error(`Claude 는 ${mime} 이미지를 지원하지 않습니다 (PNG·JPEG·GIF·WebP 만 가능).`);
  }
  return { type: 'image', source: { type: 'base64', media_type: mime as ImageMediaType, data: match[2] } };
}

/** chat/completions 메시지 → Messages API 의 system + messages */
function toAnthropicMessages(messages: ChatMessageInput[]): {
  system: string | undefined;
  messages: Anthropic.Beta.BetaMessageParam[];
} {
  const systemParts: string[] = [];
  const out: Anthropic.Beta.BetaMessageParam[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
      if (text.trim()) systemParts.push(text);
      continue;
    }
    const parts = typeof message.content === 'string' ? [{ type: 'text' as const, text: message.content }] : message.content;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const part of parts) {
      // Messages API 는 빈 text 블록과 assistant 턴의 이미지를 400 으로 거절한다
      if (part.type === 'text') {
        if (part.text.trim()) content.push({ type: 'text', text: part.text });
      } else if (message.role === 'user') {
        content.push(toImageBlock(part.image_url.url));
      }
    }
    if (content.length > 0) out.push({ role: message.role, content });
  }

  return { system: systemParts.length ? systemParts.join('\n\n') : undefined, messages: out };
}

/**
 * Claude Messages API 호출 후 텍스트만 반환.
 * 큰 max_tokens 에서 HTTP 타임아웃을 피하려고 스트리밍 후 최종 메시지만 받는다.
 */
export async function anthropicChatComplete(
  apiKey: string,
  params: { model: string; messages: ChatMessageInput[]; maxTokens?: number }
): Promise<string> {
  const { system, messages } = toAnthropicMessages(params.messages);

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await getClient(apiKey)
      .beta.messages.stream({
        model: params.model,
        max_tokens: params.maxTokens ?? 16000,
        ...(system ? { system } : {}),
        messages,
        // 안전 분류기 오탐으로 거절되면 서버가 거절 범주에 맞는 모델로 같은 요청을 다시 실행한다.
        // Haiku 는 서버 측 대체를 지원하지 않아 보내지 않는다
        ...(params.model.startsWith('claude-haiku')
          ? {}
          : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
      })
      .finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionError) {
      logger.error('❌ Anthropic 연결 오류:', error.message);
      throw new Error(`Claude API 에 연결할 수 없습니다 (네트워크·시간 초과): ${error.message}`);
    }
    if (error instanceof Anthropic.APIError) {
      logger.error('❌ Anthropic API 오류:', error.status, error.message);
      // apiErrorHandler 가 상태 코드를 읽는 형식을 다른 경로와 동일하게 유지
      throw new Error(`API 오류 (${error.status ?? 500}): ${error.message}`);
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('요청이 콘텐츠 필터에 의해 차단되었습니다. 다른 이미지나 프롬프트로 시도해주세요.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      '응답이 출력 토큰 한도에 걸려 잘렸습니다. 참조 이미지 수나 입력을 줄이고 다시 시도해주세요.'
    );
  }

  const text = response.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  if (!text) {
    throw new Error('API 응답에 텍스트가 없습니다. 다시 시도해주세요.');
  }
  return text;
}
