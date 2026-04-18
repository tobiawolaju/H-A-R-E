const { Client } = require('discord.js-selfbot-v13');

class DiscordTool {
  constructor(token) {
    this.client = new Client();
    this.token = token;
    this._typingIntervals = {}; // Track active typing loops
  }

  async connect() {
    if (this.client.isReady()) return;

    return new Promise((resolve, reject) => {
      this.client.once('ready', () => {
        console.log(`Logged in as ${this.client.user.username}`);
        resolve();
      });

      this.client.once('error', reject);

      this.client.login(this.token).catch(reject);
    });
  }

  // =========================
  // HUMAN TIMING ENGINE
  // =========================

  async humanDelay(min = 500, max = 2000) {
    const delay = min + Math.random() * (max - min);
    return new Promise(res => setTimeout(res, delay));
  }

  // Networking specific delay: 2m + random 0-60s
  async networkingDelay() {
    const delay = 120000 + Math.random() * 60000;
    console.log(`[Discord] Networking delay: ${Math.round(delay/1000)}s...`);
    return new Promise(res => setTimeout(res, delay));
  }

  async simulateTyping(channel, content) {
    if (Math.random() < 0.15) return;
    await this.humanDelay(800, 3000);

    let totalTypingTime = Math.min(12000, content.length * (25 + Math.random() * 20));
    const start = Date.now();
    
    // Use the continuous helper
    this.startTyping(channel.id);

    while (Date.now() - start < totalTypingTime) {
      await this.humanDelay(1000, 3000);
      if (Math.random() < 0.3) await this.humanDelay(1000, 2500);
    }

    this.stopTyping(channel.id);
    await this.humanDelay(300, 1200);
  }

  startTyping(channelId) {
    if (this._typingIntervals[channelId]) return;
    let channel = this.client.channels.cache.get(channelId);
    if (!channel) return;

    console.log(`[Discord] Starting persistent typing indicator in ${channelId}`);
    channel.sendTyping().catch(() => {});
    this._typingIntervals[channelId] = setInterval(() => {
      channel.sendTyping().catch(() => {});
    }, 5000);
  }

  stopTyping(channelId) {
    if (this._typingIntervals[channelId]) {
      console.log(`[Discord] Stopping persistent typing indicator in ${channelId}`);
      clearInterval(this._typingIntervals[channelId]);
      delete this._typingIntervals[channelId];
    }
  }

  maybeSplitMessage(content) {
    if (Math.random() < 0.25 && content.length > 40) {
      const mid = Math.floor(content.length / 2);
      return [content.slice(0, mid), content.slice(mid)];
    }
    return [content];
  }

  // =========================
  // SOCIAL TOOLS
  // =========================

  async sendFriendRequest(userIdOrName) {
    try {
      let user;
      if (userIdOrName.includes("#") || !/^\d+$/.test(userIdOrName)) {
        user = await this.client.users.fetch(userIdOrName, { cache: true });
      } else {
        user = await this.client.users.fetch(userIdOrName);
      }

      console.log(`[Discord] Sending friend request to ${user.tag}...`);
      await user.sendFriendRequest();
      return `Sent friend request to ${user.tag}`;
    } catch (err) {
      console.error(`[Discord] Friend request error:`, err.message);
      throw err;
    }
  }

  async getGuildAdmins(guildId) {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const members = await guild.members.fetch();
      const admins = members.filter(m => m.permissions.has("ADMINISTRATOR") && !m.user.bot);
      return admins.map(m => ({ id: m.id, tag: m.user.tag, username: m.user.username }));
    } catch (err) {
      console.error(`[Discord] Admin fetch error:`, err.message);
      throw err;
    }
  }

  async getTopMembers(guildId, limit = 100) {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const members = await guild.members.fetch({ limit });
      return members.map(m => ({ id: m.id, tag: m.user.tag, username: m.user.username }));
    } catch (err) {
      console.error(`[Discord] Member fetch error:`, err.message);
      throw err;
    }
  }

  // =========================
  // MESSAGE TOOLS
  // =========================

  async sendMessage(channelId, content) {
    try {
      let channel = this.client.channels.cache.get(channelId);
      if (!channel) channel = await this.client.channels.fetch(channelId);

      const parts = this.maybeSplitMessage(content);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        await this.simulateTyping(channel, part);
        await channel.send(part);
        if (i < parts.length - 1) await this.humanDelay(800, 2500);
      }
    } catch (error) {
      console.error('[Discord] Send Error:', error.message);
    }
  }

  async replyToMessage(channelId, messageId, content) {
    try {
      let channel = this.client.channels.cache.get(channelId);
      if (!channel) channel = await this.client.channels.fetch(channelId);
      
      let message;
      try {
        message = await channel.messages.fetch(messageId);
      } catch (err) {
        message = channel.messages.cache.get(messageId);
      }

      const parts = this.maybeSplitMessage(content);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        await this.simulateTyping(channel, part);
        
        try {
            if (message) {
                await message.reply(part);
            } else {
                await channel.send(part);
            }
        } catch (replyErr) {
            console.warn(`[Discord] Reply failed (Self-bot limitation?), falling back to send:`, replyErr.message);
            await channel.send(part);
        }
        
        if (i < parts.length - 1) await this.humanDelay(800, 2000);
      }
    } catch (error) {
      console.error('[Discord] Reply Logic Error:', error.message);
    }
  }

  async sendDM(userId, content) {
    try {
      const user = await this.client.users.fetch(userId);
      await this.humanDelay(1500, 4000);

      const parts = this.maybeSplitMessage(content);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        await user.sendTyping();
        await this.humanDelay(1000, 3000);
        await user.send(part);
        if (i < parts.length - 1) await this.humanDelay(1000, 2500);
      }
    } catch (error) {
      console.error('[Discord] DM Error:', error.message);
    }
  }
}

module.exports = DiscordTool;
