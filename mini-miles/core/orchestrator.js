const llm = require('../utils/llm');
const memory = require('./memory');
const config = require('../config');
const { core, log, error } = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

/**
 * Ensure history always starts with a 'user' turn.
 * Gemini SDK throws if the first entry is role 'model' or 'function'.
 * This strips any leading non-user entries caused by mid-turn crashes.
 */
function _sanitizeHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  // Find the first 'user' entry
  const firstUserIdx = history.findIndex(h => h.role === 'user');
  if (firstUserIdx === -1) return []; // No user turn at all - reset
  return history.slice(firstUserIdx);
}

class Orchestrator {
  constructor() {
    this.skills = new Map();
    this._loadSkills();

    // Wire up scheduler after skills loaded (lazy)
    setImmediate(() => {
      try {
        const sched = require('../tools/scheduler');
        sched.setOrchestrator(this);
      } catch (e) { /* scheduler optional */ }
    });
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
    const { platform, channelId, userId, content, reply, startTyping } = event;
    const sessionKey = memory.getSessionKey(platform, channelId, userId);

    // Start typing immediately to show we are thinking
    if (typeof startTyping === 'function') startTyping();

    core(`Handling event from ${userId} on ${platform}`);

    try {
      let history = await memory.getHistory(sessionKey);
      history = _sanitizeHistory(history); // Ensure history starts with 'user'
      history.push({ role: 'user', parts: [{ text: content }] });

      let iterations = 0;
      const maxIterations = 8;
      let lastText = '';

      while (iterations < maxIterations) {
        const response = await llm.chat(history, this.getToolDefinitions());

        if (response.text) {
          lastText = response.text;
        }

        if (response.parts) {
          history.push({ role: 'model', parts: response.parts });
        }

        if (response.toolCalls && response.toolCalls.length > 0) {
          core(`Agent requested tools (parallel×${response.toolCalls.length}): ${response.toolCalls.map(tc => tc.name).join(', ')}`);

          // ⚡ PARALLEL execution — all tool calls fire simultaneously
          const toolResults = await Promise.all(
            response.toolCalls.map(async (call) => {
              const skill = this.skills.get(call.name);
              if (skill) {
                core(`Executing skill: ${call.name}`);
                const result = await skill.execute(call.args, { userId, masterId: config.MASTER_USER_ID });
                return { name: call.name, result };
              }
              return { name: call.name, result: 'Error: Tool not found' };
            })
          );

          // Push all results back into history
          for (const { name, result } of toolResults) {
            history.push(llm.formatToolResult(name, result));
          }

          iterations++;
          continue; // Loop back to LLM with all tool results
        }

        // No more tool calls — we're done
        break;
      }

      await memory.saveHistory(sessionKey, history);
      if (lastText) {
        await reply(lastText);
      }
    } catch (err) {
      error(`Orchestrator error:`, err.stack);
      await reply(`⚠️ Error: ${err.message}`);
    }
  }
}

module.exports = new Orchestrator();
