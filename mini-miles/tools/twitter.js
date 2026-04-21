/**
 * tools/twitter.js
 * Wrapper for Twitter-Selfbot-Library to provide stable Twitter operations.
 */

const axios = require('axios');
const { Client } = require('../libs/twitter-selfbot/dist');
const { Queries } = require('../libs/twitter-selfbot/dist/Routes');
const { NotificationsManager } = require('../libs/twitter-selfbot/dist/Managers/NotificationsManager');
const { RESTApiManager } = require('../libs/twitter-selfbot/dist/REST/rest');
const config = require('../config');
const { log, error } = require('../utils/logger');

let _client = null;
let _patchesApplied = false;
let _routeSync = null;

function isRetryableTwitterTransportError(err) {
  const code = err?.code || '';
  const message = err?.message || '';
  return (
    code === 'EPROTO' ||
    code === 'ECONNRESET' ||
    code.startsWith('ERR_SSL_') ||
    message.includes('bad record mac') ||
    message.includes('tls alert') ||
    message.includes('socket hang up')
  );
}

function isNotFoundTwitterRouteError(err) {
  return err?.response?.status === 404 || err?.code === 'ERR_BAD_REQUEST';
}

async function withRetry(label, fn, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableTwitterTransportError(err) || attempt === maxAttempts) {
        throw err;
      }

      error(`${label} attempt ${attempt}/${maxAttempts} failed:`, err.message);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw lastError;
}

function applyLibraryPatches() {
  if (_patchesApplied) return;
  _patchesApplied = true;

  const originalFetchAll = NotificationsManager.prototype.fetchAll;
  NotificationsManager.prototype.fetchAll = async function patchedFetchAll() {
    try {
      return await originalFetchAll.call(this);
    } catch (err) {
      error('Twitter notifications bootstrap failed:', err.message);
      return [];
    }
  };

  const originalGet = RESTApiManager.prototype.get;
  RESTApiManager.prototype.get = async function patchedGet(url, noAuth = false, noTransaction = false) {
    return withRetry(`Twitter GET ${url}`, () => originalGet.call(this, url, noAuth, noTransaction));
  };

  const originalPost = RESTApiManager.prototype.post;
  RESTApiManager.prototype.post = async function patchedPost(url, data, overwriteHeaders, noTransaction = false) {
    return withRetry(`Twitter POST ${url}`, () => originalPost.call(this, url, data, overwriteHeaders, noTransaction));
  };
}

function normalizeTweet(tweet) {
  return {
    id: tweet?.id,
    text: tweet?.text,
    author:
      tweet?.user?.username ||
      tweet?.raw?.core?.user_results?.result?.core?.screen_name ||
      tweet?.raw?.core?.user_results?.result?.legacy?.screen_name,
    createdAt: tweet?.createdAt
  };
}

function extractProfile(rawProfile, username) {
  const result = rawProfile?.data?.user?.result;
  const legacy = result?.legacy || {};
  const core = result?.core || {};
  const location = result?.location?.location || legacy.location;

  return {
    id: result?.rest_id,
    name: core.name || legacy.name,
    username: core.screen_name || username,
    description: legacy.description,
    followers: legacy.followers_count,
    following: legacy.friends_count,
    location
  };
}

