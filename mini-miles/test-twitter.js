const { Client } = require('./libs/twitter-selfbot/dist');
const config = require('./config');

async function test() {
  if (!config.TWITTER_AUTH_TOKEN) {
    console.error('Missing TWITTER_AUTH_TOKEN in config');
    process.exit(1);
  }

  process.env.auth_token = config.TWITTER_AUTH_TOKEN;
  const client = new Client();
  
  client.on('ready', async () => {
    console.log('✅ Twitter Selfbot logged in.');
    
    try {
        console.log('--- Testing Profile Fetch (@elonmusk) ---');
        const profile = await client.profiles.fetch({ username: 'elonmusk' });
        console.log('✅ Profile fetch success:', profile.name);
    } catch(err) {
        console.error('❌ Profile fetch failed:', err.message);
        if (err.response?.data) console.error('Data:', err.response.data);
    }
    
    try {
        console.log('\n--- Testing Post Tweet ---');
        const res = await client.tweets.create('Test tweet from mini-miles! ' + Date.now());
        console.log('✅ Post tweet success:', JSON.stringify(res).substring(0, 200) + '...');
    } catch(err) {
        console.error('❌ Post tweet failed:', err.message);
        if (err.response?.data) console.error('Data:', err.response.data);
    }

    process.exit(0);
  });

  client.on('error', (err) => {
    console.error('Client Error:', err.message);
    process.exit(1);
  });
}

test();
