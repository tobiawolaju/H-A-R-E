const llm = require('../utils/llm');
const memory = require('./memory');
const config = require('../config');
const { core, error } = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

/**
 * Ensure history always starts with a 'user' turn.
 * Gemini SDK throws if the first entry is role 'model' or 'function'.
 * This strips any leading non-user entries caused by mid-turn crashes.
 */
function sanitizeHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return [];
  const firstUserIdx = history.findIndex((entry) => entry.role === 'user');
  if (firstUserIdx === -1) return [];
  return history.slice(firstUserIdx);
}

class Orchestrator {
  constructor() {
    this.skills = new Map();
    this._loadSkills();

    setImmediate(() => {
      try {
        const sched = require('../tools/scheduler');
        sched.setOrchestrator(this);
      } catch (e) {
        // Scheduler is optional.
      }
    });
  }

  _isMasterUser(userId) {
    const normalized = (userId || '').toLowerCase();
    const aliases = Array.isArray(config.MASTER_IDENTIFIERS) && config.MASTER_IDENTIFIERS.length > 0
      ? config.MASTER_IDENTIFIERS
      : [(config.MASTER_USER_ID || 'tobiawolaju').toLowerCase()];
    return aliases.includes(normalized);
  }

  _getTwitterSkill() {
    return this.skills.get('twitter_actions');
  }

  _getTwitterTool() {
    return require('../tools/twitter');
  }

  _getDiscordTool() {
    return require('../tools/discord-actions');
  }

  _getSkillsMarketplaceTool() {
    return this.skills.get('skills_marketplace');
  }

  _getWalletSkill() {
    return this.skills.get('wallet_ops');
  }

  _getEmailSkill() {
    return this.skills.get('email_ops');
  }

  _getSkillGroups() {
    return [
      {
        title: 'Social / Messaging',
        names: ['discord_ops', 'telegram_ops', 'twitter_actions']
      },
      {
        title: 'Research / Web',
        names: ['github_operation', 'web_search_and_scrape']
      },
      {
        title: 'Skills Marketplace',
        names: ['skills_marketplace']
      },
      {
        title: 'Wallet / Email',
        names: ['wallet_ops', 'email_ops']
      },
      {
        title: 'Media / Files',
        names: ['file_manager', 'video_ops']
      },
      {
        title: 'Automation / Scheduling',
        names: ['scheduler_ops']
      },
      {
        title: 'Monad / Hackathon',
        names: ['monad_ops', 'hackathon_ops']
      }
    ];
  }

  _formatSkillLine(name, skill) {
    const def = skill.definition;
    const actions = def.parameters?.properties?.action?.enum;
    const actionText = Array.isArray(actions) && actions.length > 0 ? ` Actions: ${actions.join(', ')}` : '';
    return `- \`${name}\`: ${def.description}${actionText}`;
  }

  _formatSkillGroup(group) {
    const present = group.names.filter((name) => this.skills.has(name));
    if (present.length === 0) return null;
    const lines = [`- ${group.title}`];
    for (const name of present) {
      lines.push(`  - ${this._formatSkillLine(name, this.skills.get(name)).slice(2)}`);
    }
    return lines;
  }

