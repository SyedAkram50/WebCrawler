const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const Job = require('../models/Job');
const Page = require('../models/Page');

// In-memory cache for robots.txt parsing to avoid fetching it for the same domain multiple times
const robotsCache = {};

/**
 * Normalizes a URL: removes hash, strips trailing slash, and parses it
 */
function normalizeUrl(urlStr, baseUrlStr) {
  try {
    const resolvedUrl = new URL(urlStr, baseUrlStr);
    resolvedUrl.hash = ''; // Remove fragments
    // Remove trailing slash if path ends with / (except for root domain)
    if (resolvedUrl.pathname.endsWith('/') && resolvedUrl.pathname.length > 1) {
      resolvedUrl.pathname = resolvedUrl.pathname.slice(0, -1);
    }
    return resolvedUrl.toString();
  } catch (err) {
    return null;
  }
}

/**
 * Fetches and parses robots.txt for a given domain
 */
async function getRobotsRules(domainUrl, jobId, io) {
  const urlObj = new URL(domainUrl);
  const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

  if (robotsCache[urlObj.host] !== undefined) {
    return robotsCache[urlObj.host];
  }

  try {
    const response = await axios.get(robotsUrl, {
      timeout: 5000,
      maxContentLength: 500 * 1024, // 500KB limit
      headers: { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' }
    });

    const lines = response.data.split(/\r?\n/);
    const disallows = [];
    const allows = [];
    let isApplicableAgent = false;

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('#') || line === '') continue;

      const parts = line.split(':');
      if (parts.length < 2) continue;

      const key = parts[0].trim().toLowerCase();
      const value = parts.slice(1).join(':').trim();

      if (key === 'user-agent') {
        const agent = value.toLowerCase();
        // Match * (any agent) or Googlebot
        if (agent === '*' || agent.includes('googlebot') || agent.includes('crawler')) {
          isApplicableAgent = true;
        } else {
          isApplicableAgent = false;
        }
      } else if (isApplicableAgent) {
        if (key === 'disallow') {
          if (value !== '') disallows.push(value);
        } else if (key === 'allow') {
          if (value !== '') allows.push(value);
        }
      }
    }

    robotsCache[urlObj.host] = { disallows, allows };
    return robotsCache[urlObj.host];
  } catch (err) {
    // If robots.txt doesn't exist (e.g. 404), allow everything by default
    robotsCache[urlObj.host] = { disallows: [], allows: [] };
    return robotsCache[urlObj.host];
  }
}

/**
 * Checks if a path is allowed to be crawled based on robots.txt rules
 */
function isAllowedByRobots(urlStr, rules) {
  if (!rules) return true;
  try {
    const urlObj = new URL(urlStr);
    const path = urlObj.pathname + urlObj.search;

    // Check if explicitly allowed (Allow takes precedence in some systems, or longest match)
    for (const allowPath of rules.allows) {
      const regex = new RegExp('^' + allowPath.replace(/\*/g, '.*').replace(/\?/g, '\\?'));
      if (regex.test(path)) {
        return true;
      }
    }

    // Check if disallowed
    for (const disallowPath of rules.disallows) {
      const regex = new RegExp('^' + disallowPath.replace(/\*/g, '.*').replace(/\?/g, '\\?'));
      if (regex.test(path)) {
        return false;
      }
    }
  } catch (e) {
    // If error, err on side of safety or allow
  }
  return true;
}

/**
 * Logs a message to database and emits via socket.io
 */
async function logMessage(jobId, io, message, level = 'info') {
  const timestamp = new Date();
  const logEntry = { timestamp, message, level };

  // Push to database
  await Job.findByIdAndUpdate(jobId, {
    $push: { logs: logEntry }
  });

  // Emit to socket
  if (io) {
    io.to(`job_${jobId}`).emit('log', logEntry);
  }
}

/**
 * Helper to sleep between crawling pages
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Main Crawler runner
 */
