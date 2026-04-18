/**
 * key.js - API Key Rotation Manager
 * ---------------------------------
 */

const sheets = require('../tools/sheets');

class KeyManager {
    constructor() {
        this.keys = [];
        this.currentIndex = 0; // 0-indexed internally
        this.loadKeysFromEnv();
    }

    loadKeysFromEnv() {
        // Collect all GEMINI_KEY_N present in env (1 to 10)
        for (let i = 1; i <= 10; i++) {
            const val = process.env[`GEMINI_KEY_${i}`];
            if (val && val.trim()) {
                this.keys.push(val.trim());
            }
        }
        
        // Fallback to GEMINI_API_KEY if no indexed keys found
        if (this.keys.length === 0 && process.env.GEMINI_API_KEY) {
            this.keys.push(process.env.GEMINI_API_KEY.trim());
        }

        console.log(`[KeyManager] Loaded ${this.keys.length} API key(s).`);
    }

    async init() {
        if (this.keys.length <= 1) return;

        try {
            // Restore index from Google Sheets
            const state = await sheets.getState("api_key_index");
            if (state && typeof state.value === 'number') {
                this.currentIndex = state.value % this.keys.length;
                console.log(`[KeyManager] Restored index: ${this.currentIndex}`);
            }
        } catch (err) {
            console.error(`[KeyManager Error] Failed to init index:`, err.message);
        }
    }

    getKey() {
        if (this.keys.length === 0) {
            throw new Error("No API keys found in environment. Please set GEMINI_KEY_1...10.");
        }
        return this.keys[this.currentIndex];
    }

    async rotate() {
        if (this.keys.length <= 1) return this.getKey();

        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        console.log(`[KeyManager] Rotating to key index: ${this.currentIndex}`);

        try {
            // Persist new index to Sheets
            await sheets.setState("api_key_index", this.currentIndex);
        } catch (err) {
            console.error(`[KeyManager Error] Failed to persist rotation:`, err.message);
        }

        return this.getKey();
    }
}

// Singleton instance
const manager = new KeyManager();
module.exports = manager;
