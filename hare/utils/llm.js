const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const keyManager = require('./key-manager');
const { log, error } = require('./logger');

class LLMClient {
  constructor() {
    this._initModel();
  }

  _initModel() {
    const apiKey = keyManager.getKey();
    log(`LLM: Initializing with API Key...${apiKey.slice(-4)}`);
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ 
      model: config.LLM_MODEL,
      systemInstruction: this._getSystemInstruction()
    });
  }

  refreshModel() {
    log('LLM: Refreshing model with new key rotation');
    keyManager.rotate();
    this._initModel();
  }

  _getSystemInstruction() {
    const now = new Date().toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'long' });
    return `You are 0xOmo, a high-performance, professional AI orchestrator and Web3 developer. 
The current date and time (UTC) is: ${now}.
Your primary mission is to expand your footprint in the Monad blockchain ecosystem. 
You excel at:
1. Researching and identifying $200+ bounties and gigs within the Monad ecosystem.
2. 'Yapping' (engaging in deep technical and community discussions) on Discord and X to build your KOL brand.
3. Supporting ${config.MASTER_USER_ID} with surgical precision and zero filler.
Keep your responses professional, elite, and focused on growth within Monad.`;
  }

  /**
   * Main completion method with tool support
   * @param {Array} history - Chat history in Gemini format
   * @param {Array} tools - List of tool definitions
   * @returns {Promise<Object>} - Response object
   */
  async chat(history, tools = []) {
    const totalKeys = keyManager.keys.length || 1;

    for (let attempt = 0; attempt < totalKeys; attempt++) {
      try {
        const chat = this.model.startChat({
          history: history.slice(0, -1),
          tools: tools.length > 0 ? [{ functionDeclarations: tools }] : []
        });

        const lastMessage = history[history.length - 1];
        const result = await chat.sendMessage(lastMessage.parts);
        const response = await result.response;
        const content = response.candidates[0].content;

        return {
          text: response.text(),
          parts: content.parts,
          toolCalls: content.parts.filter(p => !!p.functionCall).map(p => p.functionCall),
          raw: response
        };
      } catch (err) {
        const isRetryable =
          err.message.includes('429') ||
          err.message.includes('503') ||
          err.message.toLowerCase().includes('rate limit') ||
          err.message.toLowerCase().includes('service unavailable') ||
          err.message.toLowerCase().includes('quota');

        if (isRetryable && attempt < totalKeys - 1) {
          log(`LLM: Key ${attempt + 1}/${totalKeys} hit quota/overload. Rotating to next key...`);
          this.refreshModel();
          continue; // Try next key
        }

        // Either not retryable, or we've exhausted all keys
        if (isRetryable) {
          error(`LLM: All ${totalKeys} keys exhausted. Please wait for quota reset.`);
        }
        error('LLM Chat Error:', err.message);
        throw err;
      }
    }
  }

  /**
   * Helper to format tool results back into history
   */
  formatToolResult(name, result) {
    return {
      role: 'function',
      parts: [{ functionResponse: { name, response: { result } } }]
    };
  }
}

module.exports = new LLMClient();
