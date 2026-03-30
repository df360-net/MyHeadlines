import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBriefing, type BriefingCategory } from '../lib/api';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { useState } from 'react';

export function Briefing() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['briefing'],
    queryFn: () => getBriefing(),
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const fresh = await getBriefing(true);
      queryClient.setQueryData(['briefing'], fresh);
    } catch (err) {
      setRefreshError((err as Error).message || "Failed to refresh briefing");
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#9CA3AF]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#E5E7EB] border-t-[#1a73e8] mb-4" />
        <p className="text-[15px]">Loading briefing...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-[15px] text-red-500 mb-2">Failed to generate briefing</p>
        <p className="text-[13px] text-[#9CA3AF]">{(error as Error).message}</p>
      </div>
    );
  }

  const categories = data?.categories ?? [];
  const briefingDate = data?.date
    ? new Date(data.date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#111827]">Today's Briefing</h2>
          <p className="text-[14px] text-[#9CA3AF] mt-0.5">{briefingDate}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[#6B7280] hover:text-[#111827] hover:bg-[#F3F4F6] rounded-lg transition-all"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {refreshError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700" role="alert">
          Refresh failed: {refreshError}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[16px] text-[#6B7280]">No headlines from today yet.</p>
          <p className="text-[14px] text-[#9CA3AF] mt-1">Check back later — headlines are fetched every hour.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {categories.map((cat: BriefingCategory) => (
            <CategorySection key={cat.category} category={cat} />
          ))}
        </div>
      )}

      {data?.generatedAt && (
        <p className="text-[12px] text-[#D1D5DB] text-center mt-10">
          Generated at {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function CategorySection({ category }: { category: BriefingCategory }) {
  return (
    <section>
      <h3 className="text-[17px] font-semibold text-[#111827] mb-3 pb-2 border-b border-[#E5E7EB]">
        {category.category}
      </h3>
      <div className="space-y-4">
        {category.headlines.map((h, i) => (
          <div key={i} className="group bg-white rounded-lg border border-gray-200 p-4">
            <a
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-[15px] font-semibold text-[#1a1a1a] hover:text-[#1a73e8] transition-colors leading-snug"
            >
              <span>{h.title}</span>
              <ExternalLink size={13} className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-40 transition-opacity" />
            </a>
            <p className="text-[14px] text-[#6B7280] leading-relaxed mt-1">
              {h.summary}
              {' '}
              <a
                href={h.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#1a73e8] hover:underline font-medium"
              >
                Read full article <ExternalLink size={11} />
              </a>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
