const fs = require('fs/promises');
const exists = require('fs').existsSync;
const ensureDir = async (path) => { if (!exists(path)) await fs.mkdir(path, { recursive: true }); };
const path = require('path');
const config = require('../config');
const { log, error } = require('../utils/logger');

class MemoryManager {
  constructor() {
    this.storagePath = path.resolve(config.STORAGE_DIR);
    if (!exists(this.storagePath)) {
      require('fs').mkdirSync(this.storagePath, { recursive: true });
    }
    this.cache = new Map();
  }

  getSessionKey(platform, channelId, userId) {
    return `${platform}:${channelId}:${userId}`;
  }

  async getHistory(sessionKey) {
    if (this.cache.has(sessionKey)) {
      return this.cache.get(sessionKey);
    }

    const filePath = path.join(this.storagePath, `${sessionKey.replace(/:/g, '_')}.json`);
    if (exists(filePath)) {
      try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        this.cache.set(sessionKey, data);
        return data;
      } catch (err) {
        error(`Failed to read history for ${sessionKey}:`, err.message);
      }
    }

    return [];
  }

  async saveHistory(sessionKey, history) {
    const pruned = history.slice(-config.MAX_HISTORY);
    this.cache.set(sessionKey, pruned);

    const filePath = path.join(this.storagePath, `${sessionKey.replace(/:/g, '_')}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(pruned, null, 2), 'utf8');
    } catch (err) {
      error(`Failed to save history for ${sessionKey}:`, err.message);
    }
  }

  async clearHistory(sessionKey) {
    this.cache.delete(sessionKey);
    const filePath = path.join(this.storagePath, `${sessionKey.replace(/:/g, '_')}.json`);
    if (exists(filePath)) await fs.unlink(filePath);
  }
}

module.exports = new MemoryManager();
