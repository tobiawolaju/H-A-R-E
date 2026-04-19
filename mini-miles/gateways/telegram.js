const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const orchestrator = require('../core/orchestrator');
const config = require('../config');
const { gateway, error } = require('../utils/logger');

class TelegramGateway {
  constructor() {
    this.name = 'telegram';
    this.client = null;
  }

  async connect() {
    const apiId = parseInt(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH;
    const stringSession = new StringSession(process.env.TELEGRAM_SESSION_STRING || "");

    this.client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
    });

    try {
      await this.client.connect();
      gateway('Telegram: Connected successfully.');
      this._setupListeners();
    } catch (err) {
      error('Telegram: Connection failed:', err.message);
    }
  }

  _setupListeners() {
    this.client.addEventHandler(async (event) => {
      const message = event.message;
      if (!message || !message.message) return;

      // Ignore self? (Usually userbots should ignore their own messages unless commanded)
      const sender = await message.getSender();
      const senderUsername = sender?.username;
      const senderId = sender?.id?.toString();

      const isMaster = senderUsername === process.env.TELEGRAM_MASTER_USERNAME || senderId === process.env.TELEGRAM_MASTER_USERNAME;
      
      // Basic filter: only respond to master for now (safety)
      if (isMaster) {
        const orchestratorEvent = {
          platform: 'telegram',
          channelId: message.peerId?.userId?.toString() || message.peerId?.chatId?.toString() || 'unknown',
          userId: senderUsername || senderId,
          content: message.message,
          reply: async (text) => {
            await this._sendMessage(message.peerId, text);
          }
        };

        orchestrator.handleEvent(orchestratorEvent);
      }
    });
  }

  async _sendMessage(peer, content) {
    try {
      // Telegram splitting (4096 char limit)
      const chunks = content.match(/[\s\S]{1,4000}/g) || [];
      for (const chunk of chunks) {
        await this.client.sendMessage(peer, { message: chunk });
      }
    } catch (err) {
      error('Telegram: Failed to send message:', err.message);
    }
  }
}

module.exports = new TelegramGateway();
