const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Headlines
export const getHeadlines = (offset = 0, limit = 20, topicId: string | number = '', exclude = '') => {
  let params = `offset=${offset}&limit=${limit}`;
  if (topicId) params += `&topicId=${topicId}`;
  if (exclude) params += `&exclude=${exclude}`;
  return request<{ headlines: Headline[]; total: number }>(`/headlines?${params}`);
};

export const getCategories = () =>
  request<{ fixedCategories: Category[]; categories: Category[] }>('/headlines/categories');

export const sendFeedback = (id: string, feedback: 'up' | 'down' | 'none') =>
  request(`/headlines/${id}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });

// Profile
export const getProfile = () =>
  request<{ interests: Interest[]; total: number }>('/profile');

export const adjustTopic = (topicId: number, action: 'more' | 'less' | 'block') =>
  request(`/profile/topics/${topicId}`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });

// Settings
export const getSettings = () => request<Record<string, string>>('/settings');

export const updateSettings = (settings: Record<string, string>) =>
  request('/settings', { method: 'PUT', body: JSON.stringify(settings) });

// Setup
export const getSetupStatus = () =>
  request<{ isSetupComplete: boolean }>('/setup/status');

export const getProviders = () =>
  request<{ providers: Provider[] }>('/setup/providers');

export const submitSetup = (data: SetupData) =>
  request('/setup', { method: 'POST', body: JSON.stringify(data) });

// Jobs
export const getJobs = () => request<{ jobs: Job[] }>('/jobs');

export const getJobRuns = (code: string, limit = 10) =>
  request<{ runs: JobRun[] }>(`/jobs/${code}/runs?limit=${limit}`);

export const triggerJob = (code: string) =>
  request(`/jobs/${code}/trigger`, { method: 'POST' });

// Digest
export const getDigestHistory = () =>
  request<{ digests: Digest[] }>('/digest/history');

export const sendDigestNow = () =>
  request('/digest/send', { method: 'POST' });

// Briefing
export const getBriefing = (refresh = false) =>
  request<DailyBriefing>(`/briefing${refresh ? '?refresh=true' : ''}`);

// Types
export interface Headline {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  topics: string;
  category: string | null;
  sourceName: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  score: number | null;
  feedback: string | null;
}

export interface Category {
  id: number;
  name: string;
  displayName: string;
  count: number;
  isInterest: boolean;
}

export interface Interest {
  topicId: number | null;
  topic: string;
  displayName: string;
  weight: number;
  rawWeight: number;
  confidence: number;
  source: string;
  interactionCount: number;
}

export interface Provider {
  id: string;
  name: string;
  description: string;
  keyUrl: string;
  needsCustomUrl: boolean;
}

export interface SetupData {
  phone: string;
  email: string;
  timezone: string;
  aiProvider: string;
  aiApiKey: string;
  aiBaseUrl?: string;
  aiModel?: string;
}

export interface Job {
  id: number;
  code: string;
  name: string;
  description: string;
  groupCode: string;
  intervalSeconds: number;
  dailyRunTime: string | null;
  isEnabled: string;
  nextRunAt: string | null;
  lastRun: JobRun | null;
}

export interface JobRun {
  id: number;
  jobCode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  recordsProcessed: number | null;
  outputMessage: string | null;
  errorMessage: string | null;
  triggeredBy: string;
}

export interface Digest {
  id: string;
  headlineIds: string;
  channel: string;
  sentAt: string;
}

export interface BriefingHeadline {
  title: string;
  url: string;
  summary: string;
}

export interface BriefingCategory {
  categoryId: number;
  category: string;
  headlines: BriefingHeadline[];
}

export interface DailyBriefing {
  date: string;
  categories: BriefingCategory[];
  generatedAt: string;
}
