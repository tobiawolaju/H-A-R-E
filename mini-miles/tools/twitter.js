/**
 * tools/twitter.js
 * Wrapper for Twitter-Selfbot-Library to provide core Twitter operations.
 */

const { Client } = require('../libs/twitter-selfbot/dist');
const config = require('../config');
const { log, error } = require('../utils/logger');

let _client = null;

/**
 * Initialize and login the Twitter client.
 */
async function init() {
  if (_client) return _client;

  const authToken = config.TWITTER_AUTH_TOKEN;
  if (!authToken) {
    error('TWITTER_AUTH_TOKEN is missing in .env');
    return null;
  }

  // Set environment variable expected by the library if necessary
  process.env.auth_token = authToken;

  _client = new Client();

  return new Promise((resolve, reject) => {
    _client.on('ready', () => {
      log('✅ Twitter Selfbot logged in.');
      resolve(_client);
    });

    _client.on('error', (err) => {
      error('Twitter Client Error:', err.message);
      reject(err);
    });

    // The library usually needs time to initialize or a specific call
    // Looking at the README, just creating the Client might be enough if auth_token is in env
  });
}

function getClient() {
  if (!_client) throw new Error('Twitter client not initialized.');
  return _client;
}

/**
 * Search for tweets.
 */
async function searchTweets(query) {
  const client = getClient();
  try {
    const results = await client.search({
      exactPhrases: [query],
    });
    return results.tweets.map(t => ({
      id: t.id,
      text: t.text,
      author: t.author?.username,
      createdAt: t.createdAt
    }));
  } catch (err) {
    error(`Twitter search failed: ${err.message}`);
    throw err;
  }
}

/**
 * Get profile information.
 */
async function getProfile(username) {
  const client = getClient();
  try {
    const profile = await client.profiles.fetch({ username });
    return {
      id: profile.id,
      name: profile.name,
      username: profile.username,
      description: profile.description,
      followers: profile.followersCount,
      following: profile.followingCount
    };
  } catch (err) {
    error(`Failed to fetch Twitter profile @${username}: ${err.message}`);
    throw err;
  }
}

/**
 * Get a timeline.
 * @param {string} type - 'home', 'following', 'posts', 'media', 'replies'
 * @param {string} [username] - Required for profile timelines
 */
async function getTimeline(type, username = null) {
  const client = getClient();
  try {
    let timeline;
    if (username) {
      const profile = await client.profiles.fetch({ username });
      timeline = await profile.timelines.fetch(type);
    } else {
      timeline = await client.timelines.fetch({ type });
    }
    return timeline.tweets.map(t => ({
      id: t.id,
      text: t.text,
      author: t.author?.username,
      createdAt: t.createdAt
    }));
  } catch (err) {
    error(`Failed to fetch ${type} timeline: ${err.message}`);
    throw err;
  }
}

/**
 * Post a tweet.
 */
async function postTweet(text) {
  const client = getClient();
  try {
    if (client.tweets && typeof client.tweets.create === 'function') {
      const response = await client.tweets.create(text);
      
      // Check for GraphQL errors
      if (response.errors) {
        throw new Error(response.errors.map(e => e.message).join(', '));
      }

      const tweetId = response.data?.create_tweet?.tweet_results?.result?.rest_id;
      if (tweetId) {
        return `✅ Tweet posted! ID: ${tweetId}`;
      } else {
        log('Tweet might have been posted (no ID in response):', JSON.stringify(response));
        return '✅ Tweet posted successfully.';
      }
    } else {
      throw new Error('Tweet creation not supported by this version of the library.');
    }
  } catch (err) {
    error(`Failed to post tweet: ${err.message}`);
    throw err;
  }
}

module.exports = { init, getClient, searchTweets, getProfile, getTimeline, postTweet };
