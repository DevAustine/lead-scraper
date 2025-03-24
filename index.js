require('dotenv').config(); // Load environment variables from .env

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Config - Now Using Environment Variables
const CONFIG = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  SCRAPE_INTERVAL_MINUTES: parseInt(process.env.SCRAPE_INTERVAL_MINUTES, 10) || 30,
  DATA_DIR: path.join(__dirname, process.env.DATA_DIR || 'data'),
  MAX_CONCURRENT_TABS: parseInt(process.env.MAX_CONCURRENT_TABS, 10) || 3,
  BROWSER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--window-size=1920,1080'
  ]
};


// Enhanced target sites with customized selectors and wait strategy
const targetSites = [
  {
    name: 'TikTok',
    url: 'https://www.tiktok.com/search?q=cybercafe%20services',
    waitForSelector: '.tiktok-x6y88p-DivItemContainer',
    itemSelector: '.tiktok-x6y88p-DivItemContainer',
    textSelector: '.tiktok-j2a19r-SpanText',
    linkSelector: 'a',
    scrollToLoad: true,
    maxItems: 20
  },
  {
    name: 'Facebook',
    url: 'https://www.facebook.com/search/posts?q=cybercafe%20services',
    waitForSelector: '[role="article"]',
    itemSelector: '[role="article"]',
    textSelector: '.kvgmc6g5',
    linkSelector: 'a[href*="/posts/"]',
    scrollToLoad: true,
    maxItems: 15,
    needsLogin: true
  },
  {
    name: 'X (Twitter)',
    url: 'https://twitter.com/search?q=cybercafe%20services%20OR%20internet%20services%20OR%20kuccps%20OR%20ecitizen%20OR%20kra%20services&f=live',
    waitForSelector: '[data-testid="tweet"]',
    itemSelector: '[data-testid="tweet"]',
    textSelector: '[data-testid="tweetText"]',
    linkSelector: 'a[href*="/status/"]',
    scrollToLoad: true,
    maxItems: 25
  },
  {
    name: 'Instagram',
    url: 'https://www.instagram.com/explore/tags/cybercafe/',
    waitForSelector: 'article',
    itemSelector: 'article',
    textSelector: '.C4VMK span',
    linkSelector: 'a[href*="/p/"]',
    scrollToLoad: true,
    maxItems: 15,
    needsLogin: true
  },
  {
    name: 'Reddit',
    url: 'https://www.reddit.com/search/?q=cyber%20cafe%20OR%20ecitizen%20OR%20kra%20services%20OR%20passport%20application&type=post&sort=new',
    waitForSelector: '[data-testid="post-container"]',
    itemSelector: '[data-testid="post-container"]',
    textSelector: '[data-testid="post-title"]',
    linkSelector: 'a[data-testid="post-title"]',
    scrollToLoad: true,
    maxItems: 20
  },
  {
    name: 'OLX Kenya',
    url: 'https://www.olx.co.ke/items/q-cyber-cafe-services',
    waitForSelector: '[data-aut-id="itemTitle"]',
    itemSelector: '[data-aut-id="itemBox"]',
    textSelector: '[data-aut-id="itemTitle"]',
    linkSelector: 'a',
    scrollToLoad: true,
    maxItems: 15
  },
  {
    name: 'Jiji Kenya',
    url: 'https://jiji.co.ke/search?query=cyber%20cafe%20services',
    waitForSelector: '.b-list-advert__item-wrapper',
    itemSelector: '.b-list-advert__item-wrapper',
    textSelector: '.qa-advert-title',
    linkSelector: '.b-list-advert__item-wrapper a',
    scrollToLoad: true,
    maxItems: 15
  }
];

// Keywords related to cyber cafe services
const KEYWORDS = {
  INCLUDE: [
    'cyber service', 'cybercafe', 'online application', 'internet service', 
    'digital service', 'kuccps', 'kra services', 'kra pin', 'ntsa services',
    'passport application', 'ecitizen', 'huduma', 'helb', 'tsc', 'nemis',
    'sha', 'nssf', 'driving license', 'business registration', 'tax returns',
    'cyber', 'online services', 'internet cafe', 'digital documents', 'scanning',
    'certification', 'government services', 'e-services', 'shif', 'good conduct',
    'crb clearance', 'cv', 'cover letter', 'visa application', 'flight booking',
    'business cards', 'logo', 'birth certificate', 'kra pin retrieval', 'company registration',
    'eacc clearance', 'websites creation', 'computer training', 'digital applications'
  ],
  EXCLUDE: [
    'printing', 'computer repair', 'laptop repair', 'ink cartridge', 'toner',
    'photocopy', 'photocopying', 'gaming', 'gaming zone'
  ]
};

