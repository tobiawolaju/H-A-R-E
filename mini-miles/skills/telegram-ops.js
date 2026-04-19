/**
 * skills/telegram-ops.js
 * Exposes Telegram DM, bulk outreach, and chat reading capabilities to the LLM agent.
 */

const ta = require('../tools/telegram-actions');
const fp = require('../tools/file-parser');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: 'telegram_ops',
    description: 'Perform Telegram operations. Use this to: send a DM to a specific Telegram user, run bulk DM campaigns from a CSV file, or read messages from a Telegram chat/group. ONLY available to MASTER user.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['send_dm', 'bulk_dm_from_csv', 'read_chat', 'get_user_info'],
          description: 'Telegram action to perform'
        },
        username: {
          type: 'string',
          description: 'Telegram username (with or without @)'
        },
        chat_id: {
          type: 'string',
          description: 'Telegram chat/group username or ID (for read_chat)'
        },
        message: {
          type: 'string',
          description: 'Message to send. Supports {name} and {username} placeholders for bulk DM'
        },
        csv_file: {
          type: 'string',
          description: 'CSV filename in data dir (for bulk_dm_from_csv). CSV must have a "telegram" or "username" column.'
        },
        limit: {
          type: 'number',
          description: 'Number of messages to read (default 100)'
        }
      },
      required: ['action']
    }
  },

  execute: async (args, context) => {
    const { userId, masterId } = context;
    if ((userId || '').toLowerCase() !== (masterId || '').toLowerCase()) {
      return 'Error: telegram_ops is restricted to the Master user.';
    }

    const { action, username, chat_id, message, csv_file, limit = 100 } = args;
    skill(`Telegram Ops: ${action}`);

    try {
      switch (action) {
        case 'send_dm': {
          return await ta.sendDM(username, message);
        }
        case 'bulk_dm_from_csv': {
          const users = await fp.readFile(csv_file);
          if (!Array.isArray(users)) return 'Error: CSV must parse to an array of rows';
          const results = await ta.bulkDM(users, message);
          const summary = results.map(r => `• ${r.user}: ${r.result}`).join('\n');
          return `Bulk Telegram DM complete (${results.length} users):\n${summary}`;
        }
        case 'read_chat': {
          const messages = await ta.readChat(chat_id, limit);
          return JSON.stringify(messages, null, 2);
        }
        case 'get_user_info': {
          const info = await ta.getUserInfo(username);
          return JSON.stringify(info, null, 2);
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Telegram Ops Error: ${err.message}`;
    }
  }
};
