#!/usr/bin/env node
// src/cli.js
const yargs = require('yargs');
const { JunkRemovalScraper } = require('./scraper');
const fs = require('fs').promises;
const path = require('path');

async function main() {
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
    .option('timeout', {
      alias: 't',
      type: 'number',
      description: 'Page load timeout in seconds',
      default: 30
    })
    .example('$0 -u https://www.junkmastersmn.com', 'Basic scraping')
    .example('$0 -u https://www.junkmastersmn.com -o results.json -v', 'Verbose with custom output')
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
    
    if (result.errors && result.errors.length > 0) {
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
    
    // Ensure output directory exists
    const outputDir = path.dirname(argv.output);
    if (outputDir && outputDir !== '.') {
      await fs.mkdir(outputDir, { recursive: true });
    }
    
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

// Run if called directly
if (require.main === module) {
  main();
}