  _getHelpMessage() {
    const lines = [
      'HARE Commands & Tools',
      '',
      'Core commands',
      '- `!help` Show this help message',
      '- `!tweet your text here` Post a tweet immediately',
      '- `tweet: your text here` Post a tweet immediately',
      '- `!like <tweet link>` Like a tweet',
      '- `!unlike <tweet link>` Remove a like from a tweet',
      '- `!friends` List your Discord friends',
      '- `!incoming` List incoming friend requests',
      '- `!outgoing` List outgoing friend requests',
      '- `!friendstatus <user>` Check friendship status with a user',
      '- `!friendreq <user>` Send a friend request',
      '- `!acceptfriend <user>` Accept an incoming friend request',
      '- `!unfriend <user>` Remove a friend or cancel a pending request',
      '- `!githubwhoami` Show the authenticated GitHub login',
      '- `!skills find <query>` Search skills.sh for skills',
      '- `!skills list` List installed marketplace skills',
      '- `!skills add <package>` Install a skill from the marketplace',
      '- `!skills remove <skill>` Remove an installed marketplace skill',
      '- `!skills check` Check installed skills for updates',
      '- `!skills update` Update installed marketplace skills',
      '- `!skills local` List locally loaded JS skills',
      '- `!skills reload` Reload locally loaded JS skills',
      '- `!wallet create [label] [chains]` Create a protected wallet',
      '- `!wallet import <mnemonic> [label] [chains]` Import a wallet into the vault',
      '- `!wallet list` List stored wallets',
      '- `!wallet chains` List supported chains',
      '- `!wallet address <wallet> <chain>` Get a wallet address',
      '- `!wallet balance <wallet> <chain>` Check a balance',
      '- `!wallet send <wallet> <chain> <to> <amount>` Send funds',
      '- `!wallet sign <wallet> <chain> <message>` Sign a message',
      '- `!wallet contract <wallet> <chain> <to> <data> [value]` Sign a contract transaction',
      '- `!wallet delete <wallet>` Remove a stored wallet',
      '- `!wallet migrate [wallet]` Create a new wallet and prepare migration',
      '- `!wallet confirm <migration id>` Confirm a prepared migration',
      '- `!email send <to> | <subject> | <body>` Send an email',
      '- `!email read [limit] [mailbox]` Read emails',
      '- `!email delete <uid> [mailbox]` Delete an email',
      '- `!email mailboxes` List mailboxes',
      '- `!email search <json query>` Search emails with IMAP query fields',
      '- `!reply <tweet link> <text>` Reply to a tweet',
      '- `!comment <tweet link> <text>` Alias for `!reply`',
      '- `!quote <tweet link> <text>` Quote a tweet',
      '- `!retweet <tweet link>` Repost a tweet (experimental)',
      '- `!unretweet <tweet link>` Remove a repost (experimental)',
      '',
      'Examples',
      '- `!tweet building live bot tooling today`',
      '- `tweet: shipping the new command surface`',
      '- `!reply https://x.com/user/status/1234567890 that is useful`',
      '- `!quote https://x.com/user/status/1234567890 good point`',
      '- `!like https://x.com/user/status/1234567890`',
      '- `!unlike https://x.com/user/status/1234567890`',
      '- `!friends`',
      '- `!incoming`',
      '- `!outgoing`',
      '- `!friendstatus @someuser`',
      '- `!friendreq @someuser`',
      '- `!acceptfriend @someuser`',
      '- `!unfriend @someuser`',
      '- `!githubwhoami`',
      '- `!skills find react testing`',
      '- `!skills list`',
      '- `!skills add vercel-labs/agent-skills`',
      '- `!skills remove vercel-labs/agent-skills@web-design-guidelines`',
      '- `!skills local`',
      '- `!wallet list`',
      '- `!email read 5 INBOX`',
      '- `Search Twitter for I follow back`',
      '- `Fetch my GitHub profile and latest repo activity`',
      '',
      'Bot rules',
      `- Twitter live commands are limited to @${config.TWITTER_MASTER_USERNAME || 'omoonchain'}`,
      '- Discord and Telegram are the primary command surfaces',
      '- Twitter mentions can still route into the agent, but `!tweet` and `tweet:` are the deterministic post paths',
      '- Tweet-link commands only work for the master account',
      '- Natural-language requests can still route through the LLM and loaded skills',
      '- Background heartbeat keeps Discord presence and Spotify status updated',
      '',
      'Loaded skills'
    ];

    for (const group of this._getSkillGroups()) {
      const formatted = this._formatSkillGroup(group);
      if (formatted) lines.push(...formatted);
    }

    lines.push(
      '',
      'Live prompts',
      '- `@bot !tweet status update` on Twitter',
      '- `search Twitter for I follow back`',
      '- `get profile for tobiawolaju`',
      '- `show me my posts timeline`'
    );

    return lines.join('\n');
  }

