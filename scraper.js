// scraper.js
const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
const yargs = require('yargs');
const fs = require('fs').promises;

class JunkRemovalScraper {
  constructor(verbose = false) {
    this.browser = null;
    this.verbose = verbose;
    this.sectionCounter = {
      hero: 0,
      about: 0,
      service: 0,
      cta: 0,
      testimonial: 0,
      faq: 0,
      benefit: 0,
      process: 0,
      footer: 0,
      other: 0
    };
  }

  log(message, data = null) {
    if (this.verbose) {
      console.log(`[SCRAPER] ${message}`);
      if (data) console.log(JSON.stringify(data, null, 2));
    }
  }

  async initialize() {
    this.log('Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    this.log('Browser initialized');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.log('Browser closed');
    }
  }

  resetCounters() {
    Object.keys(this.sectionCounter).forEach(key => {
      this.sectionCounter[key] = 0;
    });
  }

  async scrapeWebsite(url) {
    const page = await this.browser.newPage();
    this.resetCounters();
    const results = {
      url: url,
      title: '',
      scrapedAt: new Date().toISOString(),
      sections: [],
      errors: []
    };
    
    try {
      // Set viewport for desktop view
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
      
      this.log(`Navigating to ${url}...`);
      
      // Navigate with network idle wait for React rendering
      await page.goto(url, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      this.log('Page loaded, waiting for additional content...');
      
      // Additional wait for any delayed rendering
      await page.waitForTimeout(2000);
      
      // Get page title
      results.title = await page.title();
      this.log(`Page title: ${results.title}`);
      
      // Scroll to handle lazy-loaded content
      this.log('Scrolling to load lazy content...');
      await this.autoScroll(page);
      
      // Extract and group content
      this.log('Extracting content...');
      const rawElements = await page.evaluate(() => {
        const elements = [];
        const processedNodes = new Set();
        
        // Helper to normalize spaces while preserving text exactly
        const normalizeSpaces = (text) => {
          if (!text) return '';
          // Only normalize multiple spaces to single space
          // Keep everything else exactly as is
          return text.replace(/[ \t]+/g, ' ').trim();
        };
        
        // Helper to count words
        const countWords = (text) => {
          return text.split(/\s+/).filter(word => word.length > 0).length;
        };
        
        // Helper to check if element should be skipped
        const shouldSkipElement = (element) => {
          const tag = element.tagName.toLowerCase();
          const classList = Array.from(element.classList).join(' ').toLowerCase();
          const id = (element.id || '').toLowerCase();
          const role = (element.getAttribute('role') || '').toLowerCase();
          
          // Skip navigation elements
          if (tag === 'nav' || role === 'navigation' || 
              classList.includes('nav') || classList.includes('menu') || 
              id.includes('nav') || id.includes('menu')) {
            return true;
          }
          
          // Skip form elements (but not buttons)
          if (['input', 'select', 'textarea', 'label', 'option', 'fieldset', 'legend'].includes(tag)) {
            return true;
          }
          
          // Skip script, style, and meta elements
          if (['script', 'style', 'noscript', 'meta', 'link'].includes(tag)) {
            return true;
          }
          
          // Skip hidden elements
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || 
              style.visibility === 'hidden' || 
              style.opacity === '0' ||
              element.offsetWidth === 0 || 
              element.offsetHeight === 0) {
            return true;
          }
          
          // Skip aria-hidden elements
          if (element.getAttribute('aria-hidden') === 'true') {
            return true;
          }
          
          return false;
        };
        
        // Helper to get element bounds for position sorting
        const getElementPosition = (element) => {
          const rect = element.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
          
          return {
            top: Math.round(rect.top + scrollTop),
            left: Math.round(rect.left + scrollLeft),
            bottom: Math.round(rect.bottom + scrollTop),
            right: Math.round(rect.right + scrollLeft),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        };
        
        // Helper to get XPath
        const getXPath = (element) => {
          if (element.id) return `//*[@id="${element.id}"]`;
          if (element === document.body) return '/html/body';
          
          let ix = 0;
          const siblings = element.parentNode.childNodes;
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === element) {
              return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']';
            }
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
              ix++;
            }
          }
        };
        
        // Helper to check if element is a card container
        const isCardContainer = (element) => {
          const classList = Array.from(element.classList).join(' ').toLowerCase();
          const hasCardClass = classList.includes('card') || 
                              classList.includes('service') || 
                              classList.includes('feature') || 
                              classList.includes('item') ||
                              classList.includes('box');
          
          // Check if it has typical card structure
          const hasHeading = element.querySelector('h1, h2, h3, h4, h5, h6');
          const hasText = element.querySelector('p, span, div');
          const hasMultipleElements = element.children.length >= 2;
          
          return hasCardClass && hasHeading && hasText && hasMultipleElements;
        };
        
        // Helper to get visible text exactly as displayed
        const getExactVisibleText = (element) => {
          // For buttons and links, use textContent to avoid issues
          if (element.tagName === 'BUTTON' || element.tagName === 'A') {
            const text = element.textContent || '';
            return normalizeSpaces(text);
          }
          
          // Check if element has only text nodes (no child elements)
          const hasOnlyTextNodes = Array.from(element.childNodes).every(
            node => node.nodeType === Node.TEXT_NODE || 
                   (node.nodeType === Node.ELEMENT_NODE && shouldSkipElement(node))
          );
          
          if (hasOnlyTextNodes) {
            // Use innerText for accurate display text
            const text = element.innerText || '';
            return normalizeSpaces(text);
          }
          
          return '';
        };
        
        // Helper to find associated button
        const findAssociatedButton = (element) => {
          // Check within the element
          let button = element.querySelector('button, a.btn, a.button, [class*="btn"], [class*="button"]');
          
          // Check parent container
          if (!button && element.parentElement) {
            const parent = element.parentElement;
            button = parent.querySelector('button, a.btn, a.button, [class*="btn"], [class*="button"]');
          }
          
          // Check next siblings
          if (!button) {
            let sibling = element.nextElementSibling;
            let count = 0;
            while (sibling && count < 3) {
              if (sibling.tagName === 'BUTTON' || 
                  (sibling.tagName === 'A' && sibling.className.match(/btn|button/))) {
                button = sibling;
                break;
              }
              sibling = sibling.nextElementSibling;
              count++;
            }
          }
          
          if (button && !processedNodes.has(button)) {
            const buttonText = normalizeSpaces(button.innerText || button.textContent || '');
            return {
              hasButton: true,
              buttonText: buttonText || null,
              buttonElement: button
            };
          }
          
          return {
            hasButton: false,
            buttonText: null,
            buttonElement: null
          };
        };
        
        // Process card containers first
        const cardContainers = document.querySelectorAll('[class*="card"], [class*="service-item"], [class*="feature"], .box');
        
        cardContainers.forEach(card => {
          if (shouldSkipElement(card) || processedNodes.has(card)) return;
          
          if (isCardContainer(card)) {
            const position = getElementPosition(card);
            const buttonInfo = findAssociatedButton(card);
            
            // Get all text from card exactly as displayed
            const cardText = normalizeSpaces(card.innerText || '');
            const wordCount = countWords(cardText);
            
            if (wordCount >= 4) {
              elements.push({
                element: card,
                tag: 'card',
                text: cardText,
                wordCount: wordCount,
                isHeading: false,
                position: position,
                xpath: getXPath(card),
                buttonInfo: buttonInfo,
                classList: Array.from(card.classList),
                id: card.id || null,
                isCard: true
              });
              
              // Mark all child elements as processed
              card.querySelectorAll('*').forEach(child => {
                processedNodes.add(child);
              });
              processedNodes.add(card);
              
              if (buttonInfo.buttonElement) {
                processedNodes.add(buttonInfo.buttonElement);
              }
            }
          }
        });
        
        // Process remaining elements
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: function(node) {
              if (shouldSkipElement(node) || processedNodes.has(node)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        
        let node;
        while (node = walker.nextNode()) {
          if (processedNodes.has(node)) continue;
          
          const tag = node.tagName.toLowerCase();
          const text = getExactVisibleText(node);
          const wordCount = countWords(text);
          
          // Always include headings, even if short
          const isHeading = /^h[1-6]$/.test(tag);
          
          // Include if it's a heading or has 4+ words
          if ((isHeading && text) || wordCount >= 4) {
            const position = getElementPosition(node);
            const buttonInfo = findAssociatedButton(node);
            
            elements.push({
              element: node,
              tag: tag,
              text: text,
              wordCount: wordCount,
              isHeading: isHeading,
              position: position,
              xpath: getXPath(node),
              buttonInfo: buttonInfo,
              classList: Array.from(node.classList),
              id: node.id || null
            });
            
            processedNodes.add(node);
            if (buttonInfo.buttonElement) {
              processedNodes.add(buttonInfo.buttonElement);
            }
          }
        }
        
        // Sort elements by position (top to bottom, left to right)
        elements.sort((a, b) => {
          const rowThreshold = 50; // Elements within 50px are considered same row
          
          if (Math.abs(a.position.top - b.position.top) < rowThreshold) {
            return a.position.left - b.position.left;
          }
          return a.position.top - b.position.top;
        });
        
        return elements;
      });
      
      this.log(`Found ${rawElements.length} raw elements`);
      
      // Group related content
      const groupedSections = this.groupRelatedContent(rawElements);
      this.log(`Grouped into ${groupedSections.length} sections`);
      
      // Convert to final format
      results.sections = groupedSections.map((group, index) => {
        const sectionType = this.determineSectionType(group);
        this.sectionCounter[sectionType]++;
        
        const section = {
          sectionId: `${sectionType}-${this.sectionCounter[sectionType]}`,
          sectionType: sectionType,
          element: group.primaryElement.tag,
          text: group.combinedText,
          charCount: group.combinedText.length,
          parentContainer: this.getParentContainer(group.primaryElement),
          xpath: group.primaryElement.xpath,
          order: index + 1,
          keywords: [], // Removed keyword extraction
          hasButton: group.hasButton,
          buttonText: group.buttonText
        };
        
        this.log(`Section ${section.sectionId}: ${section.text.substring(0, 50)}...`);
        
        return section;
      });
      
      this.log(`Scraping complete: ${results.sections.length} sections found`);
      
    } catch (error) {
      console.error('Scraping error:', error);
      results.errors.push({
        message: error.message,
        stack: error.stack
      });
    } finally {
      await page.close();
    }
    
    return results;
  }
  
