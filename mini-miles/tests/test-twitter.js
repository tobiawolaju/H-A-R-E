const twitter = require('../tools/twitter');
const config = require('../config');

async function runStep(title, fn) {
  try {
    console.log(`\n--- ${title} ---`);
    await fn();
  } catch (err) {
    console.error(`${title} failed:`, err.message);
  }
}

async function test() {
  if (!config.TWITTER_AUTH_TOKEN) {
    console.error('Missing TWITTER_AUTH_TOKEN in config');
    process.exit(1);
  }

  const tweetLink = 'https://x.com/tobiawolaju/status/2046026636420628929';

  try {
    await twitter.init();
    console.log('Twitter toolchain initialized.');

    await runStep('Testing Search Tweets ("I follow back")', async () => {
      const results = await twitter.searchTweets('I follow back');
      console.log('Search success. Result count:', results.length);
      console.log('First result:', results[0] || 'No results');
    });

    await runStep('Testing Profile Fetch (@tobiawolaju)', async () => {
      const profile = await twitter.getProfile('tobiawolaju');
      console.log('Profile fetch success:', profile);
    });

    await runStep('Testing Timeline Fetch (@tobiawolaju, posts)', async () => {
      const timeline = await twitter.getTimeline('posts', 'tobiawolaju');
      console.log('Timeline fetch success. Result count:', timeline.length);
      console.log('First item:', timeline[0] || 'No timeline items');
    });

    await runStep('Testing Timeline Fetch (@tobiawolaju, media)', async () => {
      const timeline = await twitter.getTimeline('media', 'tobiawolaju');
      console.log('Timeline fetch success. Result count:', timeline.length);
      console.log('First item:', timeline[0] || 'No timeline items');
    });

    await runStep('Testing Timeline Fetch (@tobiawolaju, replies)', async () => {
      const timeline = await twitter.getTimeline('replies', 'tobiawolaju');
      console.log('Timeline fetch success. Result count:', timeline.length);
      console.log('First item:', timeline[0] || 'No timeline items');
    });

    await runStep('Testing Like Tweet (tweet link)', async () => {
      const result = await twitter.likeTweet(tweetLink);
      console.log('Like success:', result);
    });

    await runStep('Testing Unlike Tweet (tweet link)', async () => {
      const result = await twitter.unlikeTweet(tweetLink);
      console.log('Unlike success:', result);
    });

    await runStep('Testing Retweet Tweet (tweet link)', async () => {
      const result = await twitter.retweet(tweetLink);
      console.log('Retweet success:', result);
    });

    await runStep('Testing Unretweet Tweet (tweet link)', async () => {
      const result = await twitter.unretweet(tweetLink);
      console.log('Unretweet success:', result);
    });

    await runStep('Testing Reply Tweet (tweet link)', async () => {
      const result = await twitter.replyToTweet(tweetLink, `Test reply from mini-miles (${new Date().toISOString()})`);
      console.log('Reply success:', result);
    });

    await runStep('Testing Quote Tweet (tweet link)', async () => {
      const result = await twitter.quoteTweet(tweetLink, `Test quote from mini-miles (${new Date().toISOString()})`);
      console.log('Quote success:', result);
    });

    // Keep this commented unless you want to post a standalone tweet during smoke tests.
    // await runStep('Testing Post Tweet', async () => {
    //   const result = await twitter.postTweet(`Gmonad to those that gm back`);
    //   console.log('Post tweet success:', result);
    // });


    process.exit(0);
  } catch (err) {
    console.error('Twitter test setup failed:', err.message);
    process.exit(1);
  }
}

test();
