import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Play, Square, Trash2, Terminal, Sliders, Info, AlertTriangle, 
  CheckCircle2, XCircle, RefreshCw, BarChart2, Plus, Clock, ExternalLink 
} from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

export default function CrawlConsole({ socket }) {
  // Config form state
  const [seedUrl, setSeedUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxPages, setMaxPages] = useState(50);
  const [respectRobots, setRespectRobots] = useState(true);

  // App data state
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedJobLogs, setSelectedJobLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const logsEndRef = useRef(null);

  // Initial fetch
  useEffect(() => {
    fetchJobs();
    fetchStats();
  }, []);

  // Socket listener for real-time updates
  useEffect(() => {
    if (!socket) return;

    // Handle global job status changes
    const handleJobUpdated = (data) => {
      // Refresh jobs list and global stats
      fetchJobs();
      fetchStats();
      
      // If the selected job is the one that updated, we refresh its details
      if (selectedJobId && selectedJobId === data.jobId) {
        fetchJobDetails(data.jobId);
      }
    };

    // Handle live log appends
    const handleLiveLog = (logEntry) => {
      setSelectedJobLogs((prevLogs) => {
        // Prevent duplicate logs (sometimes triggers if reconnected)
        if (prevLogs.some(l => l._id === logEntry._id || (l.message === logEntry.message && l.timestamp === logEntry.timestamp))) {
          return prevLogs;
        }
        return [...prevLogs, logEntry];
      });
    };

    // Handle progress counts
    const handleProgress = (data) => {
      setJobs((prevJobs) => 
        prevJobs.map(job => 
          job._id === selectedJobId 
            ? { ...job, pagesCrawled: data.pagesCrawled, pagesFailed: data.pagesFailed }
            : job
        )
      );
    };

    socket.on('job_updated', handleJobUpdated);
    socket.on('log', handleLiveLog);
    socket.on('progress', handleProgress);

    return () => {
      socket.off('job_updated', handleJobUpdated);
      socket.off('log', handleLiveLog);
      socket.off('progress', handleProgress);
    };
  }, [socket, selectedJobId]);

  // Handle Socket Room Joins when selected job changes
  useEffect(() => {
    if (!socket || !selectedJobId) return;

    // Join room for this specific job
    socket.emit('join_job', selectedJobId);

    // Fetch the logs already in the DB
    fetchJobDetails(selectedJobId);

    return () => {
      // Leave room when switching jobs or unmounting
      socket.emit('leave_job', selectedJobId);
    };
  }, [selectedJobId, socket]);

  // Auto scroll logs console to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedJobLogs]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/crawl/jobs`);
      setJobs(response.data);
      // Auto select the first job if none is selected
      if (response.data.length > 0 && !selectedJobId) {
        setSelectedJobId(response.data[0]._id);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchJobDetails = async (jobId) => {
    try {
      const response = await axios.get(`${API_BASE}/crawl/jobs/${jobId}`);
      if (response.data) {
        setSelectedJobLogs(response.data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching job details:', err);
    }
  };

  const handleStartCrawl = async (e) => {
    e.preventDefault();
    if (!seedUrl) return;

    setSubmitting(true);
    try {
      const response = await axios.post(`${API_BASE}/crawl/start`, {
        url: seedUrl,
        maxDepth: parseInt(maxDepth),
        maxPages: parseInt(maxPages),
        respectRobots
      });
      
      const newJob = response.data;
      setSeedUrl('');
      // Prepend to jobs array and make it the selected job
      setJobs(prevJobs => [newJob, ...prevJobs]);
      setSelectedJobId(newJob._id);
      setSelectedJobLogs(newJob.logs || []);
      
      fetchStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to start crawl job');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopCrawl = async (jobId) => {
    try {
      await axios.post(`${API_BASE}/crawl/stop/${jobId}`);
      fetchJobs();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to stop crawl job');
    }
  };

  const handleDeleteJob = async (jobId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this crawl job and all its crawled pages from the search index?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/crawl/jobs/${jobId}`);
      setJobs(prevJobs => prevJobs.filter(j => j._id !== jobId));
      if (selectedJobId === jobId) {
        setSelectedJobId(null);
        setSelectedJobLogs([]);
      }
      fetchStats();
    } catch (err) {
      console.error('Failed to delete job:', err);
      alert('Failed to delete job');
    }
  };

  // Helper for Status Badge component
  const StatusBadge = ({ status }) => {
    let styles = 'bg-slate-900 border-slate-800 text-slate-400';
    let label = status;
    let pulse = false;

    switch (status) {
      case 'queued':
        styles = 'bg-blue-500/10 border-blue-500/20 text-blue-400';
        label = 'Queued';
        break;
      case 'crawling':
        styles = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
        label = 'Crawling';
        pulse = true;
        break;
      case 'completed':
        styles = 'bg-teal-500/10 border-teal-500/20 text-teal-400';
        label = 'Completed';
        break;
      case 'stopped':
        styles = 'bg-amber-500/10 border-amber-500/20 text-amber-400';
        label = 'Stopped';
        break;
      case 'failed':
        styles = 'bg-rose-500/10 border-rose-500/20 text-rose-400';
        label = 'Failed';
        break;
    }

    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold ${styles}`}>
        {pulse && (
          <span className="relative flex h-1.5 w-1.5 mr-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
        )}
        {label}
      </span>
    );
  };

  const getLogColorClass = (level) => {
    switch (level) {
      case 'warn': return 'text-amber-400';
      case 'error': return 'text-rose-400';
      default: return 'text-slate-300';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Overview Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-5 rounded-2xl bg-slate-900/30 border border-slate-800/80 shadow-md flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Plus size={20} />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{stats.totalPages.toLocaleString()}</div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Pages</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/30 border border-slate-800/80 shadow-md flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <BarChart2 size={20} />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{stats.totalDomains}</div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Unique Domains</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/30 border border-slate-800/80 shadow-md flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <RefreshCw size={20} className={stats.jobStatusBreakdown.crawling > 0 ? 'animate-spin' : ''} />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">{stats.jobStatusBreakdown.crawling}</div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Running Jobs</div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/30 border border-slate-800/80 shadow-md flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="text-2xl font-extrabold text-white">
                {stats.jobStatusBreakdown.completed + stats.jobStatusBreakdown.stopped}
              </div>
              <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Completed / Stopped</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Config Form & Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        
        {/* Left Panel: Crawl Config Form */}
        <div className="lg:col-span-5">
          <div className="p-6 rounded-3xl bg-slate-900/30 border border-slate-800 shadow-md h-full flex flex-col">
            <div className="flex items-center gap-2 mb-6">
              <Sliders className="text-indigo-400" size={20} />
              <h2 className="text-lg font-bold text-white">New Crawl Configuration</h2>
            </div>

            <form onSubmit={handleStartCrawl} className="flex-1 flex flex-col gap-5">
              {/* Seed URL Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Seed URL</label>
                <input
                  type="url"
                  required
                  value={seedUrl}
                  onChange={(e) => setSeedUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent text-sm"
                />
                <span className="text-[11px] text-slate-500">
                  The crawler will index this page and discover link structures on this domain.
                </span>
              </div>

              {/* Slider Configs Grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Max Depth */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Max Depth</label>
                    <span className="text-xs font-semibold text-indigo-400">{maxDepth} levels</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(e.target.value)}
                    className="h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    Depth limit from root URL page link recursion.
                  </span>
                </div>

                {/* Max Pages */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Max Pages</label>
                    <span className="text-xs font-semibold text-indigo-400">{maxPages} pages</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="500"
                    step="5"
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                    className="h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500">
                    Hard stop cap on total indexed pages.
                  </span>
                </div>
              </div>

              {/* Respect robots.txt Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-2xl">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-slate-200">Respect Robots.txt</span>
                  <span className="text-[10px] text-slate-500">Follow domain crawler policy rules.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={respectRobots}
                    onChange={(e) => setRespectRobots(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {/* Submit / Trigger Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-auto py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:opacity-80 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Queueing Job...
                  </>
                ) : (
                  <>
                    <Play size={16} fill="white" />
                    Start Search Engine Indexing
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Panel: Live Logs Console Terminal */}
        <div className="lg:col-span-7">
          <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-md h-[420px] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 mb-3.5">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                <Terminal className="text-slate-400" size={18} />
                <h3 className="text-sm font-bold text-slate-200">
                  Live Crawler Terminal
                </h3>
              </div>
              {selectedJobId && (
                <div className="text-[11px] font-mono text-slate-500 truncate max-w-[200px] sm:max-w-xs">
                  Room: job_{selectedJobId.substring(selectedJobId.length - 8)}
                </div>
              )}
            </div>

            {/* Logs Console Window */}
            <div className="flex-1 bg-slate-950/80 border border-slate-800/80 rounded-2xl p-4 overflow-y-auto font-mono text-xs leading-relaxed flex flex-col gap-1.5 shadow-inner">
              {selectedJobLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-600">
                  <Terminal size={32} className="mb-2 stroke-[1.5]" />
                  <span>Select a job below or start a new crawl to inspect real-time indexing logs.</span>
                </div>
              ) : (
                selectedJobLogs.map((log, idx) => (
                  <div key={log._id || idx} className="flex gap-2">
                    <span className="text-slate-600 select-none">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className={getLogColorClass(log.level)}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

      </div>

      {/* Crawl Jobs List Section */}
      <div className="p-6 rounded-3xl bg-slate-900/30 border border-slate-800 shadow-md">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Clock className="text-indigo-400" size={20} />
            <h2 className="text-lg font-bold text-white font-sans">Crawl Jobs History</h2>
          </div>
          <button
            onClick={fetchJobs}
            disabled={loading}
            className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl transition-all"
            title="Refresh jobs history list"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading && jobs.length === 0 ? (
          <div className="py-12 flex justify-center items-center">
            <RefreshCw size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/20">
            <Info size={40} className="mx-auto text-slate-700 mb-3" />
            <h3 className="text-base font-bold text-slate-400">No crawl jobs found</h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
              Enter a Seed URL at the top to start crawlers and index pages.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full border-collapse text-left text-sm text-slate-400">
              <thead className="bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-5 py-4">Seed URL</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Progress / Metrics</th>
                  <th className="px-5 py-4">Created Date</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-950/20">
                {jobs.map((job) => {
                  const percent = job.maxPages > 0 
                    ? Math.min(100, Math.round((job.pagesCrawled / job.maxPages) * 100)) 
                    : 0;

                  const isSelected = selectedJobId === job._id;

                  return (
                    <tr
                      key={job._id}
                      onClick={() => setSelectedJobId(job._id)}
                      className={`hover:bg-slate-900/40 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-600/5 hover:bg-indigo-600/10' : ''
                      }`}
                    >
                      {/* Seed URL column */}
                      <td className="px-5 py-4 font-medium text-slate-200">
                        <div className="flex items-center gap-1.5 max-w-xs sm:max-w-sm truncate">
                          <span className="truncate" title={job.seedUrl}>{job.seedUrl}</span>
                          <a
                            href={job.seedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-500 hover:text-slate-300"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </td>

                      {/* Status column */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusBadge status={job.status} />
                      </td>

                      {/* Progress / Metrics column */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1.5 max-w-[200px]">
                          <div className="flex justify-between text-xs font-semibold text-slate-500">
                            <span>Indexed: {job.pagesCrawled} / {job.maxPages}</span>
                            {job.pagesFailed > 0 && (
                              <span className="text-rose-500/80">Failed: {job.pagesFailed}</span>
                            )}
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${percent}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${
                                job.status === 'crawling'
                                  ? 'bg-gradient-to-r from-indigo-500 to-purple-500'
                                  : job.status === 'completed'
                                  ? 'bg-emerald-500'
                                  : job.status === 'stopped'
                                  ? 'bg-amber-500'
                                  : job.status === 'failed'
                                  ? 'bg-rose-500'
                                  : 'bg-slate-700'
                              }`}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Date column */}
                      <td className="px-5 py-4 text-xs whitespace-nowrap text-slate-500">
                        {new Date(job.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>

                      {/* Actions column */}
                      <td className="px-5 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {job.status === 'crawling' && (
                            <button
                              onClick={() => handleStopCrawl(job._id)}
                              className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-all border border-amber-500/20"
                              title="Stop crawling job"
                            >
                              <Square size={13} fill="currentColor" />
                            </button>
                          )}
                          <button
                            onClick={(e) => handleDeleteJob(job._id, e)}
                            className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-all border border-rose-500/20"
                            title="Delete job and index"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