async function syncRouteIds(authToken, force = false) {
  if (_routeSync && !force) return _routeSync;
  const home = await axios.get('https://x.com/home', {
    headers: {
      cookie: `auth_token=${authToken}`
    }
  });

  const mainUrl = home.data.match(/https:\/\/[^="']+main[^="']+\.js/)?.[0];
  if (!mainUrl) {
    throw new Error('Failed to locate X main.js while syncing Twitter route IDs.');
  }

  const mainJs = (await axios.get(mainUrl)).data;
  const routeNames = {
    search: 'SearchTimeline',
    posts: 'UserTweets',
    media: 'UserMedia',
    replies: 'UserTweetsAndReplies'
  };

  const synced = {};
  for (const [key, operationName] of Object.entries(routeNames)) {
    const match = mainJs.match(new RegExp(`queryId:"([^"]+)",operationName:"${operationName}"`));
    if (!match) {
      throw new Error(`Failed to extract ${operationName} query ID from X main.js.`);
    }
    Queries.timelines[key].queryId = match[1];
    synced[key] = match[1];
  }

  _routeSync = synced;
  return _routeSync;
}

async function withRouteRefresh(label, fn) {
  try {
    return await fn();
  } catch (err) {
    if (!isNotFoundTwitterRouteError(err)) throw err;
    await syncRouteIds(config.TWITTER_AUTH_TOKEN, true);
    return fn();
  }
}

async function createClientWithRetry(authToken, maxAttempts = 4) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      applyLibraryPatches();
      await syncRouteIds(authToken);
      process.env.auth_token = authToken;

      const client = await new Promise((resolve, reject) => {
        const instance = new Client();
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(`Twitter client init timed out on attempt ${attempt}.`));
        }, 30000);

        const onReady = () => {
          cleanup();
          resolve(instance);
        };

        const onError = (err) => {
          cleanup();
          reject(err);
        };

        // The bundled library can reject internally without emitting `error`.
        const onUnhandledRejection = (reason) => {
          cleanup();
          reject(reason instanceof Error ? reason : new Error(String(reason)));
        };

        function cleanup() {
          clearTimeout(timeout);
          instance.off('ready', onReady);
          instance.off('error', onError);
          process.off('unhandledRejection', onUnhandledRejection);
        }

        instance.once('ready', onReady);
        instance.once('error', onError);
        process.once('unhandledRejection', onUnhandledRejection);
      });

      return client;
    } catch (err) {
      lastError = err;
      error(`Twitter init attempt ${attempt}/${maxAttempts} failed:`, err.message);
      _client = null;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }

  throw lastError || new Error('Twitter initialization failed.');
}

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

  _client = await createClientWithRetry(authToken);
  log('Twitter Selfbot logged in.');
  return _client;
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
    await syncRouteIds(config.TWITTER_AUTH_TOKEN);
    const timeline = await withRouteRefresh('Twitter search route refresh', () =>
      withRetry('Twitter search', () =>
        client.timelines.fetch({
          type: 'search',
          query,
          product: 'Latest',
          querySource: 'typed_query'
        })
      )
    );
    return timeline.tweets.cache.map(normalizeTweet);
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
    const profile = await withRetry(`Twitter profile fetch @${username}`, () => client.profiles.fetch({ username }));
    const rawProfile = await withRetry(`Twitter raw profile fetch @${username}`, () =>
      client.rest.get(profile.url).then((res) => res.data)
    );
    return extractProfile(rawProfile, username);
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
      if (!['posts', 'media', 'replies'].includes(type)) {
        throw new Error(`Profile timelines only support posts, media, or replies. Received: ${type}`);
      }
      await syncRouteIds(config.TWITTER_AUTH_TOKEN);
      timeline = await withRouteRefresh(`Twitter timeline route refresh ${type} @${username}`, () =>
        withRetry(`Twitter timeline ${type} @${username}`, () => client.timelines.fetch({ type, username }))
      );
    } else {
      if (!['home', 'following'].includes(type)) {
        throw new Error(`Global timelines only support home or following. Received: ${type}`);
      }
      timeline = await withRetry(`Twitter timeline ${type}`, () => client.timelines.fetch({ type }));
    }

    return timeline.tweets.cache.map(normalizeTweet);
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
      const response = await withRetry('Twitter post tweet', () => client.tweets.create(text));

      if (response.errors) {
        throw new Error(response.errors.map((entry) => entry.message).join(', '));
      }

      const tweetId = response.data?.create_tweet?.tweet_results?.result?.rest_id;
      if (tweetId) {
        return `Tweet posted. ID: ${tweetId}`;
      }

      log('Tweet might have been posted (no ID in response):', JSON.stringify(response));
      return 'Tweet posted successfully.';
    }

    throw new Error('Tweet creation not supported by this version of the library.');
  } catch (err) {
    error(`Failed to post tweet: ${err.message}`);
    throw err;
  }
}

module.exports = { init, getClient, searchTweets, getProfile, getTimeline, postTweet };
