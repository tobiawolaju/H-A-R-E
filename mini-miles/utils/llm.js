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
    return `You are Miles, a professional, high-performance AI orchestrator. 
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
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const response = await result.response;
      
      return {
        text: response.text(),
        toolCalls: response.candidates[0].content.parts.filter(p => !!p.functionCall).map(p => p.functionCall),
        raw: response
      };
    } catch (err) {
      if (retry && (err.message.includes('429') || err.message.toLowerCase().includes('rate limit'))) {
        log('LLM: Rate limit hit. Rotating key and retrying...');
        this.refreshModel();
        return this.chat(history, tools, false); // Retry once
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
