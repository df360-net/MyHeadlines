import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProviders, submitSetup } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { Rocket, Loader2 } from 'lucide-react';

export function Setup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: providerData } = useQuery({ queryKey: ['providers'], queryFn: getProviders });

  const [email, setEmail] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [setupDone, setSetupDone] = useState(false);

  const mutation = useMutation({
    mutationFn: submitSetup,
    onSuccess: () => setSetupDone(true),
  });

  const providers = providerData?.providers ?? [];
  const isCustom = selectedProvider === 'custom';
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      phone: '',
      email,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      aiProvider: selectedProvider,
      aiApiKey: apiKey,
      ...(isCustom ? { aiBaseUrl: customUrl, aiModel: customModel } : {}),
    });
  };

  // ── Post-Setup: Poll onboarding progress ──
  const { data: onboarding } = useQuery({
    queryKey: ['onboarding'],
    queryFn: () => fetch('/api/setup/onboarding').then((r) => r.json()),
    enabled: setupDone,
    refetchInterval: setupDone ? 2000 : false, // poll every 2s
  });

  const onboardingStep = onboarding?.step ?? 'idle';
  const onboardingMessage = onboarding?.message ?? '';
  const onboardingReady = onboardingStep === 'done';
  const onboardingError = onboardingStep === 'error';

  if (setupDone) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-blue-600 mb-4">MyHeadlines</h1>

          {onboardingError ? (
            <p className="text-red-500 text-sm mb-8">
              Something went wrong: {onboardingMessage}
            </p>
          ) : !onboardingReady ? (
            <>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Loader2 size={18} className="text-blue-500 animate-spin" />
                <p className="text-gray-600 text-lg">
                  {onboardingMessage || 'Setting up your profile...'}
                </p>
              </div>
              <p className="text-gray-400 text-sm mb-8">
                This takes about a minute. I'm learning your interests from your browser.
              </p>
            </>
          ) : (
            <p className="text-gray-600 text-lg mb-8">
              Your personalized news is ready!
            </p>
          )}

          <button
            disabled={!onboardingReady}
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['setupStatus'] });
              navigate('/');
            }}
            className={`px-6 py-3 font-semibold rounded-lg transition-colors ${
              onboardingReady
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            View Your Headlines
          </button>
        </div>
      </div>
    );
  }

  // ── Setup Form ──
  return (
    <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600 mb-2">MyHeadlines</h1>
          <p className="text-gray-500">Your personalized news digest, delivered daily.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AI Provider</label>
            <div className="space-y-2">
              {providers.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedProvider === p.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={p.id}
                    checked={selectedProvider === p.id}
                    onChange={() => setSelectedProvider(p.id)}
                    className="accent-blue-600"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-sm">{p.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{p.description}</span>
                  </div>
                  {p.keyUrl && (
                    <a
                      href={p.keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Get key
                    </a>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isCustom && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="model-name"
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Rocket size={18} />
                Start
              </>
            )}
          </button>

          {mutation.isError && (
            <p className="text-red-500 text-sm text-center">Setup failed. Please try again.</p>
          )}
        </form>
      </div>
    </div>
  );
}