  async _handleTweetCommand(text, reply, userId) {
    const cleanText = (text || '').trim();
    if (!cleanText) {
      await reply('Usage: `!tweet your text here` or `tweet: your text here`');
      return true;
    }

    const twitterSkill = this._getTwitterSkill();
    if (!twitterSkill) {
      await reply('Twitter posting is unavailable because `twitter_actions` is not loaded.');
      return true;
    }

    const result = await twitterSkill.execute(
      { action: 'post_tweet', text: cleanText },
      { userId, masterId: config.MASTER_USER_ID }
    );
    await reply(result);
    return true;
  }

  async _handleTweetLinkAction(action, text, reply, userId) {
    const twitter = this._getTwitterTool();
    const trimmed = (text || '').trim();
    const firstToken = trimmed.split(/\s+/)[0];
    const tweetId = twitter.extractTweetId(firstToken);

    if (!tweetId) {
      await reply('Usage: include a valid tweet link after the command.');
      return true;
    }

    const remainder = trimmed.slice(firstToken.length).trim();

    switch (action) {
      case 'like':
        await reply(await twitter.likeTweet(firstToken));
        return true;
      case 'unlike':
        await reply(await twitter.unlikeTweet(firstToken));
        return true;
      case 'retweet':
        await reply(await twitter.retweet(firstToken));
        return true;
      case 'unretweet':
        await reply(await twitter.unretweet(firstToken));
        return true;
      case 'reply':
      case 'comment':
        if (!remainder) {
          await reply('Usage: `!reply <tweet link> <your reply>`');
          return true;
        }
        await reply(await twitter.replyToTweet(firstToken, remainder));
        return true;
      case 'quote':
        if (!remainder) {
          await reply('Usage: `!quote <tweet link> <your comment>`');
          return true;
        }
        await reply(await twitter.quoteTweet(firstToken, remainder));
        return true;
      default:
        return false;
    }
  }

  async _handleDiscordRelationshipCommand(action, text, reply, userId) {
    const discordActions = this._getDiscordTool();
    const trimmed = (text || '').trim();

    switch (action) {
      case 'friends':
        await reply(JSON.stringify(await discordActions.listFriends(), null, 2));
        return true;
      case 'incoming':
        await reply(JSON.stringify(await discordActions.listIncomingRequests(), null, 2));
        return true;
      case 'outgoing':
        await reply(JSON.stringify(await discordActions.listOutgoingRequests(), null, 2));
        return true;
      case 'friendstatus': {
        if (!trimmed) {
          await reply('Usage: `!friendstatus <user id | @username | mention>`');
          return true;
        }
        await reply(JSON.stringify(await discordActions.getFriendStatus(trimmed), null, 2));
        return true;
      }
      case 'friendreq': {
        if (!trimmed) {
          await reply('Usage: `!friendreq <user id | @username | mention>`');
          return true;
        }
        await reply(await discordActions.sendFriendRequest(trimmed));
        return true;
      }
      case 'acceptfriend': {
        if (!trimmed) {
          await reply('Usage: `!acceptfriend <user id | @username | mention>`');
          return true;
        }
        await reply(await discordActions.acceptFriendRequest(trimmed));
        return true;
      }
      case 'unfriend': {
        if (!trimmed) {
          await reply('Usage: `!unfriend <user id | @username | mention>`');
          return true;
        }
        await reply(await discordActions.removeRelationship(trimmed));
        return true;
      }
      default:
        return false;
    }
  }

