const axios = require("axios");

async function search(query) {
  try {
    const res = await axios.post(
      "https://google.serper.dev/search",
      { q: query },
      {
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );
    return res.data.organic?.slice(0, 5) || [];
  } catch (err) {
    return [];
  }
}

module.exports = { search };
