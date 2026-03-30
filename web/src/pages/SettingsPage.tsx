import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings, getProviders } from '../lib/api';
import { Save, Check, Trash2, AlertTriangle } from 'lucide-react';

export function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const { data: providerData } = useQuery({
    queryKey: ['providers'],
    queryFn: getProviders,
  });

  const providers = providerData?.providers ?? [];

  const [formOverrides, setFormOverrides] = useState<Record<string, string> | null>(null);
  const form = formOverrides ?? settings ?? {};
  const setForm = (v: Record<string, string>) => setFormOverrides(v);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: Record<string, string>) => updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) {
    return <div className="text-center text-gray-500 py-12">Loading settings...</div>;
  }

  const handleSave = () => mutation.mutate(form);

  const selectedProvider = form.ai_provider ?? 'openai';
  const isCustom = selectedProvider === 'custom';

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find((p: { id: string }) => p.id === providerId);
    if (provider && providerId !== 'custom') {
      setForm({
        ...form,
        ai_provider: providerId,
        ai_base_url: provider.baseUrl,
        ai_model: provider.defaultModel,
      });
    } else {
      setForm({ ...form, ai_provider: providerId });
    }
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Settings</h2>

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        <Section title="Notifications">
          <Field label="Phone number" value={form.phone ?? ''} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="Email" value={form.email ?? ''} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Timezone" value={form.timezone ?? ''} onChange={(v) => setForm({ ...form, timezone: v })} />
        </Section>

        <Section title="AI Provider">
          <div className="space-y-2 mb-4">
            {providers.map((p: { id: string; name: string; description: string; keyUrl: string }) => (
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
                  onChange={() => handleProviderChange(p.id)}
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

          <Field label="API Key" value={form.ai_api_key ?? ''} onChange={(v) => setForm({ ...form, ai_api_key: v })} type="password" />

          {isCustom && (
            <>
              <Field label="Base URL" value={form.ai_base_url ?? ''} onChange={(v) => setForm({ ...form, ai_base_url: v })} />
              <Field label="Model" value={form.ai_model ?? ''} onChange={(v) => setForm({ ...form, ai_model: v })} />
            </>
          )}
        </Section>
      </div>

      <div className="mt-4 flex items-stretch gap-4">
        <button
          onClick={handleSave}
          disabled={mutation.isPending}
          aria-label={saved ? 'Settings saved' : 'Save settings'}
          className="flex items-center justify-center gap-2 px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0"
        >
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>

        <ResetDatabase />
      </div>
    </div>
  );
}

function ResetDatabase() {
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () =>
      fetch('/api/admin/reset', { method: 'POST' }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.clear(); // Wipe all cached data before navigating
      window.location.href = '/setup';
    },
  });

  return (
    <div className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2 flex-1">
      {!confirmReset ? (
        <>
          <button
            onClick={() => setConfirmReset(true)}
            aria-label="Reset database"
            className="flex items-center gap-2 px-3 py-1.5 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium shrink-0"
          >
            <Trash2 size={14} />
            Reset Database
          </button>
          <p className="text-xs text-gray-400">
            Delete all data and start fresh. This removes all headlines, interests, settings, and history.
          </p>
        </>
      ) : (
        <div className="flex items-center gap-3 flex-1">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <span className="text-sm text-red-700 flex-1">Are you sure? This cannot be undone.</span>
          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {resetMutation.isPending ? 'Resetting...' : 'Yes, Reset'}
          </button>
          <button
            onClick={() => setConfirmReset(false)}
            className="px-3 py-1.5 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-28 text-sm text-gray-600 shrink-0">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
