/**
 * skills/discord-ops.js
 * Exposes Discord channel reading, activity analysis, and DM capabilities to the LLM agent.
 */

const da = require('../tools/discord-actions');
const fp = require('../tools/file-parser');
const { skill } = require('../utils/logger');
const config = require('../config');

module.exports = {
  definition: {
    name: 'discord_ops',
    description: 'Perform advanced Discord operations. Use this to: read and analyze channel messages/activity, send DMs to individual users, or run bulk DM campaigns from a CSV file. ONLY available to MASTER user.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read_channel', 'analyze_channel', 'send_dm', 'bulk_dm_from_csv', 'find_user', 'friend_status', 'list_friends', 'incoming_requests', 'outgoing_requests', 'send_friend_request', 'accept_friend_request', 'remove_relationship'],
          description: 'Discord action to perform'
        },
        channel_id: {
          type: 'string',
          description: 'Discord channel ID (for read/analyze)'
        },
        guild_id: {
          type: 'string',
          description: 'Discord server/guild ID (for find_user)'
        },
        user_id: {
          type: 'string',
          description: 'Discord user ID or username (for send_dm)'
        },
        message: {
          type: 'string',
          description: 'Message to send. Supports {name} and {username} placeholders for bulk DM'
        },
        csv_file: {
          type: 'string',
          description: 'CSV filename in data dir (for bulk_dm_from_csv). CSV must have a "discord" or "id" column.'
        },
        limit: {
          type: 'number',
          description: 'Number of messages to fetch (default 100, max 100)'
        },
        query: {
          type: 'string',
          description: 'Search query for find_user'
        },
        target_user: {
          type: 'string',
          description: 'Discord user ID, mention, or username for relationship actions'
        }
      },
      required: ['action']
    }
  },

  execute: async (args, context) => {
    const { userId, masterId } = context;
    if ((userId || '').toLowerCase() !== (masterId || '').toLowerCase()) {
      return 'Error: discord_ops is restricted to the Master user.';
    }

    const { action, channel_id, guild_id, user_id, message, csv_file, limit = 100, query, target_user } = args;
    skill(`Discord Ops: ${action}`);

    try {
      switch (action) {
        case 'read_channel': {
          const msgs = await da.readChannel(channel_id, limit);
          return JSON.stringify(msgs, null, 2);
        }
        case 'analyze_channel': {
          const analysis = await da.analyzeChannel(channel_id, limit);
          return JSON.stringify(analysis, null, 2);
        }
        case 'send_dm': {
          return await da.sendDM(user_id, message);
        }
        case 'bulk_dm_from_csv': {
          const users = await fp.readFile(csv_file);
          if (!Array.isArray(users)) return 'Error: CSV must parse to an array of rows';
          const results = await da.bulkDM(users, message);
          const summary = results.map(r => `• ${r.user}: ${r.result}`).join('\n');
          return `Bulk DM complete (${results.length} users):\n${summary}`;
        }
        case 'find_user': {
          const members = await da.findUser(guild_id, query);
          return JSON.stringify(members, null, 2);
        }
        case 'friend_status': {
          return JSON.stringify(await da.getFriendStatus(target_user), null, 2);
        }
        case 'list_friends': {
          return JSON.stringify(await da.listFriends(), null, 2);
        }
        case 'incoming_requests': {
          return JSON.stringify(await da.listIncomingRequests(), null, 2);
        }
        case 'outgoing_requests': {
          return JSON.stringify(await da.listOutgoingRequests(), null, 2);
        }
        case 'send_friend_request': {
          return await da.sendFriendRequest(target_user);
        }
        case 'accept_friend_request': {
          return await da.acceptFriendRequest(target_user);
        }
        case 'remove_relationship': {
          return await da.removeRelationship(target_user);
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Discord Ops Error: ${err.message}`;
    }
  }
};
