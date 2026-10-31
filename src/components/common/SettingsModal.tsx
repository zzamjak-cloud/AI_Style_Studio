import { memo, useState, useEffect } from 'react';
import { X, Key, FolderOpen, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { openPath, openUrl } from '@tauri-apps/plugin-opener';
import { getVersion } from '@tauri-apps/api/app';
import { getAiGenRoot } from '../../lib/config/paths';
import { McpSettingsSection } from './McpSettingsSection';
import { hasAnyApiKey, type ProviderKeys } from '../../lib/api/providerKeys';

// 제공사별 키 입력 필드 정의
const KEY_FIELDS: {
  id: keyof ProviderKeys;
  label: string;
  placeholder: string;
  url: string;
  linkLabel: string;
  help: string;
}[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter API Key',
    placeholder: 'sk-or-...',
    url: 'https://openrouter.ai/settings/keys',
    linkLabel: 'OpenRouter',
    help: '통합 키 하나로 Gemini/OpenAI 모델을 모두 사용합니다.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini API Key',
    placeholder: 'AIza...',
    url: 'https://aistudio.google.com/apikey',
    linkLabel: 'Google AI Studio',
    help: 'Gemini 모델(이미지·분석·번역)을 Google API로 직접 호출합니다.',
  },
  {
    id: 'openai',
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    url: 'https://platform.openai.com/api-keys',
    linkLabel: 'OpenAI Platform',
    help: 'GPT Image 모델을 OpenAI API로 직접 호출합니다.',
  },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentKeys: ProviderKeys;
  onSave: (keys: ProviderKeys) => void;
}

export const SettingsModal = memo(function SettingsModal({
  isOpen,
  onClose,
  currentKeys,
  onSave,
}: SettingsModalProps) {
  const [keys, setKeys] = useState<ProviderKeys>(currentKeys);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    setKeys(currentKeys);
  }, [currentKeys]);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion('0.0.0'));
  }, []);

  const handleSave = () => {
    const trimmed: ProviderKeys = {
      openrouter: keys.openrouter.trim(),
      gemini: keys.gemini.trim(),
      openai: keys.openai.trim(),
    };
    if (hasAnyApiKey(trimmed)) {
      onSave(trimmed);
      setSaveNotification('설정이 저장되었습니다');
      setTimeout(() => {
        setSaveNotification(null);
        onClose();
      }, 1500);
    } else {
      alert('API Key를 하나 이상 입력해주세요');
    }
  };

  // AI_Gen 루트 폴더 열기
  const handleOpenFolder = async () => {
    try {
      const root = await getAiGenRoot();
      await openPath(root);
    } catch (error) {
      console.error('폴더 열기 실패:', error);
      alert('폴더를 열지 못했습니다.');
    }
  };

  // 외부 링크를 기본 브라우저로 열기
  const handleOpenUrl = async (url: string) => {
    try {
      await openUrl(url);
    } catch (error) {
      console.error('링크 열기 실패:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Key size={20} className="text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">설정</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
          {/* API Key 설정 — 하나 이상 입력. 직접 키가 있으면 해당 제공사 모델은 직접 호출 */}
          <div className="space-y-4">
            {KEY_FIELDS.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {field.label}
                </label>
                <input
                  type="password"
                  value={keys[field.id]}
                  onChange={(e) => setKeys((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenUrl(field.url)}
                    className="text-purple-600 hover:underline"
                  >
                    {field.linkLabel}
                  </button>
                  에서 발급. {field.help}
                </p>
              </div>
            ))}
            <p className="text-xs text-gray-500 p-3 bg-gray-50 border border-gray-200 rounded-lg leading-relaxed">
              키는 하나 이상 입력하면 됩니다. Gemini/OpenAI 키가 있으면 해당 모델은 직접 API를 우선 사용하고,
              없으면 OpenRouter 키로 호출합니다. 번역·분석은 Gemini 키(또는 OpenRouter)가 없으면 OpenAI 텍스트 모델로 대체됩니다.
            </p>
          </div>

          {/* 생성 이미지 저장 위치 안내 (v0.4.4) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              생성 이미지 저장 위치
            </label>
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <p className="text-sm text-gray-700">
                  <code className="text-xs bg-white px-1 py-0.5 rounded">~/Downloads/AI_Gen/</code>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  세션별 하위 폴더에 자동 저장됩니다
                </p>
              </div>
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700"
              >
                <FolderOpen size={14} />
                폴더 열기
              </button>
            </div>
          </div>

          {/* AI 에이전트 연동 (MCP) */}
          <McpSettingsSection />

          {/* 정보 및 라이선스 (GPL-3.0 §5d 고지) */}
          <div>
            <button
              onClick={() => setShowAbout((prev) => !prev)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-purple-600 transition-colors"
            >
              <Info size={16} />
              정보 및 라이선스
              {showAbout ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {showAbout && (
              <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                <p className="text-sm font-medium text-gray-800">
                  AI Style Studio <span className="text-gray-500 font-normal">v{version}</span>
                </p>
                <p className="text-xs text-gray-600">
                  Copyright &copy; 2026 최진평 (Jinpyoung Choi)
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  이 프로그램은 자유 소프트웨어이며 <strong>GNU General Public License v3.0 이상</strong>
                  조건으로 배포됩니다. 이 프로그램에는 <strong>어떠한 보증도 없습니다.</strong> 라이선스
                  조건에 따라 재배포하거나 수정할 수 있습니다.
                </p>
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    onClick={() => handleOpenUrl('https://www.gnu.org/licenses/gpl-3.0.html')}
                    className="text-xs text-purple-600 hover:underline text-left"
                  >
                    GNU GPL v3.0 전문 보기
                  </button>
                  <button
                    onClick={() => handleOpenUrl('https://github.com/zzamjak-cloud/AI_Style_Studio')}
                    className="text-xs text-purple-600 hover:underline text-left"
                  >
                    소스 코드 (GitHub)
                  </button>
                  <button
                    onClick={() =>
                      handleOpenUrl(
                        'https://github.com/zzamjak-cloud/AI_Style_Studio/blob/main/THIRD-PARTY-NOTICES.md'
                      )
                    }
                    className="text-xs text-purple-600 hover:underline text-left"
                  >
                    서드파티 라이선스 고지
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 저장 알림 */}
        {saveNotification && (
          <div className="mx-6 mb-4 px-4 py-2 bg-green-100 text-green-700 rounded-lg text-sm text-center">
            {saveNotification}
          </div>
        )}

        {/* 푸터 */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200">
          <span className="text-xs text-gray-400">v{version}</span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
