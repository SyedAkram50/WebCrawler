const express = require('express');
const router = express.Router();
const Job = require('../models/Job');
const Page = require('../models/Page');
const { startCrawl } = require('../crawler/crawler');

/**
 * Start a new Crawling Job
 * POST /api/crawl/start
 */
router.post('/start', async (req, res) => {
  const { url, maxDepth, maxPages, respectRobots } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Seed URL is required' });
  }

  try {
    // Basic URL validation
    new URL(url);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    // Create new crawl job entry
    const job = new Job({
      userId: req.user.id,
      seedUrl: url,
      maxDepth: maxDepth || 3,
      maxPages: maxPages || 50,
      respectRobots: respectRobots !== undefined ? respectRobots : true,
      status: 'queued',
      logs: [{
        message: 'Crawl job created and queued.',
        level: 'info'
      }]
    });

    await job.save();

    // Trigger crawl in background
    const io = req.app.get('io');
    // We execute startCrawl in background without awaiting it to return response to client immediately
    startCrawl(job._id, io).catch(err => {
      console.error(`Error in startCrawl thread for job ${job._id}:`, err);
    });

    res.status(201).json(job);
  } catch (err) {
    console.error('Error starting crawl job:', err);
    res.status(500).json({ error: 'Failed to start crawl job' });
  }
});

/**
 * Stop a running Crawling Job
 * POST /api/crawl/stop/:id
 */
router.post('/stop/:id', async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user.id });
    if (!job) {
      return res.status(404).json({ error: 'Crawl job not found' });
    }

    if (job.status !== 'crawling' && job.status !== 'queued') {
      return res.status(400).json({ error: `Job cannot be stopped because status is: ${job.status}` });
    }

    // Set status to stopped. The background loop reads this and exits.
    job.status = 'stopped';
    job.endTime = new Date();
    job.logs.push({
      message: 'Stop command received. Finalizing...',
      level: 'warn'
    });
    await job.save();

    // Notify listeners
    const io = req.app.get('io');
    if (io) {
      io.emit('job_updated', { jobId: job._id, status: 'stopped', endTime: job.endTime });
      io.to(`job_${job._id}`).emit('log', {
        timestamp: new Date(),
        message: 'Crawl job stopped by user command.',
        level: 'warn'
      });
    }

    res.json({ message: 'Stop signal sent to crawler successfully', job });
  } catch (err) {
    console.error('Error stopping crawl job:', err);
    res.status(500).json({ error: 'Failed to stop crawl job' });
  }
});

/**
 * Get all crawl jobs list
 * GET /api/crawl/jobs
 */
router.get('/jobs', async (req, res) => {
  try {
    const jobs = await Job.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (err) {
    console.error('Error fetching jobs:', err);
    res.status(500).json({ error: 'Failed to fetch crawl jobs' });
  }
});

/**
 * Get details & logs of a specific crawl job
 * GET /api/crawl/jobs/:id
 */
router.get('/jobs/:id', async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user.id });
    if (!job) {
      return res.status(404).json({ error: 'Crawl job not found' });
    }
    res.json(job);
  } catch (err) {
    console.error('Error fetching job details:', err);
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

/**
 * Delete a crawl job and all associated crawled pages
 * DELETE /api/crawl/jobs/:id
 */
router.delete('/jobs/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    const job = await Job.findOne({ _id: jobId, userId: req.user.id });
    if (!job) {
      return res.status(404).json({ error: 'Crawl job not found' });
    }

    // Delete Job
    await Job.findByIdAndDelete(jobId);

    // Delete related crawled pages
    const deleteResult = await Page.deleteMany({ jobId });

    res.json({
      message: 'Crawl job and indexed pages deleted successfully',
      pagesDeleted: deleteResult.deletedCount
    });
  } catch (err) {
    console.error('Error deleting job:', err);
    res.status(500).json({ error: 'Failed to delete crawl job' });
  }
});

/**
 * Get pages crawled by a specific crawl job
 * GET /api/crawl/jobs/:id/pages
 */
router.get('/jobs/:id/pages', async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, userId: req.user.id });
    if (!job) return res.status(404).json({ error: 'Crawl job not found' });

    const pages = await Page.find({ jobId: req.params.id, userId: req.user.id })
      .select('url title statusCode contentSize crawlTime')
      .sort({ createdAt: -1 });
    res.json(pages);
  } catch (err) {
    console.error('Error fetching job pages:', err);
    res.status(500).json({ error: 'Failed to fetch job pages' });
  }
});

module.exports = router;
