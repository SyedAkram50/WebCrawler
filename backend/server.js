require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

// Import routes
const crawlRoutes = require('./routes/crawl');
const searchRoutes = require('./routes/search');
const statsRoutes = require('./routes/stats');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST', 'DELETE']
  }
});

// Port configuration
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crawler';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inject Socket.io instance into Express app to access in routers
app.set('io', io);

// API Routing bindings
app.use('/api/auth', authRoutes);
app.use('/api/crawl', authMiddleware, crawlRoutes);
app.use('/api/search', authMiddleware, searchRoutes);
app.use('/api/stats', authMiddleware, statsRoutes);

// Base healthcheck route
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

// Socket.io Connection Logic
io.on('connection', (socket) => {
  // Client subscribes to updates for a specific crawl job
  socket.on('join_job', (jobId) => {
    socket.join(`job_${jobId}`);
  });

  // Client unsubscribes from a crawl job room
  socket.on('leave_job', (jobId) => {
    socket.leave(`job_${jobId}`);
  });

  socket.on('disconnect', () => {});
});

// Connect to MongoDB & Start Server
mongoose.connect(MONGODB_URI)
  .then(() => {
    server.listen(PORT, () => {});
  })
  .catch(err => {
    process.exit(1);
  });
