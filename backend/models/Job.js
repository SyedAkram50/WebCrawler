const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  level: { type: String, enum: ['info', 'warn', 'error'], default: 'info' },
  message: { type: String, required: true }
});

const jobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seedUrl: { type: String, required: true },
  maxDepth: { type: Number, default: 3 },
  maxPages: { type: Number, default: 50 },
  respectRobots: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['queued', 'crawling', 'completed', 'stopped', 'failed'],
    default: 'queued'
  },
  pagesCrawled: { type: Number, default: 0 },
  pagesFailed: { type: Number, default: 0 },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  logs: [logSchema]
}, {
  timestamps: true
});

module.exports = mongoose.model('Job', jobSchema);
