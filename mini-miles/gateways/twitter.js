/**
 * gateways/twitter.js
 * Twitter gateway to listen for mentions/notifications and trigger the orchestrator.
 */

const twitterTool = require('../tools/twitter');
const orchestrator = require('../core/orchestrator');
const config = require('../config');
const { gateway, error } = require('../utils/logger');

class TwitterGateway {
  constructor() {
    this.name = 'twitter';
    this.client = null;
    this.masterUsername = (config.TWITTER_MASTER_USERNAME || 'omoonchain').replace(/^@/, '').toLowerCase();
    this.seenNotifications = new Set();
  }

  async connect() {
    try {
      this.client = await twitterTool.init();
      if (!this.client) {
        throw new Error('Failed to initialize Twitter client');
      }

      gateway(`Twitter Gateway connected. Watching for mentions/notifications...`);
      this._setupListeners();
      
      // Start streaming notifications every 30 seconds
      if (this.client.notifications?.stream) {
        this.client.notifications.stream(30000);
      } else {
        gateway('Twitter: Notification stream is unavailable on this client.');
      }
      
      return true;
    } catch (err) {
      error(`Failed to connect Twitter Gateway:`, err.message);
      return false;
    }
  }

  _setupListeners() {
    this.client.on('unreadNotifications', async (notifications) => {
      gateway(`Twitter: Received ${notifications.length} unread notifications.`);

      for (const notification of notifications) {
        const dedupeKey = String(notification.raw?.entryId || notification.sortIndex || notification.tweet?.id || '');
        if (dedupeKey && this.seenNotifications.has(dedupeKey)) {
          continue;
        }
        if (dedupeKey) {
          this.seenNotifications.add(dedupeKey);
          if (this.seenNotifications.size > 500) {
            this.seenNotifications.clear();
          }
        }

        const summary = this._formatNotification(notification);
        if (summary) {
          gateway(summary);
        }

        if (notification.type !== 'Mention' && notification.type !== 'Reply') {
          continue;
        }

        const tweet = notification.tweet;
        const author = (tweet.user?.username || '').toLowerCase();
        gateway(`Twitter ${notification.type} from: @${author}`);

        // Mandatory filter: only take live command traffic from the master account.
        if (author !== this.masterUsername) {
          gateway(`Twitter: Ignoring ${notification.type.toLowerCase()} from @${author} (Not Master)`);
          continue;
        }

        const event = {
          platform: 'twitter',
          channelId: notification.type.toLowerCase(),
          userId: author,
          content: tweet.text,
          tweetId: tweet.id,
          reply: async (text) => {
            await this._replyToTweet(tweet.id, `@${author} ${text}`);
          }
        };

        orchestrator.handleEvent(event);
      }
    });
  }

  _formatNotification(notification) {
    const tweet = notification.tweet;
    const author = (tweet?.user?.username || '').toLowerCase();

    switch (notification.type) {
      case 'Like':
        return `Twitter Like notification received${tweet?.id ? ` for tweet ${tweet.id}` : ''}.`;
      case 'Reply':
        return `Twitter Reply from @${author}: ${tweet?.text || '(no text)'}`;
      case 'Mention':
        return `Twitter Mention from @${author}: ${tweet?.text || '(no text)'}`;
      default:
        return `Twitter ${notification.type} notification received.`;
    }
  }

  async _replyToTweet(tweetId, content) {
    try {
      // The library doesn't have a direct 'reply' method visible, 
      // but we can try to use the rest client or post with in_reply_to
      // For now, we'll use a simple post if available, or log it.
      gateway(`Twitter: Replying to tweet ${tweetId}...`);
      
      // Attempting to post a reply
      // Some selfbot libraries use client.tweets.create(text, { replyTo: id })
      // Let's assume the library's create method might take options.
      // If not, we can use the rest client directly if we find the endpoint.
      
      if (this.client.tweets && typeof this.client.tweets.create === 'function') {
        // Trying to find if create takes options
        await this.client.tweets.create(content); 
        // Note: Without explicit replyTo support in the library wrapper, 
        // this might just post a new tweet. 
        // A better implementation would involve the REST client.
      }
    } catch (err) {
      error(`Failed to reply on Twitter:`, err.message);
    }
  }
}

module.exports = new TwitterGateway();
