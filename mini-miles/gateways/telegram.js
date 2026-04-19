const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events'); // Added
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
      
      // Ensure we appear online
      await this.client.getMe();
      await this.client.invoke(new Api.account.UpdateStatus({ offline: false }));
      
      this._setupListeners();
    } catch (err) {
      error('Telegram: Connection failed:', err.message);
    }
  }

  _setupListeners() {
    this.client.addEventHandler(async (event) => {
      const message = event.message;
      if (!message || !message.message) return;
      
      try {
        const sender = await message.getSender();
        const senderUsername = (sender?.username || "").toLowerCase();
        const senderId = sender?.id?.toString();
        const masterUsername = (process.env.TELEGRAM_MASTER_USERNAME || "").toLowerCase();
        
        const isMaster = senderUsername === masterUsername || senderId === masterUsername;
        
        gateway(`Telegram Message from: ${senderUsername || senderId} (Master: ${isMaster})`);
        
        if (isMaster) {
          const orchestratorEvent = {
            platform: 'telegram',
            channelId: message.peerId?.userId?.toString() || message.peerId?.chatId?.toString() || 'unknown',
            userId: senderUsername || senderId,
            content: message.message,
            reply: async (text) => {
              await this._sendMessage(message.peerId, text);
            },
            startTyping: async () => {
              await this.client.invoke(new Api.messages.SetTyping({
                peer: message.peerId,
                action: new Api.SendMessageTypingAction()
              })).catch(() => {});
            }
          };

          orchestrator.handleEvent(orchestratorEvent);
        }
      } catch (err) {
        error('Telegram: Handler error:', err.message);
      }
    }, new NewMessage({})); // Filter for new messages
  }

  async _sendMessage(peer, content) {
    try {
      // Split content into chunks (4096 char limit)
      const chunks = content.match(/[\s\S]{1,4000}/g) || [];
      for (const chunk of chunks) {
        // Trigger typing indicator
        await this.client.invoke(new Api.messages.SetTyping({
          peer: peer,
          action: new Api.SendMessageTypingAction()
        }));

        // Simulate thinking/typing time (min 1s, max 3s per chunk)
        const delay = Math.min(3000, Math.max(1000, chunk.length * 10));
        await new Promise(r => setTimeout(r, delay));

        await this.client.sendMessage(peer, { message: chunk });
      }
    } catch (err) {
      error('Telegram: Failed to send message:', err.message);
    }
  }
}

module.exports = new TelegramGateway();
