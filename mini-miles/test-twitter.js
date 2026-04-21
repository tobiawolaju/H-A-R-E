const twitter = require('./tools/twitter');
const config = require('./config');

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

    /*
    await runStep('Testing Post Tweet', async () => {
      const result = await twitter.postTweet(`Test tweet from mini-miles ${Date.now()}`);
      console.log('Post tweet success:', result);
    });
    */

    process.exit(0);
  } catch (err) {
    console.error('Twitter test setup failed:', err.message);
    process.exit(1);
  }
}

test();
