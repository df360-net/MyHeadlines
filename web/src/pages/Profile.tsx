import { useQuery } from '@tanstack/react-query';
import { getProfile } from '../lib/api';
import { AlertCircle } from 'lucide-react';

export function Profile() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  });

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading profile">
        <div className="h-6 w-48 bg-skeleton rounded mb-2 animate-pulse" />
        <div className="h-4 w-64 bg-skeleton rounded mb-6 animate-pulse" />
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
              <div className="w-44 h-4 bg-skeleton rounded" />
              <div className="flex-1 h-2.5 bg-skeleton rounded-full" />
              <div className="w-10 h-4 bg-skeleton rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
        <AlertCircle size={18} className="text-red-500 shrink-0" />
        <span className="text-sm text-red-700">Failed to load profile. Please try again later.</span>
      </div>
    );
  }

  const interests = data?.interests ?? [];

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-1">Your Interest Profile</h2>
      <p className="text-sm text-gray-500 mb-6">
        Based on {interests.length} topics learned from your browsing history and feedback.
      </p>

      {interests.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          No interests yet. Complete setup to scan your computer, or rate some headlines.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100" role="list" aria-label="Interest topics">
          {interests.map((interest) => (
            <div key={interest.topicId ?? interest.topic} className="flex items-center gap-3 px-4 py-3" role="listitem">
              <span className="w-44 text-sm font-medium text-gray-700 truncate">
                {interest.displayName}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-2.5" role="progressbar" aria-valuenow={interest.weight} aria-valuemin={0} aria-valuemax={100} aria-label={`${interest.displayName} interest weight`}>
                <div
                  className="bg-blue-500 rounded-full h-2.5 transition-all duration-300"
                  style={{ width: `${Math.min(100, interest.weight)}%` }}
                />
              </div>
              <span className="text-sm text-gray-500 w-10 text-right">{interest.weight}%</span>
              <span className="text-xs text-gray-400 w-16 text-right">
                {interest.interactionCount} clicks
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
