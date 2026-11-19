// AI 제공사별 API 키 레지스트리
// 앱 전역에 흐르는 `apiKey` prop 은 "키가 하나라도 있는가" 판단과 OpenRouter 키 전달에만 쓰고,
// Gemini/OpenAI/Anthropic 직접 키는 여기 보관해 공통 클라이언트(openrouter.ts)가 모델별로 경로를 고른다.
// 이렇게 하면 수십 개 호출부의 시그니처를 바꾸지 않고 직접 키를 지원할 수 있다.

export interface ProviderKeys {
  openrouter: string;
  gemini: string;
  openai: string;
  anthropic: string;
  /** Claude 키만 있을 때 번역 등 텍스트 요청을 대신 처리할 Claude 모델(직접 API ID). 키는 아니지만 같은 경로로 저장·전달된다 */
  anthropicTextModel: string;
}

/** 텍스트 대체용으로 고를 수 있는 Claude 모델 (직접 API ID) */
export const CLAUDE_TEXT_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', description: '최고 품질 · 고비용' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', description: '균형형' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', description: '빠르고 저렴' },
] as const;

export const DEFAULT_CLAUDE_TEXT_MODEL = CLAUDE_TEXT_MODELS[0].id;

/** 저장값이 목록에 없으면(빈 값·구버전) 기본 모델로 */
export function normalizeClaudeTextModel(model: string | undefined): string {
  const clean = (model ?? '').trim();
  return CLAUDE_TEXT_MODELS.some((m) => m.id === clean) ? clean : DEFAULT_CLAUDE_TEXT_MODEL;
}

/** OpenAI 호환 chat/completions·이미지 생성이 가능한 직접 제공사 */
export type DirectProvider = 'gemini' | 'openai';

/** 직접 키를 받는 모든 제공사 — Anthropic 은 텍스트/비전 전용(Messages API) */
export type KeyedProvider = DirectProvider | 'anthropic';

/**
 * OpenRouter 키 없이 직접 키만 있을 때 앱의 `apiKey` 자리에 넣는 표식.
 * 호출부의 `!apiKey` 가드를 통과시키기 위한 값이며, 실제 Bearer 로 전송되지 않는다.
 */
export const DIRECT_KEYS_ONLY_MARKER = '__direct_provider_keys__';

export const EMPTY_PROVIDER_KEYS: ProviderKeys = {
  openrouter: '',
  gemini: '',
  openai: '',
  anthropic: '',
  anthropicTextModel: DEFAULT_CLAUDE_TEXT_MODEL,
};

let registry: ProviderKeys = { ...EMPTY_PROVIDER_KEYS };

export function setProviderKeys(keys: Partial<ProviderKeys>): void {
  registry = {
    openrouter: (keys.openrouter ?? registry.openrouter).trim(),
    gemini: (keys.gemini ?? registry.gemini).trim(),
    openai: (keys.openai ?? registry.openai).trim(),
    anthropic: (keys.anthropic ?? registry.anthropic).trim(),
    anthropicTextModel: normalizeClaudeTextModel(keys.anthropicTextModel ?? registry.anthropicTextModel),
  };
}

export function getProviderKeys(): ProviderKeys {
  return { ...registry };
}

export function hasAnyApiKey(keys: ProviderKeys): boolean {
  return !!(keys.openrouter.trim() || keys.gemini.trim() || keys.openai.trim() || keys.anthropic.trim());
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

/** OpenRouter 슬러그(`google/…`, `openai/…`, `anthropic/…`)의 원 제공사 */
export function providerOfModel(model: string): KeyedProvider | null {
  if (model.startsWith('google/')) return 'gemini';
  if (model.startsWith('openai/')) return 'openai';
  if (model.startsWith('anthropic/')) return 'anthropic';
  return null;
}

/**
 * OpenRouter 슬러그 → 제공사 직접 API 모델 ID.
 * Anthropic 은 표기가 달라(`claude-opus-5.5` ↔ `claude-opus-5-5`) 접두사 제거만으로는 안 된다.
 */
export function toDirectModelId(model: string): string {
  const slash = model.indexOf('/');
  const bare = slash >= 0 ? model.slice(slash + 1) : model;
  return model.startsWith('anthropic/') ? bare.replace(/\./g, '-') : bare;
}
