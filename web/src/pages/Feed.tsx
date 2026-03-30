import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getHeadlines, getCategories, sendFeedback, type Headline } from '../lib/api';
import { timeAgo, parseTopics } from '../lib/utils';
import { ThumbsUp, ThumbsDown, ExternalLink, Sparkles, AlertCircle } from 'lucide-react';

export function Feed() {
  const [offset, setOffset] = useState(0);
  const [userSelectedCategory, setUserSelectedCategory] = useState<string | null>(null);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  });

  const fixedCats = useMemo(() => catData?.fixedCategories ?? [], [catData]);
  const interestCats = useMemo(() => catData?.categories ?? [], [catData]);
  const allCats = useMemo(() => [...fixedCats, ...interestCats], [fixedCats, interestCats]);
  const personalCategories = interestCats;
  const excludeList = useMemo(() => allCats.map((c) => String(c.id)).join(','), [allCats]);
  const categorizedTotal = useMemo(() => allCats.reduce((sum, c) => sum + c.count, 0), [allCats]);

  // Use user's selection if set, otherwise default to first fixed category
  const activeCategory = useMemo(() => {
    if (userSelectedCategory) return userSelectedCategory;
    return fixedCats.length > 0 ? String(fixedCats[0].id) : '';
  }, [userSelectedCategory, fixedCats]);

  const { data: allData } = useQuery({
    queryKey: ['headlines-total'],
    queryFn: () => getHeadlines(0, 0),
  });
  const othersCount = Math.max(0, (allData?.total ?? 0) - categorizedTotal);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['headlines', offset, activeCategory, excludeList],
    queryFn: () =>
      getHeadlines(
        offset,
        limit,
        activeCategory === '__others__' ? '__others__' : activeCategory,
        activeCategory === '__others__' ? excludeList : ''
      ),
    enabled: !!activeCategory,
    refetchInterval: 5 * 60 * 1000,
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: 'up' | 'down' | 'none' }) =>
      sendFeedback(id, feedback),
    onMutate: async ({ id, feedback }) => {
      // Use broad prefix match to avoid stale closure on offset/activeCategory
      await queryClient.cancelQueries({ queryKey: ['headlines'] });
      queryClient.setQueriesData({ queryKey: ['headlines'] }, (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          headlines: old.headlines.map((h: Headline) =>
            h.id === id ? { ...h, feedback: feedback === 'none' ? null : feedback } : h
          ),
        };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['headlines'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  const handleFeedback = (id: string, current: string | null, action: 'up' | 'down') => {
    const feedback = current === action ? 'none' : action;
    feedbackMutation.mutate({ id, feedback });
  };

  const handleCategoryChange = (cat: string) => {
    setUserSelectedCategory(cat);
    setOffset(0);
  };

  return (
    <div>
      {/* Fixed category tabs */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 relative">
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-surface px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Top Stories
        </span>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="News categories">
          {fixedCats.map((cat) => (
            <button
              key={cat.id}
              role="tab"
              aria-selected={activeCategory === String(cat.id)}
              aria-label={`${cat.displayName} (${cat.count} articles)`}
              onClick={() => handleCategoryChange(String(cat.id))}
              className={`shrink-0 px-4 py-2 rounded-full text-[15px] font-medium transition-all duration-150 ${
                activeCategory === String(cat.id)
                  ? 'bg-pill-active-bg text-text-primary'
                  : 'bg-transparent text-text-secondary border border-border hover:bg-pill-hover-bg hover:border-pill-hover-border'
              }`}
            >
              {cat.displayName}
              <span className="ml-1.5 text-[11px] opacity-60">{cat.count}</span>
            </button>
          ))}
        </div>
      </div>

      {(personalCategories.length > 0 || othersCount > 0) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 relative">
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-surface px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Your Topics
          </span>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Personal topics">
            {personalCategories.map((cat) => (
              <button
                key={cat.id}
                role="tab"
                aria-selected={activeCategory === String(cat.id)}
                aria-label={`${cat.displayName} (${cat.count} articles)`}
                onClick={() => handleCategoryChange(String(cat.id))}
                className={`shrink-0 px-4 py-2 rounded-full text-[15px] font-medium transition-all duration-150 ${
                  activeCategory === String(cat.id)
                    ? 'bg-pill-active-bg text-text-primary'
                    : 'bg-transparent text-text-secondary border border-border hover:bg-pill-hover-bg hover:border-pill-hover-border'
                }`}
              >
                {cat.displayName}
                <span className="ml-1.5 text-[11px] opacity-60">{cat.count}</span>
              </button>
            ))}

            {othersCount > 0 && (
              <button
                role="tab"
                aria-selected={activeCategory === '__others__'}
                aria-label={`Others (${othersCount} articles)`}
                onClick={() => handleCategoryChange('__others__')}
                className={`shrink-0 px-4 py-2 rounded-full text-[15px] font-medium transition-all duration-150 ${
                  activeCategory === '__others__'
                    ? 'bg-pill-active-bg text-text-primary'
                    : 'bg-transparent text-text-secondary border border-border hover:bg-pill-hover-bg'
                }`}
              >
                Others
                <span className="ml-1.5 text-[11px] opacity-60">{othersCount}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4" role="alert">
          <AlertCircle size={18} className="text-red-500 shrink-0" />
          <span className="text-sm text-red-700">Failed to load headlines. Please try again later.</span>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading headlines">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 w-32 bg-skeleton rounded mb-3" />
              <div className="h-5 w-3/4 bg-skeleton rounded mb-2" />
              <div className="h-4 w-full bg-skeleton rounded mb-2" />
              <div className="h-4 w-2/3 bg-skeleton rounded" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Headlines */}
          <div>
            {data?.headlines.map((h, i) => (
              <HeadlineCard
                key={h.id}
                headline={h}
                index={i}
                onFeedback={(action) => handleFeedback(h.id, h.feedback, action)}
                isFeedbackPending={feedbackMutation.isPending}
              />
            ))}
          </div>

          {data && data.headlines.length === 0 && (
            <div className="text-center text-text-muted py-16 text-sm">
              No headlines in this category yet.
            </div>
          )}

          {data && data.total > offset + limit && (
            <button
              onClick={() => setOffset((o) => o + limit)}
              disabled={isLoading}
              aria-label="Load more headlines"
              className="w-full mt-6 py-3 text-text-secondary text-sm font-medium bg-white rounded-xl border border-border hover:bg-pill-hover-bg hover:border-pill-hover-border transition-all disabled:opacity-50"
            >
              Load more headlines
            </button>
          )}
        </>
      )}
    </div>
  );
}

function HeadlineCard({
  headline,
  index,
  onFeedback,
  isFeedbackPending,
}: {
  headline: Headline;
  index: number;
  onFeedback: (action: 'up' | 'down') => void;
  isFeedbackPending: boolean;
}) {
  const topics = parseTopics(headline.topics);
  const isHighRelevance = headline.score != null && headline.score >= 0.65;

  return (
    <article
      className="group bg-white rounded-lg border border-gray-200 p-4 mb-3"
      style={{
        animation: `cardIn 0.3s ease-out both`,
        animationDelay: `${Math.min(index, 5) * 50}ms`,
      }}
    >
      {/* Meta line */}
      <div className="flex items-center gap-0 mb-2">
        {headline.sourceName && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-secondary">
            {headline.sourceName}
          </span>
        )}
        <span className="mx-2 text-[11px] text-separator">·</span>
        <time className="text-[13px] text-text-muted">
          {timeAgo(headline.publishedAt || headline.fetchedAt)}
        </time>
        {isHighRelevance && (
          <>
            <span className="mx-2 text-[11px] text-separator">·</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500">
              <Sparkles size={10} />
              For You
            </span>
          </>
        )}
      </div>

      {/* Title */}
      <a
        href={headline.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[18px] font-semibold text-text-primary leading-[1.35] hover:text-[#2563EB] block mb-1.5 line-clamp-3"
      >
        {headline.title}
      </a>

      {/* Summary */}
      {headline.summary && (
        <p className="text-[14px] leading-[1.55] text-text-tertiary line-clamp-2 mb-3">
          {headline.summary}
        </p>
      )}

      {/* Tags + Read full article */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {topics.slice(0, 3).map((t) => (
            <span
              key={t}
              className="text-[12px] font-medium text-text-tertiary bg-skeleton px-2.5 py-1 rounded-full"
            >
              {t}
            </span>
          ))}
          <a
            href={headline.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-text-link hover:underline font-medium ml-1"
          >
            Read full article <ExternalLink size={10} />
          </a>
        </div>

        {/* Actions — always visible on mobile, hover on desktop */}
        <div className="flex items-center gap-0.5 max-sm:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={() => onFeedback('up')}
            disabled={isFeedbackPending}
            aria-label="More like this"
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-50 ${
              headline.feedback === 'up'
                ? 'text-emerald-500 bg-emerald-50 opacity-100'
                : 'text-text-muted hover:bg-skeleton hover:text-text-secondary'
            }`}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            onClick={() => onFeedback('down')}
            disabled={isFeedbackPending}
            aria-label="Less like this"
            className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-50 ${
              headline.feedback === 'down'
                ? 'text-text-muted bg-skeleton opacity-100'
                : 'text-text-muted hover:bg-skeleton hover:text-text-secondary'
            }`}
          >
            <ThumbsDown size={14} />
          </button>
          <a
            href={headline.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open article in new tab"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-skeleton hover:text-text-secondary transition-all"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </article>
  );
}
