/**
 * skills/twitter_actions.js
 * Twitter skill for reading, searching, and interact with X.
 */

const twitter = require('../tools/twitter');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: "twitter_actions",
    description: "Interact with Twitter (X). Search for tweets, get user profiles, view timelines, post updates, and like tweets.",
    parameters: {
      type: "object",
      properties: {
        action: { 
          type: "string", 
          enum: ['search', 'get_profile', 'get_timeline', 'post_tweet', 'like', 'unlike'],
          description: "Action to perform"
        },
        query: { type: "string", description: "Search query or topic" },
        username: { type: "string", description: "Twitter username (without @)" },
        type: { 
          type: "string", 
          enum: ['home', 'following', 'posts', 'media', 'replies'],
          description: "Timeline type" 
        },
        text: { type: "string", description: "Content of the tweet to post" },
        tweet_url: { type: "string", description: "Tweet link or tweet ID for like/retweet actions" }
      },
      required: ["action"]
    }
  },

  execute: async (args) => {
    const { action, query, username, type, text, tweet_url } = args;
    skill(`Twitter: ${action}`);

    try {
      switch (action) {
        case 'search': {
          const results = await twitter.searchTweets(query);
          return JSON.stringify(results, null, 2);
        }
        case 'get_profile': {
          const profile = await twitter.getProfile(username);
          return JSON.stringify(profile, null, 2);
        }
        case 'get_timeline': {
          const timeline = await twitter.getTimeline(type || 'home', username);
          return JSON.stringify(timeline, null, 2);
        }
        case 'post_tweet': {
          const result = await twitter.postTweet(text);
          return result;
        }
        case 'like': {
          const result = await twitter.likeTweet(tweet_url);
          return result;
        }
        case 'unlike': {
          const result = await twitter.unlikeTweet(tweet_url);
          return result;
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Twitter Error: ${err.message}`;
    }
  }
};
