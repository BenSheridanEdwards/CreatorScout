import { useEffect, useState } from 'react';
import type { RunMetadata } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface RunDetailsModalProps {
  run: RunMetadata;
  onClose: () => void;
}

type Tab = 'overview' | 'logs' | 'issues';

function formatDuration(seconds?: number): string {
  if (!seconds) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function RunDetailsModal({
  run,
  onClose,
}: RunDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [logs, setLogs] = useState<
    Array<{
      timestamp?: string;
      message?: string;
      level?: string;
      raw?: string;
    }>
  >([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Load logs when Logs tab is active
  useEffect(() => {
    if (activeTab === 'logs' && run) {
      setLogsLoading(true);
      let url = '/api/logs?limit=500';
      url += `&startTime=${encodeURIComponent(run.startTime)}`;
      if (run.endTime) {
        url += `&endTime=${encodeURIComponent(run.endTime)}`;
      }

      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          setLogs(data.entries || []);
        })
        .catch((error) => {
          console.error('Failed to load logs:', error);
        })
        .finally(() => {
          setLogsLoading(false);
        });
    }
  }, [activeTab, run]);

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='bg-slate-900 border-slate-800 text-slate-200 max-w-6xl w-full max-h-[90vh] overflow-hidden p-0'>
        <DialogHeader className='sticky top-0 bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-row items-center justify-between space-y-0 z-10'>
          <div>
            <DialogTitle className='text-lg font-semibold text-slate-200 uppercase'>
              {run.scriptName}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              Run details for {run.scriptName} script
            </DialogDescription>
            <div className='flex items-center gap-2 mt-1'>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  run.status === 'completed'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : run.status === 'running'
                      ? 'bg-sky-500/20 text-sky-300'
                      : 'bg-red-500/20 text-red-300'
                }`}
              >
                {run.status}
              </span>
              <span className='text-xs text-slate-400'>
                {new Date(run.startTime).toLocaleString()}
              </span>
            </div>
          </div>
          <DialogClose asChild>
            <button
              type='button'
              className='text-slate-400 hover:text-slate-200 text-2xl w-8 h-8 flex items-center justify-center'
            >
              ×
            </button>
          </DialogClose>
        </DialogHeader>

        {/* Tabs */}
        <div className='border-b border-slate-800 px-4'>
          <div className='flex gap-4' role='tablist'>
            <button
              id='run-details-overview-tab'
              type='button'
              role='tab'
              aria-selected={activeTab === 'overview'}
              aria-controls='run-details-overview-panel'
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                activeTab === 'overview'
                  ? 'border-sky-500 text-sky-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview
            </button>
            <button
              id='run-details-logs-tab'
              type='button'
              role='tab'
              aria-selected={activeTab === 'logs'}
              aria-controls='run-details-logs-panel'
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                activeTab === 'logs'
                  ? 'border-sky-500 text-sky-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Logs
            </button>
            <button
              id='run-details-issues-tab'
              type='button'
              role='tab'
              aria-selected={activeTab === 'issues'}
              aria-controls='run-details-issues-panel'
              onClick={() => setActiveTab('issues')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                activeTab === 'issues'
                  ? 'border-sky-500 text-sky-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Issues{' '}
              {run.issues && run.issues.length > 0 && `(${run.issues.length})`}
            </button>
          </div>
        </div>

        <div className='p-6 overflow-auto max-h-[calc(90vh-140px)]'>
          {activeTab === 'overview' && (
            <div
              role='tabpanel'
              id='run-details-overview-panel'
              aria-labelledby='run-details-overview-tab'
              className='space-y-6'
            >
              {/* Fatal Error Banner */}
              {run.errorMessage && (
                <div className='bg-red-500/10 border border-red-500/30 rounded-lg p-4'>
                  <div className='flex items-start gap-3'>
                    <span className='text-2xl' aria-hidden='true'>
                      🚨
                    </span>
                    <div className='flex-1'>
                      <h3 className='text-sm font-semibold text-red-300 mb-1'>
                        Session Error
                      </h3>
                      <p className='text-sm text-red-200 font-mono break-words'>
                        {run.errorMessage}
                      </p>
                      {run.issues?.some((i) => i.type === 'fatal_error') && (
                        <p className='text-xs text-red-400/70 mt-2'>
                          Session was terminated due to unrecoverable error
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Key Metrics - Large Cards */}
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <div className='bg-gradient-to-br from-slate-800/80 to-slate-900/60 rounded-xl p-4 border border-slate-700/50'>
                  <p className='text-xs text-slate-400 mb-2 font-medium'>
                    Profiles Processed
                  </p>
                  <p className='text-3xl font-bold text-slate-100'>
                    {run.profilesProcessed}
                  </p>
                  {run.stats?.successRate !== undefined && (
                    <p className='text-xs text-slate-500 mt-1'>
                      {run.stats.successRate.toFixed(1)}% success
                    </p>
                  )}
                </div>
                <div className='bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 rounded-xl p-4 border border-emerald-500/30'>
                  <p className='text-xs text-emerald-400 mb-2 font-medium'>
                    Creators Found
                  </p>
                  <p className='text-3xl font-bold text-emerald-300'>
                    {run.creatorsFound}
                  </p>
                  {run.profilesProcessed > 0 && (
                    <p className='text-xs text-emerald-400/70 mt-1'>
                      {(
                        (run.creatorsFound / run.profilesProcessed) *
                        100
                      ).toFixed(1)}
                      % discovery rate
                    </p>
                  )}
                </div>
                <div className='bg-gradient-to-br from-red-900/40 to-red-800/20 rounded-xl p-4 border border-red-500/30'>
                  <p className='text-xs text-red-400 mb-2 font-medium'>
                    Errors
                  </p>
                  <p className='text-3xl font-bold text-red-300'>
                    {run.errors}
                  </p>
                  {run.profilesProcessed > 0 && (
                    <p className='text-xs text-red-400/70 mt-1'>
                      {((run.errors / run.profilesProcessed) * 100).toFixed(1)}%
                      error rate
                    </p>
                  )}
                </div>
                <div className='bg-gradient-to-br from-slate-800/80 to-slate-900/60 rounded-xl p-4 border border-slate-700/50'>
                  <p className='text-xs text-slate-400 mb-2 font-medium'>
                    Duration
                  </p>
                  <p className='text-3xl font-bold text-slate-100'>
                    {formatDuration(run.stats?.duration)}
                  </p>
                  {run.stats?.duration && run.profilesProcessed > 0 && (
                    <p className='text-xs text-slate-500 mt-1'>
                      {Math.round(run.stats.duration / run.profilesProcessed)}s
                      per profile
                    </p>
                  )}
                </div>
              </div>

              {/* Creators Found - Card Grid */}
              {run.creatorsFoundList && run.creatorsFoundList.length > 0 && (
                <div>
                  <h3 className='text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2'>
                    <span className='text-emerald-400' aria-hidden='true'>
                      ✨
                    </span>
                    Creators Found ({run.creatorsFoundList.length})
                  </h3>
                  <ul className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto'>
                    {run.creatorsFoundList.map((creator) => (
                      <li
                        key={`${creator.username}-${creator.timestamp}`}
                        className='bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 rounded-lg p-3 border border-emerald-500/20 hover:border-emerald-500/40 transition'
                      >
                        <div className='flex items-start justify-between mb-2'>
                          <a
                            href={`https://instagram.com/${creator.username}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-sm font-bold text-emerald-300 hover:text-emerald-200'
                          >
                            @{creator.username}
                          </a>
                          <span className='text-xs px-2 py-1 rounded-full bg-emerald-500/30 text-emerald-200 font-semibold'>
                            {creator.confidence}%
                          </span>
                        </div>
                        <p className='text-xs text-slate-400 mb-2'>
                          {creator.reason}
                        </p>
                        <time
                          dateTime={creator.timestamp}
                          className='text-[10px] text-slate-500'
                        >
                          {new Date(creator.timestamp).toLocaleString()}
                        </time>
                        {creator.screenshotPath && (
                          <button
                            type='button'
                            onClick={() => {
                              if (creator.screenshotPath) {
                                window.open(
                                  getImageUrl(creator.screenshotPath),
                                  '_blank',
                                );
                              }
                            }}
                            className='text-xs text-purple-400 hover:text-purple-300 mt-2 w-full text-left'
                          >
                            📸 View screenshot
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Error Logs - Card Grid */}
              {run.errorLogs && run.errorLogs.length > 0 && (
                <div>
                  <h3 className='text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2'>
                    <span className='text-red-400' aria-hidden='true'>
                      ❌
                    </span>
                    Error Logs ({run.errorLogs.length})
                  </h3>
                  <ul className='grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto'>
                    {run.errorLogs.map((error) => (
                      <li
                        key={`${error.timestamp}-${error.username || 'unknown'}`}
                        className='bg-gradient-to-br from-red-900/30 to-red-800/10 rounded-lg p-3 border border-red-500/20'
                      >
                        <div className='flex items-start justify-between mb-2'>
                          {error.username && (
                            <span className='text-sm font-semibold text-red-300'>
                              @{error.username}
                            </span>
                          )}
                          <time
                            dateTime={error.timestamp}
                            className='text-xs text-slate-500'
                          >
                            {new Date(error.timestamp).toLocaleTimeString()}
                          </time>
                        </div>
                        <p className='text-xs text-red-300 font-mono mb-2 break-words'>
                          {error.message}
                        </p>
                        {error.stack && (
                          <details className='text-xs text-slate-400'>
                            <summary className='cursor-pointer hover:text-slate-300 mb-1'>
                              Stack trace
                            </summary>
                            <pre className='mt-2 p-2 bg-slate-950/50 rounded overflow-x-auto text-[10px]'>
                              {error.stack}
                            </pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Screenshots */}
              {run.screenshots.length > 0 && (
                <div>
                  <h3 className='text-sm font-semibold text-slate-200 mb-3'>
                    Screenshots ({run.screenshots.length})
                  </h3>
                  <ul className='grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3'>
                    {run.screenshots.map((screenshot, idx) => (
                      <li key={screenshot}>
                        <button
                          type='button'
                          className='relative group cursor-pointer rounded-lg overflow-hidden border-2 border-slate-700 hover:border-slate-500 transition w-full p-0 bg-transparent'
                          onClick={() =>
                            window.open(getImageUrl(screenshot), '_blank')
                          }
                        >
                          <img
                            src={getImageUrl(screenshot)}
                            alt={`Screenshot ${idx + 1}`}
                            className='w-full h-32 object-cover'
                          />
                          <div className='absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center'>
                            <span className='text-white opacity-0 group-hover:opacity-100 text-xs'>
                              View
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div
              role='tabpanel'
              id='run-details-logs-panel'
              aria-labelledby='run-details-logs-tab'
            >
              {logsLoading ? (
                <p className='text-center py-8 text-slate-400'>
                  Loading logs...
                </p>
              ) : logs.length === 0 ? (
                <p className='text-center py-8 text-slate-400'>
                  No logs available
                </p>
              ) : (
                <ul className='space-y-1 font-mono text-xs'>
                  {logs.map((log, idx) => (
                    <li
                      key={`${log.timestamp || idx}-${log.message || log.raw || idx}`}
                      className='p-2 rounded hover:bg-slate-800/50 border border-transparent hover:border-slate-700'
                    >
                      <div className='flex gap-2'>
                        {log.timestamp && (
                          <time
                            dateTime={log.timestamp}
                            className='text-slate-500'
                          >
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </time>
                        )}
                        <span
                          className={
                            log.level === 'ERROR'
                              ? 'text-red-400'
                              : log.level === 'WARN'
                                ? 'text-amber-400'
                                : 'text-slate-300'
                          }
                        >
                          {log.message || log.raw || JSON.stringify(log)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'issues' && (
            <div
              role='tabpanel'
              id='run-details-issues-panel'
              aria-labelledby='run-details-issues-tab'
            >
              {run.issues && run.issues.length > 0 ? (
                <ul className='space-y-3'>
                  {run.issues.map((issue) => (
                    <li
                      key={`${issue.type}-${issue.detectedAt}`}
                      className={`rounded-lg p-4 border ${
                        issue.severity === 'critical'
                          ? 'bg-red-500/5 border-red-500/20'
                          : 'bg-amber-500/5 border-amber-500/20'
                      }`}
                    >
                      <div className='flex items-start justify-between mb-2'>
                        <div className='flex items-center gap-2'>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              issue.severity === 'critical'
                                ? 'bg-red-400'
                                : 'bg-amber-400'
                            }`}
                            aria-hidden='true'
                          />
                          <span className='text-sm font-semibold text-slate-200'>
                            {issue.type.replace(/_/g, ' ')}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${
                              issue.severity === 'critical'
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {issue.severity}
                          </span>
                        </div>
                        {issue.logLine && (
                          <button
                            type='button'
                            onClick={() => {
                              setActiveTab('logs');
                              // Scroll to log line (would need refs for actual implementation)
                            }}
                            className='text-xs text-sky-400 hover:text-sky-300'
                          >
                            Line {issue.logLine}
                          </button>
                        )}
                      </div>
                      <p className='text-sm text-slate-300'>{issue.message}</p>
                      <p className='text-xs text-slate-500 mt-2'>
                        Detected:{' '}
                        <time dateTime={issue.detectedAt}>
                          {new Date(issue.detectedAt).toLocaleString()}
                        </time>
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-center py-8 text-slate-400'>
                  No issues detected
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
