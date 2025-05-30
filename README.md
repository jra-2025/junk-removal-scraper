# Junk Removal Website Scraper

A powerful Node.js web scraping tool designed specifically for analyzing junk removal websites. It handles React-rendered content and extracts all text blocks in a structured format perfect for SEO analysis and content rewriting.

## Features

- **React/JavaScript Support**: Uses Puppeteer to handle client-side rendered content
- **Intelligent Text Extraction**: Extracts all text blocks with 4+ words exactly as displayed
- **Smart Content Grouping**: Groups headings with related paragraphs and content
- **Dual Mode Operation**: Works as both CLI tool and REST API server
- **Clean JSON Output**: Structured data with section types, character counts, and metadata
- **Production Ready**: Rate limiting, CORS support, error handling, and graceful shutdown

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd junk-removal-scraper

# Install dependencies
npm install

# Run as API server
npm start

# Or use CLI mode
npm run cli -- --url https://www.junkmastersmn.com --output results.json
```

## Project Structure

```
junk-removal-scraper/
├── server.js           # Express API server
├── package.json        # Dependencies and scripts
├── README.md          # Documentation
├── .env.example       # Environment variables template
├── .gitignore         # Git ignore file
├── src/
│   ├── scraper.js     # Main scraper class
│   └── cli.js         # CLI interface
├── tests/
│   └── test-scraper.js # Test suite
├── examples/
│   └── example-usage.js # Usage examples
└── output/            # JSON output directory (gitignored)
```

## Installation

### Prerequisites

- Node.js 14.0.0 or higher
- npm or yarn
- Chrome/Chromium (automatically installed by Puppeteer)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd junk-removal-scraper
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure environment variables (optional):
```env
PORT=3000
NODE_ENV=production
VERBOSE=false
CORS_ORIGIN=*
```

## Usage

### API Server Mode

Start the server:
```bash
npm start
# or for development with auto-reload
npm run dev
```

The server runs on `http://localhost:3000` by default.

#### API Endpoints

**GET /** - API information and available endpoints

**GET /health** - Health check endpoint
```bash
curl http://localhost:3000/health
```

**POST /api/scrape** - Scrape a website
```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.junkmastersmn.com"}'
```

Response format:
```json
{
  "url": "https://www.junkmastersmn.com",
  "title": "Page Title",
  "scrapedAt": "2024-01-20T10:00:00Z",
  "sections": [
    {
      "sectionId": "hero-1",
      "sectionType": "hero",
      "element": "h1",
      "text": "TWIN CITIES JUNK REMOVAL SERVICES",
      "charCount": 34,
      "parentContainer": "hero-section",
      "xpath": "//*[@id='hero']/h1",
      "order": 1,
      "keywords": [],
      "hasButton": true,
      "buttonText": "Get Free Quote"
    }
  ],
  "metadata": {
    "scrapingDuration": 5.23,
    "sectionsFound": 35,
    "sectionTypes": ["hero", "service", "cta", "testimonial"],
    "timestamp": "2024-01-20T10:00:00Z"
  }
}
```

### CLI Mode

Basic usage:
```bash
npm run cli -- --url https://www.junkmastersmn.com
```

With options:
```bash
npm run cli -- \
  --url https://www.junkmastersmn.com \
  --output output/results.json \
  --verbose
```

CLI Options:
- `-u, --url` (required): URL to scrape
- `-o, --output`: Output file path (default: scraped-content.json)
- `-v, --verbose`: Enable verbose logging
- `-p, --pretty`: Pretty print JSON (default: true)
- `-h, --help`: Show help

### Programmatic Usage

```javascript
const { JunkRemovalScraper } = require('./src/scraper');

async function scrapeWebsite() {
  const scraper = new JunkRemovalScraper();
  await scraper.initialize();
  
  try {
    const result = await scraper.scrapeWebsite('https://www.junkmastersmn.com');
    console.log(`Found ${result.sections.length} sections`);
    
    // Process results...
  } finally {
    await scraper.close();
  }
}
```

## Section Types

The scraper identifies and categorizes content into these section types:

- **hero**: Main headings, typically h1 tags or content at the top of the page
- **service**: Service descriptions (residential, commercial, construction, etc.)
- **cta**: Call-to-action areas with buttons or phone numbers
- **testimonial**: Customer reviews and testimonials
- **faq**: Frequently asked questions
- **benefit**: Why choose us, features, advantages
- **process**: How it works, step-by-step guides
- **about**: Company information
- **footer**: Footer content
- **other**: All other content

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Scraper Configuration
VERBOSE=false
TIMEOUT=30000

# CORS Configuration
CORS_ORIGIN=*

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

### Puppeteer Options

The scraper uses these default Puppeteer settings:
- Viewport: 1920x1080 (desktop)
- Wait for network idle
- Auto-scroll for lazy-loaded content
- 30-second timeout

## Testing

Run the test suite:
```bash
npm test
```

The test suite verifies:
- Minimum 20 sections extracted
- All section types detected
- Accurate character counts
- No duplicate content
- Proper React component handling

## Examples

### Example 1: Basic Scraping

```javascript
const result = await scraper.scrapeWebsite('https://www.junkmastersmn.com');

// Access hero section
const heroSection = result.sections.find(s => s.sectionType === 'hero');
console.log(heroSection.text); // "TWIN CITIES JUNK REMOVAL SERVICES"
```

### Example 2: Find All Services

```javascript
const services = result.sections.filter(s => s.sectionType === 'service');
services.forEach(service => {
  console.log(`Service: ${service.text}`);
});
```

### Example 3: Extract Phone Numbers

```javascript
const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
const phoneSections = result.sections.filter(s => phoneRegex.test(s.text));
```

## Error Handling

The scraper includes comprehensive error handling:

- Network timeouts (30 seconds default)
- Invalid URLs
- React rendering failures
- Partial results on error
- Graceful shutdown

## Performance

- Processes 30-50 sections per page
- Average scraping time: 3-8 seconds
- Memory usage: ~200-300MB during scraping
- Concurrent requests: Limited by rate limiter

## Troubleshooting

### Common Issues

1. **Timeout Errors**
   - Increase timeout in environment variables
   - Check if site is accessible

2. **Missing Content**
   - Site may use lazy loading
   - Increase scroll delay
   - Check for dynamic content

3. **Memory Issues**
   - Close browser between requests
   - Limit concurrent operations

### Debug Mode

Enable verbose logging:
```bash
VERBOSE=true npm start
```

## API Rate Limiting

Default limits:
- 100 requests per 15 minutes per IP
- Configurable via environment variables

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review examples in `/examples`
3. Open an issue on GitHub

## Disclaimer

This tool is for legitimate SEO analysis and content auditing purposes only. Always respect website terms of service and robots.txt files.