  async autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0); // Scroll back to top
            resolve();
          }
        }, 200);
        
        // Max 10 seconds of scrolling
        setTimeout(() => {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }, 10000);
      });
    });
    
    // Wait for any newly loaded content
    await page.waitForTimeout(1000);
  }
  
  groupRelatedContent(elements) {
    const groups = [];
    let i = 0;
    
    while (i < elements.length) {
      const current = elements[i];
      const group = {
        primaryElement: current,
        elements: [current],
        combinedText: current.text,
        hasButton: current.buttonInfo.hasButton,
        buttonText: current.buttonInfo.buttonText
      };
      
      // If it's a heading, collect following content
      if (current.isHeading && !current.isCard) {
        let j = i + 1;
        
        // Collect following paragraphs, lists, and non-heading content
        while (j < elements.length) {
          const next = elements[j];
          
          // Stop if we hit another heading or card
          if (next.isHeading || next.isCard) break;
          
          // Stop if elements are too far apart vertically (new section)
          if (next.position.top - elements[j-1].position.bottom > 150) break;
          
          // Add to group
          group.elements.push(next);
          if (group.combinedText && next.text) {
            group.combinedText += ' ' + next.text;
          }
          
          // Update button info if found
          if (next.buttonInfo.hasButton) {
            group.hasButton = true;
            group.buttonText = next.buttonInfo.buttonText;
          }
          
          j++;
        }
        
        i = j;
      } else {
        // Standalone element or card
        i++;
      }
      
      // Only add groups with content
      if (group.combinedText && group.combinedText.trim()) {
        groups.push(group);
      }
    }
    
    return groups;
  }
  
  determineSectionType(group) {
    const text = group.combinedText.toLowerCase();
    const primaryTag = group.primaryElement.tag;
    const classList = group.primaryElement.classList.join(' ').toLowerCase();
    const id = (group.primaryElement.id || '').toLowerCase();
    
    // Hero detection - first major heading or hero classes
    if ((primaryTag === 'h1' && group.primaryElement.position.top < 800) || 
        classList.includes('hero') || 
        id.includes('hero')) {
      return 'hero';
    }
    
    // CTA detection - priority over other types if has button
    if (group.hasButton && (
        text.includes('call now') || 
        text.includes('get quote') || 
        text.includes('free estimate') ||
        text.includes('contact') ||
        text.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/))) {
      return 'cta';
    }
    
    // Service detection
    if (text.includes('service') || 
        text.includes('residential') || 
        text.includes('commercial') ||
        text.includes('construction') ||
        text.includes('estate') ||
        text.includes('hoarding') ||
        text.includes('appliance') ||
        text.includes('furniture') ||
        classList.includes('service') ||
        group.primaryElement.isCard) {
      return 'service';
    }
    
    // Testimonial detection
    if (text.includes('testimonial') || 
        text.includes('review') || 
        text.includes('customer') ||
        text.includes('client') ||
        text.match(/"[^"]{20,}"/) || // Quoted text
        classList.includes('testimonial') ||
        classList.includes('review')) {
      return 'testimonial';
    }
    
    // FAQ detection
    if (text.includes('faq') || 
        text.includes('frequently asked') || 
        text.includes('question') ||
        text.includes('answer') ||
        classList.includes('faq') ||
        classList.includes('accordion')) {
      return 'faq';
    }
    
    // Benefit detection
    if (text.includes('why choose') || 
        text.includes('benefit') || 
        text.includes('advantage') ||
        text.includes('licensed') ||
        text.includes('insured') ||
        text.includes('eco-friendly') ||
        classList.includes('benefit') ||
        classList.includes('feature')) {
      return 'benefit';
    }
    
    // Process detection
    if (text.includes('how it works') || 
        text.includes('process') || 
        text.includes('step') ||
        text.includes('simple') ||
        classList.includes('process') ||
        classList.includes('steps')) {
      return 'process';
    }
    
    // About detection
    if (text.includes('about') || 
        text.includes('our company') || 
        text.includes('who we are') ||
        text.includes('our mission') ||
        classList.includes('about')) {
      return 'about';
    }
    
    // Footer detection
    if (group.primaryElement.position.top > 3000 || // Far down the page
        classList.includes('footer') ||
        text.includes('copyright') ||
        text.includes('all rights reserved')) {
      return 'footer';
    }
    
    return 'other';
  }
  
  getParentContainer(element) {
    const classList = element.classList || [];
    
    // Check common container patterns
    if (classList.some(c => c.includes('header'))) return 'header';
    if (classList.some(c => c.includes('hero'))) return 'hero-section';
    if (classList.some(c => c.includes('service'))) return 'services-section';
    if (classList.some(c => c.includes('testimonial'))) return 'testimonials-section';
    if (classList.some(c => c.includes('footer'))) return 'footer';
    if (classList.some(c => c.includes('main'))) return 'main';
    if (classList.some(c => c.includes('content'))) return 'content';
    if (classList.some(c => c.includes('container'))) return 'container';
    
    return 'section';
  }
}

