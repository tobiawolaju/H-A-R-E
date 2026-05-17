const axios = require("axios");
const cheerio = require("cheerio");

async function scrape(url) {
  if (!url) return "No URL provided.";
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 HARE/1.0" },
      timeout: 10000
    });
    const $ = cheerio.load(data);
    $("script, style, nav, footer, header").remove();
    let text = $("body").text().replace(/\s+/g, " ").trim();
    return text.substring(0, 8000); // Larger limit for Flash
  } catch (err) {
    return `Scrape Error: ${err.message}`;
  }
}

module.exports = { scrape };
