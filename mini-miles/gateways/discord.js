const { Client } = require('discord.js-selfbot-v13');
const orchestrator = require('../core/orchestrator');
const config = require('../config');
const { gateway, error } = require('../utils/logger');

class DiscordGateway {
  constructor() {
    this.name = 'discord';
    this.client = new Client();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.client.once('ready', () => {
        gateway(`Logged in as ${this.client.user.username}`);
        this._setupListeners();
        resolve();
      });

      this.client.once('error', reject);
      this.client.login(config.DISCORD_TOKEN).catch(reject);
    });
  }

  _setupListeners() {
    this.client.on('messageCreate', async (msg) => {
      // Ignore messages from self
      if (msg.author.id === this.client.user.id) return;

      // Logic: Only respond to master or if mentioned? 
      // User requested: listen to to them get info, etc.
      // We partition by user automatically.
      
      const isMaster = msg.author.username === config.MASTER_USER_ID || msg.author.id === config.MASTER_USER_ID;
      
      // Basic filter: only respond to direct messages or specific mentions for now
      // (Or any message in a private channel)
      const shouldRespond = msg.channel.type === 'DM' || isMaster; 

      if (shouldRespond) {
        const event = {
          platform: 'discord',
          channelId: msg.channel.id,
          userId: msg.author.username, // Using username as ID for cleaner session naming
          content: msg.content,
          reply: async (text) => {
            await this._sendHumanMessage(msg.channel, text, msg);
          }
        };

        orchestrator.handleEvent(event);
      }
    });
  }

  async _sendHumanMessage(channel, content, replyTo = null) {
    try {
      // Split content into chunks of ~1900 chars to stay under 2000 limit
      const chunks = content.match(/[\s\S]{1,1900}/g) || [];
      
      for (const chunk of chunks) {
        await channel.sendTyping();
        // Simulate thinking/typing time (min 1s, max 3s per chunk)
        const delay = Math.min(3000, Math.max(1000, chunk.length * 10));
        await new Promise(r => setTimeout(r, delay));

        if (replyTo && typeof replyTo.reply === 'function') {
          // If it's a message object, use its native reply (maintains thread/author reference)
          await replyTo.reply(chunk);
        } else {
          await channel.send(chunk);
        }
      }
    } catch (err) {
      error(`Failed to send Discord message:`, err.message);
    }
  }
}

module.exports = new DiscordGateway();
