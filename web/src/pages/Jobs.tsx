import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJobs, triggerJob, type Job } from '../lib/api';
import { timeAgo } from '../lib/utils';
import { Play, CheckCircle2, XCircle, Clock, Loader2, AlertCircle } from 'lucide-react';

const statusIcons: Record<string, typeof CheckCircle2> = {
  COMPLETED: CheckCircle2,
  FAILED: XCircle,
  TIMED_OUT: Clock,
  RUNNING: Loader2,
};

const statusColors: Record<string, string> = {
  COMPLETED: 'text-green-500',
  FAILED: 'text-red-500',
  TIMED_OUT: 'text-amber-500',
  RUNNING: 'text-blue-500 animate-spin',
};

export function Jobs() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['jobs'],
    queryFn: getJobs,
    refetchInterval: (query) => {
      // Poll faster while any job is running
      const jobs = query.state.data?.jobs ?? [];
      const hasRunning = jobs.some((j) => j.lastRun?.status === 'RUNNING');
      return hasRunning ? 2000 : 10000;
    },
  });

  const trigger = useMutation({
    mutationFn: (code: string) => triggerJob(code),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  });

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading jobs">
        <div className="h-6 w-40 bg-skeleton rounded mb-4 animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
              <div className="h-5 w-48 bg-skeleton rounded mb-2" />
              <div className="h-4 w-72 bg-skeleton rounded mb-3" />
              <div className="h-3 w-56 bg-skeleton rounded" />
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
        <span className="text-sm text-red-700">Failed to load jobs. Please try again later.</span>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Scheduler Jobs</h2>

      <div className="space-y-3" role="list" aria-label="Background jobs">
        {data?.jobs.map((job) => (
          <JobCard key={job.code} job={job} onTrigger={() => trigger.mutate(job.code)} isTriggerPending={trigger.isPending} />
        ))}
      </div>
    </div>
  );
}

function JobCard({ job, onTrigger, isTriggerPending }: { job: Job; onTrigger: () => void; isTriggerPending: boolean }) {
  const lastRun = job.lastRun;
  const status = lastRun?.status ?? 'NEVER';
  const isRunning = status === 'RUNNING';
  const StatusIcon = statusIcons[status] ?? Clock;
  const colorClass = statusColors[status] ?? 'text-gray-400';

  const intervalLabel = formatInterval(job.intervalSeconds);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4" role="listitem">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800">{job.name}</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                job.isEnabled === 'Y'
                  ? 'bg-green-50 text-green-600'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {job.isEnabled === 'Y' ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{job.description}</p>
        </div>
        <button
          onClick={onTrigger}
          disabled={isRunning || isTriggerPending}
          aria-label={isRunning ? `${job.name} is running` : `Run ${job.name} now`}
          className={`p-2 rounded-lg transition-colors ${isRunning || isTriggerPending ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'}`}
        >
          {isRunning || isTriggerPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
        </button>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span>{job.dailyRunTime ? `Daily at ${formatTime12h(job.dailyRunTime)}` : `Every ${intervalLabel}`}</span>
        {lastRun && (
          <>
            <div className="flex items-center gap-1">
              <StatusIcon size={12} className={colorClass} />
              <span>{status}</span>
            </div>
            <span>{timeAgo(lastRun.startedAt)}</span>
            {lastRun.durationMs != null && <span>{lastRun.durationMs}ms</span>}
            {lastRun.outputMessage && (
              <span className="text-gray-400 truncate max-w-48">{lastRun.outputMessage}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}
