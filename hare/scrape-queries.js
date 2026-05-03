const axios = require('axios');

async function run() {
  try {
    const res = await axios.get('https://twitter.com', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    const html = res.data;
    
    // Find all script tags like src="https://abs.twimg.com/responsive-web/client-web/main...js"
    const regex = /src="([^"]+)"/g;
    let match;
    let scripts = [];
    while ((match = regex.exec(html)) !== null) {
      if (match[1].includes('responsive-web/client-web/')) {
        scripts.push(match[1]);
      }
    }
    
    console.log(`Found ${scripts.length} script urls.`);
    
    for (const url of scripts) {
      try {
        const jsRes = await axios.get(url);
        const js = jsRes.data;
        if (js.includes('CreateTweet') || js.includes('UserByScreenName')) {
          console.log(`\n--- Matches in ${url} ---`);
          const regexOp = /queryId:"([^"]+)",operationName:"([^"]+)"/g;
          let m;
          while ((m = regexOp.exec(js)) !== null) {
            if (m[2] === 'CreateTweet' || m[2] === 'UserByScreenName') {
              console.log(`Found ${m[2]}: queryId = ${m[1]}`);
            }
          }
        }
      } catch (e) {
        console.error(`Failed to fetch ${url}`);
      }
    }
  } catch(e) {
    console.error('Failed to fetch twitter.com', e.message);
  }
}
run();
