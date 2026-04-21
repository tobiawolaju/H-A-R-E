/**
 * discord-actions.js
 * Advanced Discord operations: read channels, send DMs, analyze activity.
 * Requires the discord gateway client.
 */

const discord = require('../gateways/discord');

function normalizeUserQuery(input) {
  return String(input || '').trim().replace(/^@/, '');
}

function extractMentionId(input) {
  const match = String(input || '').trim().match(/^<@!?(\d{17,20})>$/);
  return match ? match[1] : null;
}

async function resolveUserId(identifier) {
  const directId = extractMentionId(identifier) || (String(identifier || '').trim().match(/^\d{17,20}$/)?.[0] || null);
  if (directId) return directId;

  const query = normalizeUserQuery(identifier).toLowerCase();
  if (!query) return null;

  const guilds = Array.from(discord.client.guilds.cache.values());
  for (const guild of guilds) {
    try {
      await guild.members.fetch();
    } catch {
      // Ignore guild fetch failures and keep searching the rest.
    }

    const member = guild.members.cache.find((m) => {
      const username = (m.user.username || '').toLowerCase();
      const displayName = (m.displayName || m.nickname || '').toLowerCase();
      return username === query || displayName === query;
    });

    if (member) {
      return member.user.id;
    }
  }

  return null;
}

/**
 * Read the last N messages from a channel by ID.
 */
async function readChannel(channelId, limit = 100) {
  const channel = await discord.client.channels.fetch(channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found`);
  const messages = await channel.messages.fetch({ limit: Math.min(limit, 100) });
  return messages.map(m => ({
    author: m.author.username,
    content: m.content,
    timestamp: m.createdAt.toISOString(),
    id: m.id
  }));
}

/**
 * Analyze channel activity: most active users, message frequency, top topics.
 */
async function analyzeChannel(channelId, limit = 200) {
  const messages = await readChannel(channelId, limit);
  const userCounts = {};
  for (const msg of messages) {
    userCounts[msg.author] = (userCounts[msg.author] || 0) + 1;
  }
  const sorted = Object.entries(userCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([user, count]) => ({ user, messageCount: count }));

  return {
    totalMessages: messages.length,
    uniqueUsers: Object.keys(userCounts).length,
    mostActive: sorted,
    recentMessages: messages.slice(0, 10)
  };
}

/**
 * Send a DM to a user by their username or user ID.
 */
async function sendDM(userId, message) {
  try {
    const resolvedUserId = await resolveUserId(userId);
    if (!resolvedUserId) {
      return `Failed to resolve Discord user ID from ${userId}`;
    }

    const user = await discord.client.users.fetch(resolvedUserId);
    const dm = await user.createDM();
    await dm.send(message);
    return `DM sent to ${user.username}`;
  } catch (err) {
    return `Failed to DM ${userId}: ${err.message}`;
  }
}

/**
 * Send DMs to a list of users from a pre-loaded array.
 * Returns results array.
 */
async function bulkDM(users, messageTemplate) {
  const results = [];
  for (const user of users) {
    const msg = messageTemplate
      .replace('{name}', user.name || user.username || user.user || '')
      .replace('{username}', user.discord || user.username || user.user || '');
    const result = await sendDM(user.discord || user.id || user.username, msg);
    results.push({ user: user.name || user.username, result });
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 1200));
  }
  return results;
}

/**
 * Find users in a server/guild by searching all members.
 */
async function findUser(guildId, query) {
  const guild = await discord.client.guilds.fetch(guildId);
  await guild.members.fetch();
  const members = guild.members.cache.filter(m =>
    m.user.username.toLowerCase().includes(query.toLowerCase()) ||
    (m.nickname || '').toLowerCase().includes(query.toLowerCase())
  );
  return members.map(m => ({
    id: m.user.id,
    username: m.user.username,
    nickname: m.nickname,
    joinedAt: m.joinedAt
  }));
}

module.exports = { readChannel, analyzeChannel, sendDM, bulkDM, findUser, resolveUserId };
