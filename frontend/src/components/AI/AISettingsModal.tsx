import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Server,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';
import type { AIProvider, AISettings, AIProvidersInfo } from '../../types';
import {
  getStoredAISettings,
  setStoredAISettings,
  testAIConnection,
  fetchProviderModels,
  getAIProviders,
  DEFAULT_AI_SETTINGS,
} from '../../api/client';

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (settings: AISettings) => void;
}

const CLOUD_MODELS: Record<string, { id: string; name: string }[]> = {
  gemini: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Fast & Recommended - Default)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Deep Research & Reasoning)' },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Next-Gen Production)' },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite (Ultra-Fast)' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Legacy)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Legacy)' },
  ],
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast & Cost-Effective)' },
    { id: 'gpt-4o', name: 'GPT-4o (Flagship Multimodal)' },
    { id: 'o3-mini', name: 'o3-mini (STEM & Math Reasoning)' },
    { id: 'o1', name: 'o1 (Advanced Deep Reasoning)' },
    { id: 'o1-mini', name: 'o1-mini (Fast Reasoning)' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet (Latest / SOTA)' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku (Fast & Lean)' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Hybrid Reasoning)' },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (Frontier)' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Legacy Oct 2024)' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Legacy Oct 2024)' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Ultra-Fast & Versatile)' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B (Fast Reasoning)' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Instant Response)' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Large Context)' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek-V3 (Chat & Academic QA)' },
    { id: 'deepseek-reasoner', name: 'DeepSeek-R1 (Chain-of-Thought Reasoning)' },
  ],
};

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<AISettings>(getStoredAISettings());
  const [providersInfo, setProvidersInfo] = useState<AIProvidersInfo | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [scanningOllama, setScanningOllama] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [liveModels, setLiveModels] = useState<Record<string, { id: string; name: string }[]>>({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [customModelMode, setCustomModelMode] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const current = getStoredAISettings();
      setSettings(current);
      setTestResult(null);
      detectOllama(current.ollamaUrl);
      getAIProviders().then((info) => {
        setProvidersInfo(info);
      }).catch((e) => console.warn('Could not fetch AI providers info:', e));
    }
  }, [isOpen]);

  const detectOllama = async (url = settings.ollamaUrl) => {
    setScanningOllama(true);
    try {
      const res = await testAIConnection('ollama', undefined, undefined, url);
      if (res.success && res.models && res.models.length > 0) {
        setOllamaModels(res.models);
        setOllamaStatus('connected');
        if (!settings.model && settings.provider === 'ollama') {
          setSettings((prev) => ({ ...prev, model: res.models![0] }));
        }
      } else {
        setOllamaStatus('error');
      }
    } catch {
      setOllamaStatus('error');
    } finally {
      setScanningOllama(false);
    }
  };

  const handleFetchModels = async (provider = settings.provider, apiKey = settings.apiKey) => {
    setFetchingModels(true);
    try {
      const res = await fetchProviderModels(provider, apiKey || undefined, settings.ollamaUrl);
      if (res.success && res.models && res.models.length > 0) {
        setLiveModels((prev) => ({
          ...prev,
          [provider]: res.models,
        }));
        // Auto-select first model if current is invalid
        const hasCurrent = res.models.some((m) => m.id === settings.model);
        if (!hasCurrent && !customModelMode) {
          setSettings((prev) => ({ ...prev, model: res.models[0].id }));
        }
      }
    } catch (e: any) {
      console.warn('Failed to fetch live models:', e);
    } finally {
      setFetchingModels(false);
    }
  };

  if (!isOpen) return null;

  const isLocal = settings.provider === 'ollama';

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await testAIConnection(
        settings.provider,
        settings.apiKey || undefined,
        settings.model,
        settings.ollamaUrl
      );
      setTestResult({ success: res.success, message: res.message });
      if (res.models && res.models.length > 0) {
        if (settings.provider === 'ollama') {
          setOllamaModels(res.models);
        }
        const mappedModels = res.models.map((m: string) => ({ id: m, name: m }));
        setLiveModels((prev) => ({
          ...prev,
          [settings.provider]: mappedModels,
        }));
        // Auto-select recommended model if current was rejected or unsupported
        const currentValid = res.models.includes(settings.model);
        if (!currentValid && !customModelMode) {
          const firstGood =
            res.models.find(
              (m: string) =>
                m.includes('2.5-flash') ||
                m.includes('2.0-flash') ||
                m.includes('flash') ||
                m.includes('4o-mini') ||
                m.includes('sonnet')
            ) || res.models[0];
          setSettings((prev) => ({ ...prev, model: firstGood }));
        }
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e?.message || 'Connection test failed' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSave = () => {
    setStoredAISettings(settings);
    if (onSettingsSaved) {
      onSettingsSaved(settings);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-sm">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">AI Engine & Model Settings</h2>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                    providersInfo?.environment === 'local'
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  }`}
                  title={providersInfo?.environment === 'local' ? 'Environment: LOCAL (defaults to local Ollama)' : 'Environment: PROD (defaults to cloud API keys path)'}
                >
                  ENV: {providersInfo?.environment || 'PROD'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">Configure Local Ollama or Bring-Your-Own-Key (BYOK) Cloud AI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Environment Switcher: Local vs Cloud */}
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
              Inference Environment
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Local Ollama Option */}
              <button
                type="button"
                onClick={() => {
                  setSettings((prev) => ({
                    ...prev,
                    provider: 'ollama',
                    model: ollamaModels[0] || prev.model,
                  }));
                  setTestResult(null);
                }}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  isLocal
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'
                }`}
              >
                <div className={`p-2 rounded-lg ${isLocal ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Local (Ollama)</span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Free & Offline
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">Runs on your hardware via localhost:11434</p>
                </div>
              </button>

              {/* Cloud BYOK Option */}
              <button
                type="button"
                onClick={() => {
                  setSettings((prev) => ({
                    ...prev,
                    provider: prev.provider === 'ollama' ? 'gemini' : prev.provider,
                    model: prev.provider === 'ollama' ? 'gemini-2.5-flash' : prev.model,
                  }));
                  setTestResult(null);
                }}
                className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                  !isLocal
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'
                }`}
              >
                <div className={`p-2 rounded-lg ${!isLocal ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-gray-900 dark:text-gray-100">Cloud (BYOK)</span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                      High Accuracy
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">Google Gemini, OpenAI, or Groq</p>
                </div>
              </button>
            </div>
          </div>

          {/* Local Ollama Settings */}
          {isLocal ? (
            <div className="space-y-3.5 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-indigo-500" />
                  Ollama Configuration
                </span>
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    ollamaStatus === 'connected'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {ollamaStatus === 'connected' ? (
                    <>
                      <CheckCircle2 className="w-3 h-3" /> Ollama Running
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3" /> Not Detected
                    </>
                  )}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">Ollama Base URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.ollamaUrl}
                    onChange={(e) => setSettings({ ...settings, ollamaUrl: e.target.value })}
                    placeholder="http://localhost:11434"
                    className="flex-1 text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => detectOllama(settings.ollamaUrl)}
                    disabled={scanningOllama}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 flex items-center gap-1.5 transition"
                  >
                    {scanningOllama ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    <span>Scan</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">Active Local Model</label>
                {ollamaModels.length > 0 ? (
                  <select
                    value={settings.model || ollamaModels[0]}
                    onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                    className="w-full text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono"
                  >
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                    <p className="font-semibold">No models detected on Ollama.</p>
                    <p className="text-[10px] mt-0.5">
                      Run <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">ollama pull qwen2.5:3b</code> or{' '}
                      <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">ollama pull llama3.2</code> in your terminal.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Cloud BYOK Settings */
            <div className="space-y-3.5 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-500" />
                  Bring Your Own Key (Client-Side Privacy)
                </span>
                <span className="text-[10px] text-gray-400">Stored safely in your browser</span>
              </div>

              {/* Provider Radio Tabs */}
              <div>
                <label className="text-[11px] font-medium text-gray-500 block mb-1">Cloud Provider</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'gemini', label: 'Google Gemini', badge: 'Free Tier' },
                    { id: 'openai', label: 'OpenAI', badge: 'GPT-4o' },
                    { id: 'anthropic', label: 'Anthropic', badge: 'Claude 3.5' },
                    { id: 'groq', label: 'Groq', badge: 'Ultra-Fast' },
                    { id: 'deepseek', label: 'DeepSeek', badge: 'Reasoning' },
                  ].map((p) => {
                    const hasEnvKey = providersInfo?.server_configured_providers?.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          const defaultM = CLOUD_MODELS[p.id]?.[0]?.id || '';
                          setSettings({
                            ...settings,
                            provider: p.id as AIProvider,
                            model: defaultM,
                          });
                          setTestResult(null);
                        }}
                        className={`p-2 rounded-lg border text-center transition ${
                          settings.provider === p.id
                            ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                        }`}
                      >
                        <div className="text-xs">{p.label}</div>
                        <div className="text-[9px] text-gray-400 font-normal flex items-center justify-center gap-1 mt-0.5">
                          <span>{p.badge}</span>
                          {hasEnvKey && (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">• .env</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* API Key Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-gray-500">
                    {settings.provider.toUpperCase()} API Key
                  </label>
                  {settings.provider === 'gemini' && (
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      <span>Get free Gemini key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                  {settings.provider === 'anthropic' && (
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      <span>Get Anthropic key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                  {settings.provider === 'deepseek' && (
                    <a
                      href="https://platform.deepseek.com/api_keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      <span>Get DeepSeek key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                  {settings.provider === 'groq' && (
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      <span>Get Groq key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                  {settings.provider === 'openai' && (
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                    >
                      <span>OpenAI platform</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.apiKey}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                    placeholder={
                      providersInfo?.server_configured_providers?.includes(settings.provider)
                        ? `(Using key from backend/.env - or enter key to override)`
                        : `Enter your ${settings.provider} API key...`
                    }
                    className="w-full text-xs p-2 pr-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {providersInfo?.server_configured_providers?.includes(settings.provider) && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                    <span>Key detected in <code>backend/.env</code>. You can test it directly or enter a new one above.</span>
                  </p>
                )}
              </div>

              {/* Model selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-medium text-gray-500">Target Model</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleFetchModels()}
                      disabled={fetchingModels || (!settings.apiKey && !providersInfo?.server_configured_providers?.includes(settings.provider))}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 disabled:opacity-40"
                      title="Fetch live models authorized for your API key directly from the provider"
                    >
                      <RefreshCw className={`w-3 h-3 ${fetchingModels ? 'animate-spin' : ''}`} />
                      <span>{fetchingModels ? 'Fetching...' : 'Fetch Live Models'}</span>
                    </button>
                    <span className="text-gray-300 dark:text-gray-700">•</span>
                    <button
                      type="button"
                      onClick={() => setCustomModelMode(!customModelMode)}
                      className="text-[10px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 underline"
                    >
                      {customModelMode ? 'Use Presets' : 'Custom Model ID'}
                    </button>
                  </div>
                </div>

                {customModelMode ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={settings.model}
                      onChange={(e) => setSettings({ ...settings, model: e.target.value.trim() })}
                      placeholder={`e.g. ${CLOUD_MODELS[settings.provider]?.[0]?.id || 'custom-model-name'}`}
                      className="w-full text-xs p-2 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-gray-400">
                      Enter any custom, preview, or fine-tuned model ID supported by your account.
                    </p>
                  </div>
                ) : (
                  <select
                    value={settings.model}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setCustomModelMode(true);
                      } else {
                        setSettings({ ...settings, model: e.target.value });
                      }
                    }}
                    className="w-full text-xs p-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    {liveModels[settings.provider] && liveModels[settings.provider].length > 0 ? (
                      <>
                        <optgroup label="✨ Live Models Authorized for Your Key">
                          {liveModels[settings.provider].map((m) => (
                            <option key={`live-${m.id}`} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="Standard Presets">
                          {(CLOUD_MODELS[settings.provider] || []).map((m) => (
                            <option key={`preset-${m.id}`} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </optgroup>
                      </>
                    ) : (
                      (CLOUD_MODELS[settings.provider] || []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))
                    )}
                    <option value="__custom__">➕ Enter Custom Model ID...</option>
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Test Connection Button & Status */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={
                testingConnection ||
                (!isLocal && !settings.apiKey && !providersInfo?.server_configured_providers?.includes(settings.provider))
              }
              className="w-full py-2 rounded-xl text-xs font-semibold border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 disabled:opacity-40 transition flex items-center justify-center gap-2"
            >
              {testingConnection ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying connection...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Test Connection & Verify Model</span>
                </>
              )}
            </button>

            {testResult && (
              <div
                className={`mt-2.5 p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                )}
                <span className="leading-snug">{testResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              setSettings(DEFAULT_AI_SETTINGS);
              setTestResult(null);
            }}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Reset to Default
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
