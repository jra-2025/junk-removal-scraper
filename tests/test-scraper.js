// tests/test-scraper.js
const { JunkRemovalScraper } = require('../src/scraper');
const fs = require('fs').promises;

class ScraperTestSuite {
  constructor() {
    this.scraper = null;
    this.results = {};
    this.testsPassed = 0;
    this.testsFailed = 0;
  }

  async initialize() {
    console.log('🔧 Initializing test suite...\n');
    this.scraper = new JunkRemovalScraper(false); // Set to true for verbose
    await this.scraper.initialize();
  }

  async cleanup() {
    if (this.scraper) {
      await this.scraper.close();
    }
  }

  logTest(testName, passed, details = '') {
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${testName}`);
    if (details) {
      console.log(`   ${details}`);
    }
    if (passed) {
      this.testsPassed++;
    } else {
      this.testsFailed++;
    }
  }

  async testJunkMastersMN() {
    console.log('🧪 Testing www.junkmastersmn.com\n');
    
    try {
      const startTime = Date.now();
      const result = await this.scraper.scrapeWebsite('https://www.junkmastersmn.com');
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      this.results.junkmasters = result;
      
      console.log(`⏱️  Scraping completed in ${duration}s\n`);
      
      // Display first 5 sections
      console.log('📋 First 5 sections:\n');
      result.sections.slice(0, 5).forEach((section, index) => {
        console.log(`Section ${index + 1}:`);
        console.log(`  ID: ${section.sectionId}`);
        console.log(`  Type: ${section.sectionType}`);
        console.log(`  Text: "${section.text.substring(0, 100)}${section.text.length > 100 ? '...' : ''}"`);
        console.log(`  Char Count: ${section.charCount}`);
        console.log(`  Has Button: ${section.hasButton}`);
        if (section.buttonText) {
          console.log(`  Button Text: "${section.buttonText}"`);
        }
        console.log('');
      });
      
      // Total sections count
      console.log(`📊 Total sections found: ${result.sections.length}\n`);
      
      // Run specific content tests
      console.log('🔍 Content Verification:\n');
      
      // Test 1: Hero section
      const heroSection = result.sections.find(s => 
        s.sectionType === 'hero' && 
        s.text.includes('TWIN CITIES JUNK REMOVAL SERVICES')
      );
      this.logTest(
        'Hero section with "TWIN CITIES JUNK REMOVAL SERVICES"',
        !!heroSection,
        heroSection ? `Found: "${heroSection.text.substring(0, 60)}..."` : 'Not found'
      );
      
      // Test 2: Locally owned subheading
      const locallyOwnedSection = result.sections.find(s => 
        s.text.toLowerCase().includes('locally owned')
      );
      this.logTest(
        'Subheading about locally owned',
        !!locallyOwnedSection,
        locallyOwnedSection ? `Found: "${locallyOwnedSection.text.substring(0, 80)}..."` : 'Not found'
      );
      
      // Test 3: Service types
      const serviceTypes = ['residential', 'commercial', 'construction', 'estate'];
      const foundServices = [];
      
      serviceTypes.forEach(serviceType => {
        const found = result.sections.filter(s => 
          s.sectionType === 'service' && 
          s.text.toLowerCase().includes(serviceType)
        );
        if (found.length > 0) {
          foundServices.push(serviceType);
        }
      });
      
      this.logTest(
        'Service types detection',
        foundServices.length >= 3,
        `Found ${foundServices.length} of ${serviceTypes.length} service types: ${foundServices.join(', ')}`
      );
      
      // Test 4: Phone number CTAs
      const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/;
      const phoneSections = result.sections.filter(s => phoneRegex.test(s.text));
      this.logTest(
        'Phone number CTAs',
        phoneSections.length > 0,
        `Found ${phoneSections.length} sections with phone numbers`
      );
      
      // Test 5: Testimonials
      const testimonialSections = result.sections.filter(s => 
        s.sectionType === 'testimonial' || 
        s.text.toLowerCase().includes('testimonial') ||
        s.text.toLowerCase().includes('review') ||
        s.text.includes('"') // Quoted text often indicates testimonials
      );
      this.logTest(
        'Testimonials detection',
        testimonialSections.length > 0,
        `Found ${testimonialSections.length} testimonial sections`
      );
      
      // Save detailed results
      await fs.writeFile(
        'junkmasters-test-results.json',
        JSON.stringify(result, null, 2),
        'utf8'
      );
      console.log('\n💾 Full results saved to junkmasters-test-results.json');
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      this.testsFailed++;
    }
  }

  async runGeneralTests() {
    console.log('\n\n🧪 Running General Test Suite\n');
    
    if (!this.results.junkmasters) {
      console.log('⚠️  No results to test. Run testJunkMastersMN() first.');
      return;
    }
    
    const result = this.results.junkmasters;
    
    // Test 1: Minimum sections
    this.logTest(
      'Minimum 20 sections extracted',
      result.sections.length >= 20,
      `Found ${result.sections.length} sections`
    );
    
    // Test 2: All section types detected
    const expectedTypes = ['hero', 'service', 'cta', 'testimonial', 'benefit', 'other'];
    const foundTypes = [...new Set(result.sections.map(s => s.sectionType))];
    const missingTypes = expectedTypes.filter(t => !foundTypes.includes(t));
    
    this.logTest(
      'Multiple section types detected',
      foundTypes.length >= 4,
      `Found ${foundTypes.length} types: ${foundTypes.join(', ')}${missingTypes.length ? ` (Missing: ${missingTypes.join(', ')})` : ''}`
    );
    
    // Test 3: Character counts accuracy
    let charCountsValid = true;
    result.sections.forEach(section => {
      if (section.text.length !== section.charCount) {
        charCountsValid = false;
      }
    });
    
    this.logTest(
      'Character counts are accurate',
      charCountsValid,
      charCountsValid ? 'All character counts match text length' : 'Some character counts are incorrect'
    );
    
    // Test 4: No duplicate content
    const textSet = new Set();
    const duplicates = [];
    
    result.sections.forEach(section => {
      if (textSet.has(section.text)) {
        duplicates.push(section.text.substring(0, 50) + '...');
      }
      textSet.add(section.text);
    });
    
    this.logTest(
      'No duplicate content',
      duplicates.length === 0,
      duplicates.length > 0 ? `Found ${duplicates.length} duplicates` : 'No duplicates found'
    );
    
    // Test 5: Proper section ordering
    let orderingValid = true;
    for (let i = 0; i < result.sections.length; i++) {
      if (result.sections[i].order !== i + 1) {
        orderingValid = false;
        break;
      }
    }
    
    this.logTest(
      'Sections properly ordered',
      orderingValid,
      orderingValid ? 'All sections in correct order' : 'Section ordering is incorrect'
    );
    
    // Test 6: Button detection
    const sectionsWithButtons = result.sections.filter(s => s.hasButton);
    this.logTest(
      'Button detection working',
      sectionsWithButtons.length > 0,
      `Found ${sectionsWithButtons.length} sections with buttons`
    );
    
    // Test 7: XPath presence
    const sectionsWithXPath = result.sections.filter(s => s.xpath && s.xpath.length > 0);
    this.logTest(
      'XPath generated for all sections',
      sectionsWithXPath.length === result.sections.length,
      `${sectionsWithXPath.length} of ${result.sections.length} sections have XPath`
    );
    
    // Test 8: Parent container detection
    const sectionsWithContainer = result.sections.filter(s => 
      s.parentContainer && s.parentContainer !== 'section'
    );
    this.logTest(
      'Parent container detection',
      sectionsWithContainer.length > 0,
      `Found ${sectionsWithContainer.length} sections with specific containers`
    );
    
    // Test 9: Text extraction quality
    const emptyTextSections = result.sections.filter(s => !s.text || s.text.trim() === '');
    this.logTest(
      'No empty text sections',
      emptyTextSections.length === 0,
      emptyTextSections.length > 0 ? `Found ${emptyTextSections.length} empty sections` : 'All sections have content'
    );
    
    // Test 10: React component handling (cards detected)
    const cardSections = result.sections.filter(s => s.element === 'card');
    this.logTest(
      'React components/cards detected',
      cardSections.length > 0 || result.sections.length > 20,
      cardSections.length > 0 ? `Found ${cardSections.length} card components` : 'Complex content structure detected'
    );
  }

  async runAllTests() {
    try {
      await this.initialize();
      await this.testJunkMastersMN();
      await this.runGeneralTests();
      
      // Summary
      console.log('\n\n📊 Test Summary:');
      console.log(`   ✅ Passed: ${this.testsPassed}`);
      console.log(`   ❌ Failed: ${this.testsFailed}`);
      console.log(`   📈 Success Rate: ${((this.testsPassed / (this.testsPassed + this.testsFailed)) * 100).toFixed(1)}%\n`);
      
    } catch (error) {
      console.error('Fatal error:', error);
    } finally {
      await this.cleanup();
    }
  }

  // Additional test for multiple sites
  async testMultipleSites(urls) {
    console.log('\n\n🧪 Testing Multiple Sites\n');
    
    for (const url of urls) {
      console.log(`\n📄 Testing ${url}...`);
      try {
        const result = await this.scraper.scrapeWebsite(url);
        console.log(`   ✅ Sections found: ${result.sections.length}`);
        console.log(`   ✅ Section types: ${[...new Set(result.sections.map(s => s.sectionType))].join(', ')}`);
        
        // Save results
        const filename = url.replace(/https?:\/\//, '').replace(/[\/\?#:]/g, '_') + '.json';
        await fs.writeFile(filename, JSON.stringify(result, null, 2), 'utf8');
        console.log(`   💾 Results saved to ${filename}`);
        
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const testSuite = new ScraperTestSuite();
  
  // Check for command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--multiple')) {
    // Test multiple sites
    const sites = [
      'https://www.junkmastersmn.com',
      // Add more junk removal sites here as needed
    ];
    testSuite.runAllTests().then(() => {
      testSuite.testMultipleSites(sites.slice(1));
    });
  } else {
    // Run standard tests
    testSuite.runAllTests();
  }
}
