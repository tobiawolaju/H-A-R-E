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
    return `You are Miles, a professional, high-performance AI orchestrator. 
The current date and time (UTC) is: ${now}.
Your goal is to complete tasks efficiently with zero filler.
When asked a complex task, output a <plan> block first.
Use the provided tools sequentially to reach a final answer.
Master User is ${config.MASTER_USER_ID}.`;
  }

  /**
   * Main completion method with tool support
   * @param {Array} history - Chat history in Gemini format
   * @param {Array} tools - List of tool definitions
   * @returns {Promise<Object>} - Response object
   */
  async chat(history, tools = [], retry = true) {
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
        parts: content.parts, // Return all parts (text, functionCall, thought, etc.)
        toolCalls: content.parts.filter(p => !!p.functionCall).map(p => p.functionCall),
        raw: response
      };
    } catch (err) {
      if (retry && (
        err.message.includes('429') ||
        err.message.includes('503') ||
        err.message.toLowerCase().includes('rate limit') ||
        err.message.toLowerCase().includes('service unavailable')
      )) {
        log('LLM: Rate limit or overload. Rotating key and retrying...');
        this.refreshModel();
        return this.chat(history, tools, false);
      }
      error('LLM Chat Error:', err.message);
      throw err;
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