async function startCrawl(jobId, io) {
  let job;
  try {
    job = await Job.findById(jobId);
    if (!job) return;
  } catch (err) {
    return;
  }

  try {
    await Job.findByIdAndUpdate(jobId, { status: 'crawling', startTime: new Date() });
    if (io) io.emit('job_updated', { jobId, status: 'crawling' });

    await logMessage(jobId, io, `Starting crawl with Seed URL: ${job.seedUrl}`, 'info');
    await logMessage(jobId, io, `Configuration: Max Depth = ${job.maxDepth}, Max Pages = ${job.maxPages}, Respect robots.txt = ${job.respectRobots}`, 'info');

    // Parse Seed Domain details
    let seedUrlObj;
    try {
      seedUrlObj = new URL(job.seedUrl);
    } catch (err) {
      await logMessage(jobId, io, `Invalid Seed URL format: ${job.seedUrl}`, 'error');
      await Job.findByIdAndUpdate(jobId, { status: 'failed', endTime: new Date() });
      if (io) io.emit('job_updated', { jobId, status: 'failed' });
      return;
    }

    const seedHostname = seedUrlObj.hostname.replace(/^www\./, '');

    // Queue of URLs to crawl: { url: String, depth: Number }
    const queue = [{ url: job.seedUrl, depth: 0 }];
    const queuedUrls = new Set([normalizeUrl(job.seedUrl) || job.seedUrl]);
    const crawledUrls = new Set();
    let pagesCrawledCount = 0;
    let pagesFailedCount = 0;

    while (queue.length > 0 && pagesCrawledCount < job.maxPages) {
      // 1. Check if job status has been modified (e.g. stopped by the user)
      const currentJob = await Job.findById(jobId).select('status');
      if (!currentJob || currentJob.status === 'stopped') {
        await logMessage(jobId, io, `Crawl job was stopped by user request.`, 'warn');
        break;
      }

      // 2. Fetch the next URL from the queue
      const { url: currentUrl, depth } = queue.shift();

      if (depth > job.maxDepth) {
        continue;
      }

      const normalized = normalizeUrl(currentUrl);
      if (!normalized) {
        continue;
      }

      if (crawledUrls.has(normalized)) {
        continue;
      }

      crawledUrls.add(normalized);

      // Check robots.txt if configured
      if (job.respectRobots) {
        try {
          const rules = await getRobotsRules(normalized, jobId, io);
          const allowed = isAllowedByRobots(normalized, rules);
          if (!allowed) {
            await logMessage(jobId, io, `Skipping disallowed URL by robots.txt: ${normalized}`, 'warn');
            continue;
          }
        } catch (e) {
          // If checking robots fails, default to allowed or log warning
          await logMessage(jobId, io, `Failed to verify robots.txt for: ${normalized}, proceeding.`, 'warn');
        }
      }

      await logMessage(jobId, io, `Fetching [Depth: ${depth}]: ${normalized}`, 'info');

      try {
        const response = await axios.get(normalized, {
          timeout: 10000,
          maxContentLength: 5 * 1024 * 1024, // 5MB limit
          headers: {
            'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
          },
          validateStatus: (status) => status >= 200 && status < 400 // only allow success and redirects
        });

        const html = response.data;
        const statusCode = response.status;
        const contentSize = Buffer.byteLength(html, 'utf8');

        // Parse with Cheerio
        const $ = cheerio.load(html);

        // Strip scripts, stylesheets, and noscripts to clean text content
        $('script, style, noscript, svg, iframe').remove();

        const title = $('title').text().trim() || $('h1').first().text().trim() || normalized;
        
        const description = 
          $('meta[name="description"]').attr('content')?.trim() || 
          $('meta[property="og:description"]').attr('content')?.trim() || 
          $('p').first().text().trim().substring(0, 160) || '';

        const keywordsStr = $('meta[name="keywords"]').attr('content') || '';
        const keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);

        // Extract Headings
        const headings = {
          h1: [],
          h2: [],
          h3: []
        };
        $('h1').each((i, el) => {
          const txt = $(el).text().trim();
          if (txt && headings.h1.length < 10) headings.h1.push(txt);
        });
        $('h2').each((i, el) => {
          const txt = $(el).text().trim();
          if (txt && headings.h2.length < 15) headings.h2.push(txt);
        });
        $('h3').each((i, el) => {
          const txt = $(el).text().trim();
          if (txt && headings.h3.length < 20) headings.h3.push(txt);
        });

        // Extract Clean Text Content (Google-like indexable content)
        // Clean whitespace
        const content = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 250000);

        // Parse Links
        const links = [];
        const domainUrlObj = new URL(normalized);

        $('a[href]').each((i, el) => {
          const href = $(el).attr('href');
          const resolved = normalizeUrl(href, normalized);
          
          if (resolved) {
            try {
              const linkObj = new URL(resolved);
              // Only follow standard web protocols
              if (linkObj.protocol === 'http:' || linkObj.protocol === 'https:') {
                links.push(resolved);

                // Polite crawler: restrict queueing of sub-links to the seed domain to stay on targets
                if (linkObj.hostname.replace(/^www\./, '') === seedHostname) {
                  // Only queue if depth is within limits and it hasn't been crawled or queued yet
                  if (depth < job.maxDepth && !crawledUrls.has(resolved) && !queuedUrls.has(resolved)) {
                    queuedUrls.add(resolved);
                    queue.push({ url: resolved, depth: depth + 1 });
                  }
                }
              }
            } catch (err) {
              // Invalid URL
            }
          }
        });

        // Unique links for saving on page model
        const uniqueLinks = [...new Set(links)];

        // Save crawled page to Database
        const page = new Page({
          userId: job.userId,
          jobId,
          url: normalized,
          domain: domainUrlObj.host,
          title,
          description,
          keywords,
          headings,
          content,
          links: uniqueLinks,
          statusCode,
          contentSize
        });
        await page.save();

        pagesCrawledCount++;
        await logMessage(jobId, io, `Indexed page: "${title}" (${contentSize} bytes, ${uniqueLinks.length} links found)`, 'info');

        // Update Job counters
        await Job.findByIdAndUpdate(jobId, {
          pagesCrawled: pagesCrawledCount
        });

        if (io) {
          io.to(`job_${jobId}`).emit('progress', {
            pagesCrawled: pagesCrawledCount,
            pagesFailed: pagesFailedCount
          });
          io.emit('job_updated', { jobId, pagesCrawled: pagesCrawledCount });
        }

      } catch (err) {
        pagesFailedCount++;
        const errMsg = err.response ? `HTTP ${err.response.status}` : err.message;
        await logMessage(jobId, io, `Failed to crawl: ${normalized} (${errMsg})`, 'error');

        await Job.findByIdAndUpdate(jobId, {
          pagesFailed: pagesFailedCount
        });

        if (io) {
          io.to(`job_${jobId}`).emit('progress', {
            pagesCrawled: pagesCrawledCount,
            pagesFailed: pagesFailedCount
          });
        }
      }

      // Respect standard crawl interval (politeness delay)
      await sleep(1000);
    }

    // Finished crawling
    const finalJob = await Job.findById(jobId).select('status');
    const finalStatus = finalJob.status === 'stopped' ? 'stopped' : 'completed';

    await Job.findByIdAndUpdate(jobId, {
      status: finalStatus,
      endTime: new Date()
    });

    await logMessage(jobId, io, `Crawl finished. Total pages crawled: ${pagesCrawledCount}, failed: ${pagesFailedCount}. Status set to: ${finalStatus}`, 'info');

    if (io) {
      io.emit('job_updated', { jobId, status: finalStatus, endTime: new Date() });
    }

  } catch (err) {
    try {
      await logMessage(jobId, io, `Fatal Crawler Exception: ${err.message}`, 'error');
      await Job.findByIdAndUpdate(jobId, {
        status: 'failed',
        endTime: new Date()
      });
      if (io) io.emit('job_updated', { jobId, status: 'failed', endTime: new Date() });
    } catch (e) {
    }
  }
}

module.exports = {
  startCrawl
};
