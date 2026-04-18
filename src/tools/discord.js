const { Client } = require('discord.js-selfbot-v13');

class DiscordTool {
  constructor(token) {
    this.client = new Client();
    this.token = token;
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
    const interval = setInterval(() => {
      channel.sendTyping().catch(() => {});
    }, 4000);

    while (Date.now() - start < totalTypingTime) {
      await this.humanDelay(1000, 3000);
      if (Math.random() < 0.3) await this.humanDelay(1000, 2500);
    }

    clearInterval(interval);
    await this.humanDelay(300, 1200);
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
      console.error('Send Error:', error.message);
    }
  }

  async replyToMessage(channelId, messageId, content) {
    try {
      let channel = this.client.channels.cache.get(channelId);
      if (!channel) channel = await this.client.channels.fetch(channelId);
      
      let message = await channel.messages.fetch(messageId).catch(() => channel.messages.cache.get(messageId));
      if (!message) throw new Error("Could not find message");

      const parts = this.maybeSplitMessage(content);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        await this.simulateTyping(channel, part);
        await message.reply(part);
        if (i < parts.length - 1) await this.humanDelay(800, 2000);
      }
    } catch (error) {
      console.error('Reply Error:', error.message);
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
      console.error('DM Error:', error.message);
    }
  }
}

module.exports = DiscordTool;
