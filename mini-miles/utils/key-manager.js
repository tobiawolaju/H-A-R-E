const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const { log, error } = require('./logger');

class KeyManager {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.statePath = path.resolve('./.mini-miles/state.json');
    this._loadKeys();
    this._loadState();
  }

  _loadKeys() {
    // Load GEMINI_KEY_1...9
    for (let i = 1; i <= 9; i++) {
      const key = process.env[`GEMINI_KEY_${i}`];
      if (key) this.keys.push(key.trim());
    }

    // Fallback to GEMINI_API_KEY
    if (this.keys.length === 0 && config.GEMINI_API_KEY) {
      this.keys.push(config.GEMINI_API_KEY);
    }

    log(`KeyManager: Loaded ${this.keys.length} keys.`);
  }

  _loadState() {
    try {
      if (fs.existsSync(this.statePath)) {
        const state = fs.readJsonSync(this.statePath);
        if (typeof state.keyIndex === 'number') {
          this.currentIndex = state.keyIndex % this.keys.length;
          log(`KeyManager: Restored index ${this.currentIndex}`);
        }
      }
    } catch (err) {
      error('KeyManager: Failed to load state:', err.message);
    }
  }

  _saveState() {
    try {
      fs.ensureDirSync(path.dirname(this.statePath));
      fs.writeJsonSync(this.statePath, { keyIndex: this.currentIndex });
    } catch (err) {
      error('KeyManager: Failed to save state:', err.message);
    }
  }

  getKey() {
    if (this.keys.length === 0) throw new Error("No API keys found in .env");
    return this.keys[this.currentIndex];
  }

  rotate() {
    if (this.keys.length <= 1) return this.getKey();
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    log(`KeyManager: Rotating to index ${this.currentIndex}`);
    this._saveState();
    return this.getKey();
  }
}

module.exports = new KeyManager();