// Ensure data directory exists
if (!fs.existsSync(CONFIG.DATA_DIR)) {
  fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
}

// Database functions
const db = {
  leadsFile: path.join(CONFIG.DATA_DIR, 'leads_database.json'),
  
  // Initialize database
  init: function() {
    if (!fs.existsSync(this.leadsFile)) {
      fs.writeFileSync(this.leadsFile, JSON.stringify({ leads: [], processed: [] }));
    }
    return this.read();
  },
  
  read: function() {
    try {
      return JSON.parse(fs.readFileSync(this.leadsFile, 'utf8'));
    } catch (error) {
      console.error('Error reading database:', error);
      return { leads: [], processed: [] };
    }
  },
  
  write: function(data) {
    try {
      fs.writeFileSync(this.leadsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error writing to database:', error);
    }
  },
  
  isProcessed: function(url) {
    const data = this.read();
    return data.processed.includes(url);
  },
  
  addProcessed: function(url) {
    const data = this.read();
    if (!data.processed.includes(url)) {
      data.processed.push(url);
      this.write(data);
    }
  },
  
  saveLead: function(lead) {
    const data = this.read();
    lead.id = uuidv4();
    lead.timestamp = new Date().toISOString();
    data.leads.push(lead);
    this.write(data);
    return lead;
  }
};

// Helper functions
const helpers = {
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  getRandomDelay: (min, max) => Math.floor(Math.random() * (max - min + 1) + min),
  
  extractPhoneNumbers: (text) => {
    // Enhanced regex for Kenyan and international phone formats
    const phoneRegex = /(?:\+?254|0)(?:7[0-9]{8}|1[0-9]{8})/g;
    const matches = text.match(phoneRegex) || [];
    return [...new Set(matches)]; // Remove duplicates
  },
  
  extractEmails: (text) => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex) || [];
    return [...new Set(matches)]; // Remove duplicates
  },
  
  // Check if text contains relevant keywords
  isRelevantText: (text) => {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    
    // Check for excluded keywords first
    if (KEYWORDS.EXCLUDE.some(keyword => lowerText.includes(keyword.toLowerCase()))) {
      return false;
    }
    
    // Then check for included keywords
    return KEYWORDS.INCLUDE.some(keyword => lowerText.includes(keyword.toLowerCase()));
  },
  
  // Format lead data for Telegram message
  formatTelegramMessage: (lead) => {
    const phones = lead.phones.length > 0 ? lead.phones.join(', ') : 'N/A';
    const emails = lead.emails.length > 0 ? lead.emails.join(', ') : 'N/A';
    
    return `*New Lead: ${lead.source}*\n\n` +
           `📝 *Description:* ${lead.text.substring(0, 200)}${lead.text.length > 200 ? '...' : ''}\n\n` +
           `📞 *Contact:* ${phones}\n` +
           `📧 *Email:* ${emails}\n` +
           `🔗 *Link:* [View Original](${lead.url})\n` +
           `📅 *Found:* ${new Date().toLocaleString()}\n\n` +
           `#${lead.source.replace(/[\s()]/g, '')} #CyberServices`;
  },
  
  // Log with timestamp
  log: (message) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    fs.appendFileSync(path.join(CONFIG.DATA_DIR, 'scraper.log'), `[${timestamp}] ${message}\n`);
  }
};

