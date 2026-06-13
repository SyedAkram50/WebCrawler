const express = require('express');
const router = express.Router();
const Page = require('../models/Page');
const Job = require('../models/Job');
const mongoose = require('mongoose');

/**
 * Get Aggregate Crawl Statistics
 * GET /api/stats
 */
router.get('/', async (req, res) => {
  try {
    const userIdObj = new mongoose.Types.ObjectId(req.user.id);
    
    // 1. Core Metrics
    const totalPages = await Page.countDocuments({ userId: req.user.id });
    const totalJobs = await Job.countDocuments({ userId: req.user.id });
    const uniqueDomainsArray = await Page.distinct('domain', { userId: req.user.id });
    const totalDomains = uniqueDomainsArray.length;

    // 2. Status Breakdown of Jobs
    const jobStats = await Job.aggregate([
      { $match: { userId: userIdObj } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const jobStatusBreakdown = {
      queued: 0,
      crawling: 0,
      completed: 0,
      stopped: 0,
      failed: 0
    };

    jobStats.forEach(stat => {
      if (jobStatusBreakdown[stat._id] !== undefined) {
        jobStatusBreakdown[stat._id] = stat.count;
      }
    });

    // 3. HTTP status code breakdown
    const httpStats = await Page.aggregate([
      { $match: { userId: userIdObj } },
      {
        $group: {
          _id: '$statusCode',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const httpStatusBreakdown = {};
    httpStats.forEach(stat => {
      const code = stat._id || 'Unknown';
      httpStatusBreakdown[code] = stat.count;
    });

    // 4. Data size and averages
    const sizeStats = await Page.aggregate([
      { $match: { userId: userIdObj } },
      {
        $group: {
          _id: null,
          totalBytes: { $sum: '$contentSize' },
          avgBytes: { $avg: '$contentSize' }
        }
      }
    ]);

    const totalBytes = sizeStats[0]?.totalBytes || 0;
    const avgPageSize = sizeStats[0]?.avgBytes ? Math.round(sizeStats[0].avgBytes) : 0;

    // 5. Recent Job Activity
    const recentJobs = await Job.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('seedUrl status pagesCrawled pagesFailed createdAt');

    // 6. Top Crawled Domains
    const domainStats = await Page.aggregate([
      { $match: { userId: userIdObj } },
      {
        $group: {
          _id: '$domain',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const topDomains = domainStats.map(d => ({
      domain: d._id,
      count: d.count
    }));

    res.json({
      totalPages,
      totalDomains,
      totalJobs,
      totalSizeKb: Math.round(totalBytes / 1024),
      avgPageSizeHtml: avgPageSize,
      jobStatusBreakdown,
      httpStatusBreakdown,
      topDomains,
      recentJobs
    });

  } catch (err) {
    console.error('Stats aggregation error:', err);
    res.status(500).json({ error: 'Failed to aggregate crawl statistics' });
  }
});

module.exports = router;
