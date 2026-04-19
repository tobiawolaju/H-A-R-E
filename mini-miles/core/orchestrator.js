const llm = require('../utils/llm');
const memory = require('./memory');
const config = require('../config');
const { core, log, error } = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

class Orchestrator {
  constructor() {
    this.skills = new Map();
    this._loadSkills();
  }

  async _loadSkills() {
    const skillsPath = path.resolve(__dirname, '../skills');
    const files = await fs.readdir(skillsPath);
    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const skill = require(path.join(skillsPath, file));
          if (skill.definition && skill.execute) {
            this.skills.set(skill.definition.name, skill);
            core(`Loaded skill: ${skill.definition.name}`);
          }
        } catch (err) {
          error(`Failed to load skill ${file}:`, err.message);
        }
      }
    }
  }

  getToolDefinitions() {
    return Array.from(this.skills.values()).map(s => s.definition);
  }

  async handleEvent(event) {
    const { platform, channelId, userId, content, reply } = event;
    const sessionKey = memory.getSessionKey(platform, channelId, userId);
    
    core(`Handling event from ${userId} on ${platform}`);

    try {
      let history = await memory.getHistory(sessionKey);
      history.push({ role: 'user', parts: [{ text: content }] });

      let iterations = 0;
      const maxIterations = 5;
      let lastText = '';

      while (iterations < maxIterations) {
        const response = await llm.chat(history, this.getToolDefinitions());
        
        if (response.text) {
          lastText = response.text;
          history.push({ role: 'model', parts: [{ text: response.text }] });
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          core(`Agent requested tools: ${response.toolCalls.map(tc => tc.name).join(', ')}`);
          
          // If the model sent text + tools, we need to ensure the sequence is role:model with both
          // Actually Gemini requires role:model to have the toolCalls parts.
          // Let's refine history entry if it wasn't already added
          const lastEntry = history[history.length - 1];
          if (lastEntry.role === 'model') {
            // Already added text, check if we need to add call parts
            const existingCalls = lastEntry.parts.filter(p => !!p.functionCall);
            if (existingCalls.length === 0) {
              lastEntry.parts.push(...response.toolCalls.map(tc => ({ functionCall: tc })));
            }
          } else {
            history.push({ role: 'model', parts: [{ text: response.text || '' }, ...response.toolCalls.map(tc => ({ functionCall: tc }))] });
          }

          // Execute tools sequentially
          for (const call of response.toolCalls) {
            const skill = this.skills.get(call.name);
            if (skill) {
              core(`Executing skill: ${call.name}`);
              const result = await skill.execute(call.args, { userId, masterId: config.MASTER_USER_ID });
              history.push(llm.formatToolResult(call.name, result));
            } else {
              history.push(llm.formatToolResult(call.name, "Error: Tool not found"));
            }
          }
          iterations++;
          continue; // Loop back to LLM with tool results
        }

        // No more tool calls, we're done
        break;
      }

      await memory.saveHistory(sessionKey, history);
      if (lastText) {
        await reply(lastText);
      }
    } catch (err) {
      error(`Orchestrator error:`, err.stack);
      await reply(`⚠️ Error processing request: ${err.message}`);
    }
  }
}

module.exports = new Orchestrator();
