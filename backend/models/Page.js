const mongoose = require('mongoose');

const pageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
  url: { type: String, required: true },
  domain: { type: String, required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  keywords: [{ type: String }],
  headings: {
    h1: [{ type: String }],
    h2: [{ type: String }],
    h3: [{ type: String }]
  },
  content: { type: String, default: '' },
  links: [{ type: String }],
  crawlTime: { type: Date, default: Date.now },
  statusCode: { type: Number },
  contentSize: { type: Number }
}, {
  timestamps: true
});

// Compound text index for search query relevance ranking
pageSchema.index({
  title: 'text',
  description: 'text',
  content: 'text',
  keywords: 'text'
}, {
  weights: {
    title: 10,
    description: 5,
    keywords: 3,
    content: 1
  },
  name: 'PageTextIndex'
});

module.exports = mongoose.model('Page', pageSchema);
