// AI 제공사별 API 키 레지스트리
// 앱 전역에 흐르는 `apiKey` prop 은 "키가 하나라도 있는가" 판단과 OpenRouter 키 전달에만 쓰고,
// Gemini/OpenAI 직접 키는 여기 보관해 공통 클라이언트(openrouter.ts)가 모델별로 경로를 고른다.
// 이렇게 하면 수십 개 호출부의 시그니처를 바꾸지 않고 직접 키를 지원할 수 있다.

export interface ProviderKeys {
  openrouter: string;
  gemini: string;
  openai: string;
}

export type DirectProvider = 'gemini' | 'openai';

/**
 * OpenRouter 키 없이 직접 키만 있을 때 앱의 `apiKey` 자리에 넣는 표식.
 * 호출부의 `!apiKey` 가드를 통과시키기 위한 값이며, 실제 Bearer 로 전송되지 않는다.
 */
export const DIRECT_KEYS_ONLY_MARKER = '__direct_provider_keys__';

let registry: ProviderKeys = { openrouter: '', gemini: '', openai: '' };

export function setProviderKeys(keys: Partial<ProviderKeys>): void {
  registry = {
    openrouter: (keys.openrouter ?? registry.openrouter).trim(),
    gemini: (keys.gemini ?? registry.gemini).trim(),
    openai: (keys.openai ?? registry.openai).trim(),
  };
}

export function getProviderKeys(): ProviderKeys {
  return { ...registry };
}

export function hasAnyApiKey(keys: ProviderKeys): boolean {
  return !!(keys.openrouter.trim() || keys.gemini.trim() || keys.openai.trim());
}

/** 앱 상태에 둘 `apiKey` 값: OpenRouter 키 우선, 없고 직접 키만 있으면 표식 */
export function toAppApiKey(keys: ProviderKeys): string {
  if (keys.openrouter.trim()) return keys.openrouter.trim();
  return hasAnyApiKey(keys) ? DIRECT_KEYS_ONLY_MARKER : '';
}

/** 인자로 받은 `apiKey` 에서 실제 OpenRouter 키만 추출 (표식이면 빈 값) */
export function resolveOpenRouterKey(apiKey: string): string {
  const clean = String(apiKey || '').trim();
  if (!clean || clean === DIRECT_KEYS_ONLY_MARKER) return '';
  return clean;
}

/** OpenRouter 슬러그(`google/…`, `openai/…`)의 원 제공사 */
export function providerOfModel(model: string): DirectProvider | null {
  if (model.startsWith('google/')) return 'gemini';
  if (model.startsWith('openai/')) return 'openai';
  return null;
}

/** OpenRouter 슬러그 → 제공사 직접 API 모델 ID (접두사 제거) */
export function toDirectModelId(model: string): string {
  const slash = model.indexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}
