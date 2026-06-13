const express = require('express');
const router = express.Router();
const Page = require('../models/Page');

/**
 * Extracts a text snippet containing search terms
 */
function extractSnippet(content, description, searchQuery) {
  if (!content) return description || '';
  
  // Clean up content whitespace
  const cleanContent = content.replace(/\s+/g, ' ').trim();
  const cleanDesc = (description || '').replace(/\s+/g, ' ').trim();

  // If no search query, return meta description or beginning of content
  if (!searchQuery) {
    return cleanDesc || cleanContent.substring(0, 160) + '...';
  }

  // Tokenize search terms, filter out small words
  const terms = searchQuery
    .toLowerCase()
    .split(/[\s,.-]+/)
    .filter(term => term.length > 2);

  if (terms.length === 0) {
    return cleanDesc || cleanContent.substring(0, 160) + '...';
  }

  // Find the index of the first matching search term in content
  let matchIndex = -1;
  let matchedTerm = '';
  
  for (const term of terms) {
    const idx = cleanContent.toLowerCase().indexOf(term);
    if (idx !== -1) {
      matchIndex = idx;
      matchedTerm = term;
      break;
    }
  }

  // If no match found in body content, check in description
  if (matchIndex === -1) {
    for (const term of terms) {
      const idx = cleanDesc.toLowerCase().indexOf(term);
      if (idx !== -1) {
        return cleanDesc; // Description matches, return it
      }
    }
    // Default fallback to description or start of content
    return cleanDesc || cleanContent.substring(0, 160) + '...';
  }

  // Extract snippet surrounding the match index
  const snippetLength = 180;
  const startIdx = Math.max(0, matchIndex - 50);
  const endIdx = Math.min(cleanContent.length, startIdx + snippetLength);

  let snippet = cleanContent.substring(startIdx, endIdx);

  // Add ellipses
  if (startIdx > 0) snippet = '...' + snippet;
  if (endIdx < cleanContent.length) snippet = snippet + '...';

  return snippet;
}

/**
 * Search Indexed Pages
 * GET /api/search
 */
router.get('/', async (req, res) => {
  const query = req.query.q ? req.query.q.trim() : '';
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  if (!query) {
    return res.json({
      results: [],
      totalResults: 0,
      page,
      totalPages: 0,
      timeTaken: 0
    });
  }

  const startTime = process.hrtime();

  try {
    let searchCriteria = {};
    let sortCriteria = {};
    let projection = {};

    // Check if it is an exact URL search (e.g. starting with http)
    const isUrl = /^https?:\/\//i.test(query);

    if (isUrl) {
      searchCriteria = { url: query, userId: req.user.id };
    } else {
      // Perform text search using index
      searchCriteria = { $text: { $search: query }, userId: req.user.id };
      projection = { score: { $meta: 'textScore' } };
      sortCriteria = { score: { $meta: 'textScore' } };
    }

    // Try text search
    let totalResults = await Page.countDocuments(searchCriteria);
    let pages = [];

    if (totalResults > 0) {
      pages = await Page.find(searchCriteria, projection)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit);
    } else if (!isUrl) {
      // FALLBACK: If text search yielded 0 results, perform a case-insensitive regex search
      // (useful for partial words/queries that aren't fully indexed by text analyzer)
      const regexQuery = new RegExp(query.split(/\s+/).join('|'), 'i');
      searchCriteria = {
        userId: req.user.id,
        $or: [
          { title: { $regex: regexQuery } },
          { description: { $regex: regexQuery } },
          { content: { $regex: regexQuery } },
          { keywords: { $regex: regexQuery } }
        ]
      };
      
      totalResults = await Page.countDocuments(searchCriteria);
      pages = await Page.find(searchCriteria)
        .sort({ title: 1 })
        .skip(skip)
        .limit(limit);
    }

    const elapsed = process.hrtime(startTime);
    // Convert to seconds with 3 decimals
    const timeTaken = (elapsed[0] + elapsed[1] / 1e9).toFixed(3);

    // Format search results and extract snippets
    const formattedResults = pages.map(p => {
      const doc = p.toObject();
      return {
        _id: doc._id,
        url: doc.url,
        domain: doc.domain,
        title: doc.title,
        description: doc.description,
        statusCode: doc.statusCode,
        crawlTime: doc.crawlTime,
        score: doc.score || null,
        snippet: extractSnippet(doc.content, doc.description, query)
      };
    });

    res.json({
      results: formattedResults,
      totalResults,
      page,
      totalPages: Math.ceil(totalResults / limit),
      timeTaken
    });

  } catch (err) {
    console.error('Search query error:', err);
    res.status(500).json({ error: 'Failed to process search query' });
  }
});

module.exports = router;
