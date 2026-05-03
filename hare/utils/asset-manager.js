const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { log, error } = require('./logger');

const ASSET_DIR = path.join(process.cwd(), 'assets');
fs.ensureDirSync(ASSET_DIR);

class AssetManager {
  /**
   * Ensure a remote or local asset is available as a local file
   * @param {string} source - URL or local path
   * @returns {Promise<string>} - Local path to the asset
   */
  async get(source) {
    if (!source) return null;

    // 1. Check if it's already a local file
    if (fs.existsSync(source)) {
      return source;
    }

    // 2. Treat as URL and download
    try {
      const hash = crypto.createHash('md5').update(source).digest('hex');
      const ext = path.extname(new URL(source).pathname) || '.bin';
      const localPath = path.join(ASSET_DIR, `${hash}${ext}`);

      if (fs.existsSync(localPath)) {
        log(`AssetManager: Cache hit for ${source}`);
        return localPath;
      }

      log(`AssetManager: Downloading ${source}...`);
      const response = await axios({
        url: source,
        method: 'GET',
        responseType: 'stream'
      });

      const writer = fs.createWriteStream(localPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(localPath));
        writer.on('error', (err) => {
          error(`AssetManager: Download failed for ${source}`, err);
          reject(err);
        });
      });
    } catch (err) {
      error(`AssetManager: Failed to process asset ${source}`, err);
      return null;
    }
  }
}

module.exports = new AssetManager();
