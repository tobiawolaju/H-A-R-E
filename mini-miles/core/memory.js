const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const { log, error } = require('../utils/logger');

class MemoryManager {
  constructor() {
    this.storagePath = path.resolve(config.STORAGE_DIR);
    fs.ensureDirSync(this.storagePath);
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
    if (await fs.pathExists(filePath)) {
      try {
        const data = await fs.readJson(filePath);
        this.cache.set(sessionKey, data);
        return data;
      } catch (err) {
        error(`Failed to read history for ${sessionKey}:`, err.message);
      }
    }

    return [];
  }

  async saveHistory(sessionKey, history) {
    // Prune history
    const pruned = history.slice(-config.MAX_HISTORY);
    this.cache.set(sessionKey, pruned);

    const filePath = path.join(this.storagePath, `${sessionKey.replace(/:/g, '_')}.json`);
    try {
      await fs.writeJson(filePath, pruned, { spaces: 2 });
    } catch (err) {
      error(`Failed to save history for ${sessionKey}:`, err.message);
    }
  }

  async clearHistory(sessionKey) {
    this.cache.delete(sessionKey);
    const filePath = path.join(this.storagePath, `${sessionKey.replace(/:/g, '_')}.json`);
    await fs.remove(filePath);
  }
}

module.exports = new MemoryManager();