// Telegram functions
const telegram = {
  sendMessage: async (text) => {
    try {
      const response = await axios.post(
        `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          chat_id: CONFIG.TELEGRAM_CHAT_ID,
          text: text,
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        }
      );
      helpers.log(`Telegram message sent: ${response.data.ok}`);
      return response.data;
    } catch (error) {
      helpers.log(`Error sending Telegram message: ${error.message}`);
      return null;
    }
  }
};

// Main scraping function
async function scrapeSite(browser, site) {
  helpers.log(`Starting to scrape: ${site.name}`);
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36');
  
  try {
    // Go to the target site
    await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for content to load
    try {
      await page.waitForSelector(site.waitForSelector, { timeout: 30000 });
    } catch (error) {
      helpers.log(`Selector not found for ${site.name}: ${error.message}`);
      await page.close();
      return [];
    }
    
    // If scrolling is needed to load more content
    if (site.scrollToLoad) {
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await helpers.sleep(helpers.getRandomDelay(1000, 2000));
      }
    }
    
    // Extract lead information
    const leads = await page.evaluate((siteConfig) => {
      const results = [];
      const items = document.querySelectorAll(siteConfig.itemSelector);
      
      items.forEach(item => {
        try {
          const textElement = item.querySelector(siteConfig.textSelector);
          const text = textElement ? textElement.innerText : item.innerText;
          
          const linkElement = item.querySelector(siteConfig.linkSelector);
          const url = linkElement ? linkElement.href : '';
          
          if (text && url) {
            results.push({ text, url });
          }
        } catch (e) {
          // Skip items that cause errors
        }
      });
      
      return results.slice(0, siteConfig.maxItems || 10);
    }, site);
    
    // Process extracted leads
    const processedLeads = [];
    for (const lead of leads) {
      if (!db.isProcessed(lead.url) && helpers.isRelevantText(lead.text)) {
        const phones = helpers.extractPhoneNumbers(lead.text);
        const emails = helpers.extractEmails(lead.text);
        
        const processedLead = {
          source: site.name,
          text: lead.text.trim(),
          url: lead.url,
          phones,
          emails,
          processed: false
        };
        
        processedLeads.push(processedLead);
        db.addProcessed(lead.url);
      }
    }
    
    helpers.log(`Found ${processedLeads.length} new leads from ${site.name}`);
    await page.close();
    return processedLeads;
    
  } catch (error) {
    helpers.log(`Error scraping ${site.name}: ${error.message}`);
    await page.close();
    return [];
  }
}

// Process and notify about leads
async function processLeads(leads) {
  for (const lead of leads) {
    try {
      // Save lead to database
      const savedLead = db.saveLead(lead);
      
      // Send to Telegram
      const message = helpers.formatTelegramMessage(savedLead);
      await telegram.sendMessage(message);
      
      // Avoid rate limiting
      await helpers.sleep(helpers.getRandomDelay(2000, 5000));
      
    } catch (error) {
      helpers.log(`Error processing lead: ${error.message}`);
    }
  }
}

// Main execution function
async function run() {
  helpers.log('Starting lead scraper');
  db.init();
  
  while (true) {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: CONFIG.BROWSER_ARGS
      });
      
      let allLeads = [];
      
      // Process sites in batches to avoid memory issues
      for (let i = 0; i < targetSites.length; i += CONFIG.MAX_CONCURRENT_TABS) {
        const batch = targetSites.slice(i, i + CONFIG.MAX_CONCURRENT_TABS);
        const batchPromises = batch.map(site => scrapeSite(browser, site));
        const batchResults = await Promise.all(batchPromises);
        
        allLeads = [...allLeads, ...batchResults.flat()];
        
        // Small delay between batches
        await helpers.sleep(helpers.getRandomDelay(5000, 10000));
      }
      
      await browser.close();
      
      // Process gathered leads
      if (allLeads.length > 0) {
        helpers.log(`Processing ${allLeads.length} new leads`);
        await processLeads(allLeads);
      } else {
        helpers.log('No new leads found in this run');
      }
      
      // Wait before next run
      const waitMinutes = CONFIG.SCRAPE_INTERVAL_MINUTES;
      helpers.log(`Waiting ${waitMinutes} minutes before next run...`);
      await helpers.sleep(waitMinutes * 60 * 1000);
      
    } catch (error) {
      helpers.log(`Error in main loop: ${error.message}`);
      await helpers.sleep(5 * 60 * 1000); // Wait 5 minutes before retrying after error
    }
  }
}

// Start the scraper
run().catch(error => {
  helpers.log(`Fatal error: ${error.message}`);
  process.exit(1);
});
