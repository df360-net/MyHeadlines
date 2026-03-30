import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { Feed } from './pages/Feed';
import { Profile } from './pages/Profile';
import { Jobs } from './pages/Jobs';
import { SettingsPage } from './pages/SettingsPage';
import { Setup } from './pages/Setup';
import { Briefing } from './pages/Briefing';
import { getSetupStatus } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, retry: 1 },
  },
});

function AppRoutes() {
  const { data, isLoading } = useQuery({
    queryKey: ['setupStatus'],
    queryFn: getSetupStatus,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  // If not set up, show setup page
  if (!data?.isSetupComplete) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Feed />} />
        <Route path="/briefing" element={<Briefing />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/setup" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
