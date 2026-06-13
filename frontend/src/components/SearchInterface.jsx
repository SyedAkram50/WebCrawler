import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, Globe, Calendar, HardDrive, FileText, ArrowRight, Loader2 } from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

export default function SearchInterface() {
  const [query, setQuery] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [results, setResults] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [timeTaken, setTimeTaken] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  const inputRef = useRef(null);

  // Fetch index stats for the homepage
  useEffect(() => {
    fetchStats();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching global stats:', err);
    }
  };

  const handleSearch = async (e, searchPage = 1) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE}/search`, {
        params: {
          q: query.trim(),
          page: searchPage,
          limit: 10
        }
      });
      setResults(response.data.results);
      setTotalResults(response.data.totalResults);
      setTimeTaken(response.data.timeTaken);
      setPage(response.data.page);
      setTotalPages(response.data.totalPages);
      setSearchedQuery(query.trim());
    } catch (err) {
      console.error('Search request failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      handleSearch(null, newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Helper to highlight matching query words in the snippet
  const highlightWords = (text, searchQuery) => {
    if (!searchQuery || !text) return text;
    
    // Split query by spaces to highlight individual words
    const words = searchQuery
      .split(/[\s,.-]+/)
      .filter(w => w.length > 2)
      .map(w => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')); // escape regex characters
    
    if (words.length === 0) return text;

    const regex = new RegExp(`(${words.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-indigo-500/20 text-indigo-300 border-b border-indigo-500/30 px-0.5 rounded-sm font-medium">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Format date string nicely
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Render Google-style pagination links
  const renderPagination = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, page - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return (
      <div className="flex items-center justify-center gap-2 mt-12 mb-16">
        <button
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 disabled:hover:bg-slate-900/60 transition-all text-sm"
        >
          Previous
        </button>

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => handlePageChange(p)}
            className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-all ${
              page === p
                ? 'border-indigo-500 bg-indigo-600/25 text-indigo-300'
                : 'border-slate-800 bg-slate-900/30 hover:bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {p}
          </button>
        ))}

        <button
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages || totalPages === 0}
          className="px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-50 disabled:hover:bg-slate-900/60 transition-all text-sm"
        >
          Next
        </button>
      </div>
    );
  };

  const isHome = !searchedQuery;

  return (
    <div className="w-full">
      {isHome ? (
        /* HOMEPAGE VIEW */
        <div className="max-w-3xl mx-auto px-4 pt-24 sm:pt-32 flex flex-col items-center justify-center text-center">
          {/* Animated Logo */}
          <div className="mb-8 select-none">
            <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-500 bg-clip-text text-transparent">Web Crawler</span>
            </h1>
            <p className="mt-3 text-slate-400 text-sm tracking-wide uppercase font-semibold">
              The Web Index & Search Engine
            </p>
          </div>

          {/* Search Form */}
          <form onSubmit={(e) => handleSearch(e, 1)} className="w-full max-w-2xl relative mb-12">
            <div className="relative flex items-center">
              <div className="absolute left-4 text-slate-500">
                <Search size={22} />
              </div>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search crawled web pages, keywords or URL..."
                className="w-full pl-12 pr-28 py-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all shadow-xl shadow-slate-950/50"
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    Search <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Indexing Stats Banner */}
          {stats && (
            <div className="grid grid-cols-3 gap-6 max-w-xl mx-auto p-5 rounded-2xl bg-slate-900/30 border border-slate-800/80 shadow-md backdrop-blur-md">
              <div className="text-center">
                <div className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  {stats.totalPages.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-1">
                  Pages Indexed
                </div>
              </div>
              <div className="text-center border-x border-slate-800">
                <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                  {stats.totalDomains.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-1">
                  Domains Crawled
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                  {stats.totalSizeKb > 1024 
                    ? `${(stats.totalSizeKb / 1024).toFixed(1)} MB` 
                    : `${stats.totalSizeKb} KB`}
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-1">
                  Data Indexed
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* RESULTS LIST VIEW */
        <div className="w-full">
          {/* Secondary Search Header bar */}
          <div className="sticky top-16 z-40 bg-slate-950/90 border-b border-slate-900 py-4 shadow-lg backdrop-blur-md">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <form onSubmit={(e) => handleSearch(e, 1)} className="w-full max-w-3xl flex gap-3">
                <div className="relative flex-1">
                  <div className="absolute left-3.5 top-3.5 text-slate-500">
                    <Search size={18} />
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search indexed pages..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || !query.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-600/10 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {loading && <Loader2 size={15} className="animate-spin" />}
                  Search
                </button>
              </form>
            </div>
          </div>

          {/* Search Metrics Summary */}
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <div className="text-xs text-slate-500 mb-6 font-medium">
              About {totalResults.toLocaleString()} results ({timeTaken} seconds) for "{searchedQuery}"
            </div>

            {/* Results Grid / List */}
            {loading ? (
              <div className="flex flex-col gap-6 py-8">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="animate-pulse flex flex-col gap-2 p-4 bg-slate-900/25 border border-slate-900/50 rounded-xl">
                    <div className="h-3 w-1/4 bg-slate-800 rounded-full"></div>
                    <div className="h-5 w-2/3 bg-slate-800 rounded-full"></div>
                    <div className="h-4 w-5/6 bg-slate-800 rounded-full"></div>
                    <div className="h-4 w-1/2 bg-slate-800 rounded-full mt-1"></div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              /* NO RESULTS UI */
              <div className="py-20 text-center rounded-2xl bg-slate-900/10 border border-slate-900/40 mt-4">
                <Globe size={48} className="mx-auto text-slate-700 mb-4 stroke-[1.5]" />
                <h3 className="text-lg font-bold text-slate-400">No results found</h3>
                <p className="text-slate-500 text-sm max-w-sm mx-auto mt-2">
                  We couldn't find any indexed web pages matching <span className="text-indigo-400 font-semibold">"{searchedQuery}"</span>.
                </p>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mt-4">
                  Tip: Make sure words are spelled correctly, or go to the Crawl Console to crawl a new site!
                </p>
              </div>
            ) : (
              /* RESULTS ITEMS LIST */
              <div className="flex flex-col gap-6">
                {results.map((result) => (
                  <article
                    key={result._id}
                    className="p-5 rounded-2xl bg-slate-900/10 border border-slate-900/50 hover:border-slate-800 hover:bg-slate-900/30 transition-all group"
                  >
                    {/* Domain & URL Breadcrumb */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5 truncate max-w-full">
                      <Globe size={13} className="text-indigo-400" />
                      <span className="text-slate-300 font-medium">{result.domain}</span>
                      <span className="text-slate-600 font-bold">›</span>
                      <span className="text-slate-500 truncate">{result.url}</span>
                    </div>

                    {/* Title Link */}
                    <h2 className="text-lg sm:text-xl font-bold mb-2">
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors leading-tight"
                      >
                        {result.title || result.url}
                      </a>
                    </h2>

                    {/* Keyword Contextual Snippet */}
                    <p className="text-slate-300 text-sm leading-relaxed mb-4">
                      {highlightWords(result.snippet, searchedQuery)}
                    </p>

                    {/* Meta tags and properties */}
                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 font-medium border-t border-slate-900/60 pt-3">
                      <span className="flex items-center gap-1">
                        <Calendar size={12} />
                        Indexed: {formatDate(result.crawlTime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive size={12} />
                        Size: {result.contentSize ? `${(result.contentSize / 1024).toFixed(1)} KB` : 'Unknown'}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText size={12} />
                        Status: <span className={result.statusCode === 200 ? 'text-emerald-500' : 'text-amber-500'}>{result.statusCode || 'N/A'}</span>
                      </span>
                      {result.score && (
                        <span className="ml-auto bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded ring-1 ring-inset ring-indigo-500/15">
                          Score: {result.score.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </article>
                ))}

                {/* Pagination */}
                {renderPagination()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
