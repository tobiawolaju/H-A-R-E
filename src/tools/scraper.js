/**
 * scraper.js - Simple tool to fetch text from a URL for KB use
 */

const axios = require("axios");
const cheerio = require("cheerio");

async function fetchKnowledgeBase(url) {
    if (!url) return "No KB URL provided.";
    
    try {
        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Miles/1.0"
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        
        // Remove noise
        $("script, style, nav, footer, header").remove();

        // Extract main text
        let text = $("body").text();
        
        // Basic cleanup
        text = text.replace(/\s+/g, " ").trim();
        
        // Limit context size to 4000 chars for LLM safety
        return text.substring(0, 4000);

    } catch (err) {
        console.error(`[Scraper Error] Failed to fetch KB: ${url}`, err.message);
        return `Error fetching knowledge base: ${err.message}`;
    }
}

module.exports = { fetchKnowledgeBase };