// CLI Interface
async function runCLI() {
  const argv = yargs
    .usage('Usage: $0 [options]')
    .option('url', {
      alias: 'u',
      type: 'string',
      description: 'URL to scrape',
      demandOption: true
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      description: 'Output file path',
      default: 'scraped-content.json'
    })
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      description: 'Enable verbose logging',
      default: false
    })
    .option('pretty', {
      alias: 'p',
      type: 'boolean',
      description: 'Pretty print JSON output',
      default: true
    })
    .help()
    .alias('help', 'h')
    .argv;
  
  const scraper = new JunkRemovalScraper(argv.verbose);
  
  try {
    console.log(`🚀 Initializing scraper...`);
    await scraper.initialize();
    
    console.log(`📄 Scraping ${argv.url}...`);
    const startTime = Date.now();
    const result = await scraper.scrapeWebsite(argv.url);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n✅ Scraping complete in ${duration}s!`);
    console.log(`📊 Title: ${result.title}`);
    console.log(`📊 Total sections found: ${result.sections.length}`);
    
    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${result.errors.length}`);
      result.errors.forEach(err => console.error(`   - ${err.message}`));
    }
    
    // Count sections by type
    const sectionCounts = {};
    result.sections.forEach(section => {
      sectionCounts[section.sectionType] = (sectionCounts[section.sectionType] || 0) + 1;
    });
    
    console.log('\n📋 Sections by type:');
    Object.entries(sectionCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
    // Save to file
    const jsonOutput = argv.pretty 
      ? JSON.stringify(result, null, 2) 
      : JSON.stringify(result);
    
    await fs.writeFile(argv.output, jsonOutput, 'utf8');
    console.log(`\n💾 Results saved to: ${argv.output}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (argv.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

// API Server
function createAPIServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(cors()); // Enable CORS for browser requests
  
  const scraper = new JunkRemovalScraper(process.env.VERBOSE === 'true');
  
  // Initialize scraper on server start
  scraper.initialize().then(() => {
    console.log('✅ Scraper initialized');
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime()
    });
  });
  
  // Main scraping endpoint
  app.post('/scrape', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'URL is required',
        message: 'Please provide a URL in the request body'
      });
    }
    
    // Validate URL
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ 
        error: 'Invalid URL',
        message: 'Please provide a valid URL'
      });
    }
    
    try {
      console.log(`📄 Scraping ${url}...`);
      const startTime = Date.now();
      const result = await scraper.scrapeWebsite(url);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`✅ Scraping complete in ${duration}s`);
      res.json({
        ...result,
        scrapingDuration: parseFloat(duration)
      });
    } catch (error) {
      console.error('❌ Scraping error:', error);
      res.status(500).json({ 
        error: 'Scraping failed',
        message: error.message,
        url: url
      });
    }
  });
  
  // Cleanup on server shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await scraper.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down server...');
    await scraper.close();
    process.exit(0);
  });
  
  return app;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--server') || args.includes('-s')) {
    const port = process.env.PORT || 3000;
    const app = createAPIServer();
    app.listen(port, () => {
      console.log(`\n🚀 API server running on http://localhost:${port}`);
      console.log(`📡 Endpoints:`);
      console.log(`   POST /scrape - Scrape a website`);
      console.log(`   GET  /health - Health check\n`);
    });
  } else {
    runCLI();
  }
}

module.exports = { JunkRemovalScraper, createAPIServer };