  async _handleSkillsCommand(text, reply, userId) {
    const marketplaceSkill = this._getSkillsMarketplaceTool();
    if (!marketplaceSkill) {
      await reply('Skills marketplace operations are unavailable because `skills_marketplace` is not loaded.');
      return true;
    }

    const trimmed = (text || '').trim();
    if (!trimmed) {
      await reply('Usage: `!skills find <query>`, `!skills list`, `!skills add <package>`, `!skills remove <skill>`, `!skills check`, or `!skills update`.');
      return true;
    }

    const [subcommand, ...rest] = trimmed.split(/\s+/);
    const remainder = rest.join(' ').trim();

    switch (subcommand.toLowerCase()) {
      case 'find':
      case 'search':
        await reply(await marketplaceSkill.execute(
          { action: 'find', query: remainder },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'list':
        await reply(await marketplaceSkill.execute(
          { action: 'list', source: remainder },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'add':
      case 'install':
        await reply(await marketplaceSkill.execute(
          { action: 'install', source: remainder },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'remove':
      case 'rm':
      case 'delete':
        await reply(await marketplaceSkill.execute(
          { action: 'remove', source: remainder },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'check':
        await reply(await marketplaceSkill.execute(
          { action: 'check' },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'update':
        await reply(await marketplaceSkill.execute(
          { action: 'update' },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'list-local':
      case 'local':
        await reply(await marketplaceSkill.execute(
          { action: 'list_local' },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'reload':
        await reply(await marketplaceSkill.execute(
          { action: 'reload_local' },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      default:
        await reply('Unknown skills command. Use `!skills find`, `!skills list`, `!skills add`, `!skills remove`, `!skills check`, or `!skills update`.');
        return true;
    }
  }

  async _handleWalletCommand(text, reply, userId) {
    const walletSkill = this._getWalletSkill();
    if (!walletSkill) {
      await reply('Wallet operations are unavailable because `wallet_ops` is not loaded.');
      return true;
    }

    const trimmed = (text || '').trim();
    if (!trimmed) {
      await reply('Usage: `!wallet create [label] [chains]`, `!wallet list`, `!wallet balance <wallet> <chain>`, `!wallet send <wallet> <chain> <to> <amount>`, `!wallet sign <wallet> <chain> <message>`, `!wallet contract <wallet> <chain> <to> <data> [value]`, `!wallet delete <wallet>`');
      return true;
    }

    const [subcommand, ...rest] = trimmed.split(/\s+/);
    const remainder = rest.join(' ').trim();

    switch (subcommand.toLowerCase()) {
      case 'create': {
        const [label, ...chainParts] = remainder ? remainder.split(/\s+/) : [];
        const chains = chainParts.join(' ').trim();
        await reply(await walletSkill.execute(
          { action: 'create_wallet', label, chains },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'import': {
        const [mnemonic, label, ...chainParts] = remainder ? remainder.split(/\s+/) : [];
        const chains = chainParts.join(' ').trim();
        await reply(await walletSkill.execute(
          { action: 'import_wallet', mnemonic, label, chains },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'list':
        await reply(await walletSkill.execute(
          { action: 'list_wallets' },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'chains':
        await reply(await walletSkill.execute(
          { action: 'list_supported_chains' },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'address': {
        const [walletRef, chain] = remainder.split(/\s+/);
        await reply(await walletSkill.execute(
          { action: 'get_address', walletRef, chain },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'balance': {
        const [walletRef, chain] = remainder.split(/\s+/);
        await reply(await walletSkill.execute(
          { action: 'get_balance', walletRef, chain },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'send': {
        const [walletRef, chain, to, amount] = remainder.split(/\s+/);
        await reply(await walletSkill.execute(
          { action: 'send_funds', walletRef, chain, to, amount },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'sign': {
        const [walletRef, chain, ...messageParts] = remainder.split(/\s+/);
        await reply(await walletSkill.execute(
          { action: 'sign_message', walletRef, chain, message: messageParts.join(' ') },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'contract': {
        const [walletRef, chain, to, valueOrData, ...restParts] = remainder.split(/\s+/);
        const maybeValue = restParts.length > 0 ? valueOrData : '';
        const data = restParts.length > 0 ? restParts.join(' ') : valueOrData;
        await reply(await walletSkill.execute(
          { action: 'sign_contract', walletRef, chain, to, data, value: maybeValue },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'delete':
      case 'remove':
        await reply(await walletSkill.execute(
          { action: 'delete_wallet', walletRef: remainder },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'migrate': {
        const sourceWalletRef = remainder || 'current';
        await reply(await walletSkill.execute(
          { action: 'migrate_wallet', sourceWalletRef },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'confirm': {
        await reply(await walletSkill.execute(
          { action: 'confirm_migration', migrationId: remainder },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      default:
        await reply('Unknown wallet command. Use `!wallet create`, `!wallet list`, `!wallet balance`, `!wallet send`, `!wallet sign`, `!wallet contract`, `!wallet delete`, `!wallet migrate`, `!wallet confirm`, or `!wallet chains`.');
        return true;
    }
  }

  async _handleEmailCommand(text, reply, userId) {
    const emailSkill = this._getEmailSkill();
    if (!emailSkill) {
      await reply('Email operations are unavailable because `email_ops` is not loaded.');
      return true;
    }

    const trimmed = (text || '').trim();
    if (!trimmed) {
      await reply('Usage: `!email send <to> | <subject> | <body>`, `!email read [limit] [mailbox]`, `!email delete <uid> [mailbox]`, `!email mailboxes`, or `!email search <json query>`');
      return true;
    }

    const [subcommand, ...rest] = trimmed.split(/\s+/);
    const remainder = rest.join(' ').trim();

    switch (subcommand.toLowerCase()) {
      case 'send': {
        const parts = remainder.split('|').map((part) => part.trim());
        const [to, subject, body] = parts;
        await reply(await emailSkill.execute(
          { action: 'send_email', to, subject, text: body },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'read': {
        const [limitRaw, mailbox] = remainder.split(/\s+/);
        const limit = limitRaw ? Number(limitRaw) : undefined;
        await reply(await emailSkill.execute(
          { action: 'read_emails', limit, mailbox },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'delete': {
        const [uidRaw, mailbox] = remainder.split(/\s+/);
        await reply(await emailSkill.execute(
          { action: 'delete_email', uid: Number(uidRaw), mailbox },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      case 'mailboxes':
      case 'folders':
        await reply(await emailSkill.execute(
          { action: 'list_mailboxes' },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      case 'search': {
        let query = {};
        try {
          query = remainder ? JSON.parse(remainder) : {};
        } catch {
          query = remainder ? { subject: remainder } : {};
        }
        await reply(await emailSkill.execute(
          { action: 'search_emails', query },
          { userId, masterId: config.MASTER_USER_ID, orchestrator: this }
        ));
        return true;
      }
      default:
        await reply('Unknown email command. Use `!email send`, `!email read`, `!email delete`, `!email mailboxes`, or `!email search`.');
        return true;
    }
  }

  async _handleBangCommand(event) {
    const { platform, userId, content, reply } = event;
    const trimmed = content.trim();
    const lower = trimmed.toLowerCase();
    const isMaster = this._isMasterUser(userId);
    const isCommandPlatform = platform === 'discord' || platform === 'telegram' || platform === 'twitter';

    if (lower === '!help') {
      if (!isMaster || !isCommandPlatform) {
        core(`Ignoring !help from ${userId} on ${platform} (Not Master or Restricted Platform)`);
        return true;
      }

      await reply(this._getHelpMessage());
      return true;
    }

    if (lower.startsWith('!tweet')) {
      if (!isMaster) {
        core(`Ignoring !tweet from ${userId} on ${platform} (Not Master)`);
        return true;
      }

      return this._handleTweetCommand(trimmed.slice('!tweet'.length), reply, userId);
    }

    const skillsMatch = trimmed.match(/^!skills(?:\s+([\s\S]*))?$/i);
    if (skillsMatch) {
      if (!isMaster) {
        core(`Ignoring !skills from ${userId} on ${platform} (Not Master)`);
        return true;
      }

      return this._handleSkillsCommand(skillsMatch[1] || '', reply, userId);
    }

    const walletMatch = trimmed.match(/^!wallet(?:\s+([\s\S]*))?$/i);
    if (walletMatch) {
      if (!isMaster) {
        core(`Ignoring !wallet from ${userId} on ${platform} (Not Master)`);
        return true;
      }

      return this._handleWalletCommand(walletMatch[1] || '', reply, userId);
    }

    const emailMatch = trimmed.match(/^!email(?:\s+([\s\S]*))?$/i);
    if (emailMatch) {
      if (!isMaster) {
        core(`Ignoring !email from ${userId} on ${platform} (Not Master)`);
        return true;
      }

      return this._handleEmailCommand(emailMatch[1] || '', reply, userId);
    }

    const githubWhoamiMatch = trimmed.match(/^!githubwhoami\s*$/i);
    if (githubWhoamiMatch) {
      if (!isMaster) {
        core(`Ignoring !githubwhoami from ${userId} on ${platform} (Not Master)`);
        return true;
      }

      const githubSkill = this.skills.get('github_operation');
      if (!githubSkill) {
        await reply('GitHub operations are unavailable because `github_operation` is not loaded.');
        return true;
      }

      await reply(await githubSkill.execute({ action: 'whoami' }, { userId, masterId: config.MASTER_USER_ID, orchestrator: this }));
      return true;
    }

    const relationshipMatch = trimmed.match(/^!(friends|incoming|outgoing|friendstatus|friendreq|acceptfriend|unfriend)\s*([\s\S]*)$/i);
    if (relationshipMatch) {
      if (!isMaster) {
        core(`Ignoring ${relationshipMatch[1]} from ${userId} on ${platform} (Not Master)`);
        return true;
      }

      return this._handleDiscordRelationshipCommand(
        relationshipMatch[1].toLowerCase(),
        relationshipMatch[2],
        reply,
        userId
      );
    }

    const linkActionMatch = trimmed.match(/^!(like|unlike|retweet|unretweet|reply|comment|quote)\s+([\s\S]+)$/i);
    if (linkActionMatch) {
      if (!isMaster) {
        core(`Ignoring ${linkActionMatch[1]} from ${userId} on ${platform} (Not Master)`);
        return true;
      }

      return this._handleTweetLinkAction(linkActionMatch[1].toLowerCase(), linkActionMatch[2], reply, userId);
    }

    return false;
  }

  async _handleInlineTweetCommand(event) {
    const { userId, content, reply } = event;
    if (!this._isMasterUser(userId)) return false;

    const match = content.trim().match(/^tweet:\s*([\s\S]+)$/i);
    if (!match) return false;

    return this._handleTweetCommand(match[1], reply, userId);
  }

  async _loadSkills() {
    const skillsPath = path.resolve(__dirname, '../skills');
    const files = await fs.readdir(skillsPath);
    for (const file of files) {
      if (!file.endsWith('.js')) continue;

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

  getToolDefinitions() {
    return Array.from(this.skills.values()).map((skill) => skill.definition);
  }

  async handleEvent(event) {
    const { platform, channelId, userId, content, reply, startTyping } = event;
    const sessionKey = memory.getSessionKey(platform, channelId, userId);

    if (typeof startTyping === 'function') startTyping();

    core(`Handling event from ${userId} on ${platform}`);

    if (content.trim().startsWith('!')) {
      const handled = await this._handleBangCommand(event);
      if (handled) return;
    }

    const inlineTweetHandled = await this._handleInlineTweetCommand(event);
    if (inlineTweetHandled) return;

    try {
      let history = await memory.getHistory(sessionKey);
      history = sanitizeHistory(history);
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
          core(
            `Agent requested tools (parallel x${response.toolCalls.length}): ${response.toolCalls
              .map((toolCall) => toolCall.name)
              .join(', ')}`
          );

          const toolResults = await Promise.all(
            response.toolCalls.map(async (call) => {
              const skill = this.skills.get(call.name);
              if (skill) {
                core(`Executing skill: ${call.name}`);
                const result = await skill.execute(call.args, { userId, masterId: config.MASTER_USER_ID, orchestrator: this });
                return { name: call.name, result };
              }
              return { name: call.name, result: 'Error: Tool not found' };
            })
          );

          for (const { name, result } of toolResults) {
            history.push(llm.formatToolResult(name, result));
          }

          iterations++;
          continue;
        }

        break;
      }

      await memory.saveHistory(sessionKey, history);
      if (lastText) {
        await reply(lastText);
      }
    } catch (err) {
      error('Orchestrator error:', err.stack);
      await reply(`Error: ${err.message}`);
    }
  }

  async reloadSkills() {
    this.skills.clear();
    await this._loadSkills();
    return this.getLoadedSkillNames();
  }

  getLoadedSkillNames() {
    return Array.from(this.skills.keys()).sort();
  }
}

module.exports = new Orchestrator();
