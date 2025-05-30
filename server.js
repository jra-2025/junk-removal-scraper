// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { JunkRemovalScraper } = require('./src/scraper');
const path = require('path');

// Create Express app
const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Initialize scraper
let scraper = null;
const initScraper = async () => {
  if (!scraper) {
    scraper = new JunkRemovalScraper(process.env.VERBOSE === 'true');
    await scraper.initialize();
    console.log('✅ Scraper initialized');
  }
  return scraper;
};

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Junk Removal Web Scraper API',
    version: '1.0.0',
    endpoints: {
      'GET /': 'API information',
      'GET /health': 'Health check',
      'POST /api/scrape': 'Scrape a junk removal website',
      'GET /api/test': 'Test endpoint with example URL'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test endpoint
app.get('/api/test', async (req, res) => {
  try {
    await initScraper();
    res.json({
      message: 'Scraper is ready',
      testUrl: 'https://www.junkmastersmn.com',
      instructions: 'Send a POST request to /api/scrape with {"url": "https://www.junkmastersmn.com"}'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to initialize scraper',
      message: error.message
    });
  }
});

// Main scraping endpoint
app.post('/api/scrape', async (req, res) => {
  const { url, options = {} } = req.body;
  
  // Validate request
  if (!url) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'URL is required in request body',
      example: { url: 'https://www.junkmastersmn.com' }
    });
  }
  
  // Validate URL format
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Invalid protocol');
    }
  } catch (e) {
    return res.status(400).json({
      error: 'Invalid URL',
      message: 'Please provide a valid HTTP or HTTPS URL'
    });
  }
  
  try {
    // Initialize scraper if needed
    await initScraper();
    
    console.log(`📄 Scraping ${url}...`);
    const startTime = Date.now();
    
    // Perform scraping
    const result = await scraper.scrapeWebsite(url);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`✅ Scraping complete in ${duration}s - Found ${result.sections.length} sections`);
    
    // Add metadata
    const response = {
      ...result,
      metadata: {
        scrapingDuration: parseFloat(duration),
        sectionsFound: result.sections.length,
        sectionTypes: [...new Set(result.sections.map(s => s.sectionType))],
        timestamp: new Date().toISOString()
      }
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Scraping error:', error);
    
    // Determine appropriate status code
    let statusCode = 500;
    if (error.message.includes('timeout')) {
      statusCode = 504;
    } else if (error.message.includes('navigation')) {
      statusCode = 502;
    }
    
    res.status(statusCode).json({
      error: 'Scraping Failed',
      message: error.message,
      url: url,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: {
      'GET /': 'API information',
      'GET /health': 'Health check',
      'POST /api/scrape': 'Scrape a website'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
  
  if (scraper) {
    await scraper.close();
    console.log('✅ Scraper closed');
  }
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server - CHANGED TO PORT 8080 FOR CLOUD RUN
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`
🚀 Junk Removal Scraper API Server
📡 Running on http://${HOST}:${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📝 Documentation: GET /
🔧 Health Check: GET /health
🔍 Scrape Endpoint: POST /api/scrape
  `);
});

module.exports = app;
