require('dotenv').config();
const path = require('path');

module.exports = {
  MASTER_USER_ID: process.env.DISCORD_MASTER_ID || 'tobiawolaju',
  MASTER_IDENTIFIERS: Array.from(new Set([
    process.env.DISCORD_MASTER_ID,
    'tobiawolaju',
    'omoonchain'
  ].filter(Boolean).map((value) => String(value).toLowerCase()))),
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY,
  LLM_MODEL: 'gemini-3-flash-preview',
  MAX_HISTORY: 15,
  HEARTBEAT_INTERVAL: 60000, // 1 minute
  STORAGE_DIR: './.mini-miles/sessions',
  SPOTIFY_PLAYLIST_PATH: path.join(__dirname, 'spotify_playlist.json'),
  TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN,
  TWITTER_MASTER_USERNAME: process.env.TWITTER_MASTER_USERNAME || 'omoonchain',
  WALLET_VAULT_PASSPHRASE: process.env.WALLET_VAULT_PASSPHRASE || '',
  BTC_MEMPOOL_BASE_URL: process.env.BTC_MEMPOOL_BASE_URL || 'https://mempool.space',
  EMAIL_IMAP_HOST: process.env.EMAIL_IMAP_HOST || '',
  EMAIL_IMAP_PORT: process.env.EMAIL_IMAP_PORT ? Number(process.env.EMAIL_IMAP_PORT) : 993,
  EMAIL_IMAP_SECURE: process.env.EMAIL_IMAP_SECURE ? process.env.EMAIL_IMAP_SECURE === 'true' : true,
  EMAIL_IMAP_USER: process.env.EMAIL_IMAP_USER || process.env.EMAIL_SMTP_USER || '',
  EMAIL_IMAP_PASS: process.env.EMAIL_IMAP_PASS || process.env.EMAIL_SMTP_PASS || '',
  EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST || '',
  EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT ? Number(process.env.EMAIL_SMTP_PORT) : 587,
  EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE ? process.env.EMAIL_SMTP_SECURE === 'true' : false,
  EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER || '',
  EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS || '',
  EMAIL_DEFAULT_FROM: process.env.EMAIL_DEFAULT_FROM || process.env.EMAIL_SMTP_USER || ''
};
