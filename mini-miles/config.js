require('dotenv').config();
const path = require('path');

module.exports = {
  MASTER_USER_ID: process.env.DISCORD_MASTER_ID || 'tobiawolaju',
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY,
  LLM_MODEL: 'gemini-1.5-flash-latest',
  MAX_HISTORY: 15,
  HEARTBEAT_INTERVAL: 60000, // 1 minute
  STORAGE_DIR: './.mini-miles/sessions',
  SPOTIFY_PLAYLIST_PATH: path.join(__dirname, 'spotify_playlist.json')
};
