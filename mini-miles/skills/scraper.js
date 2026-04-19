const scraper = require('../tools/scraper');
const { search } = require('../tools/search');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: "web_search_and_scrape",
    description: "Searches Google or scrapes a specific URL to gather information.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query for Google" },
        url: { type: "string", description: "Direct URL to scrape" }
      }
    }
  },

  execute: async (args) => {
    const { query, url } = args;

    if (url) {
      skill(`Scraping URL: ${url}`);
      try {
        const content = await scraper.scrape(url);
        return content.slice(0, 10000); // Limit context size
      } catch (err) {
        return `Scrape Error: ${err.message}`;
      }
    }

    if (query) {
      skill(`Searching Google: ${query}`);
      try {
        const results = await search(query);
        return JSON.stringify(results, null, 2);
      } catch (err) {
        return `Search Error: ${err.message}`;
      }
    }

    return "Error: Provide either a query or a url.";
  }
};
