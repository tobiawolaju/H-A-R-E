/**
 * telegram-actions.js
 * Advanced Telegram operations: send DMs, read chats, bulk outreach.
 */

const { Api } = require('telegram');

let _client = null;

function setClient(client) {
  _client = client;
}

function getClient() {
  if (!_client) throw new Error('Telegram client not initialized. Is the Telegram gateway running?');
  return _client;
}

/**
 * Send a message to a specific Telegram user by username.
 */
async function sendDM(username, message) {
  const client = getClient();
  try {
    const entity = await client.getEntity(username.startsWith('@') ? username : `@${username}`);
    await client.sendMessage(entity, { message });
    return `✅ DM sent to @${username}`;
  } catch (err) {
    return `❌ Failed to DM @${username}: ${err.message}`;
  }
}

/**
 * Send DMs to a list of users from an array of objects with a message template.
 */
async function bulkDM(users, messageTemplate) {
  const results = [];
  for (const user of users) {
    const username = user.telegram || user.username || user.user;
    if (!username) {
      results.push({ user: user.name || 'unknown', result: 'Skipped: no telegram username' });
      continue;
    }
    const msg = messageTemplate
      .replace('{name}', user.name || username)
      .replace('{username}', username);
    const result = await sendDM(username, msg);
    results.push({ user: user.name || username, result });
    // Delay to avoid flood limits
    await new Promise(r => setTimeout(r, 2000));
  }
  return results;
}

/**
 * Read the last N messages from a chat/group by username or ID.
 */
async function readChat(chatId, limit = 100) {
  const client = getClient();
  const entity = await client.getEntity(chatId);
  const messages = await client.getMessages(entity, { limit });
  return messages.map(m => ({
    id: m.id,
    sender: m.senderId?.toString(),
    text: m.message,
    timestamp: new Date(m.date * 1000).toISOString()
  }));
}

/**
 * Get info about a Telegram user by username.
 */
async function getUserInfo(username) {
  const client = getClient();
  const entity = await client.getEntity(username.startsWith('@') ? username : `@${username}`);
  return {
    id: entity.id?.toString(),
    username: entity.username,
    firstName: entity.firstName,
    lastName: entity.lastName,
    phone: entity.phone
  };
}

module.exports = { setClient, sendDM, bulkDM, readChat, getUserInfo };
