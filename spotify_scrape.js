const https = require('https');
https.get('https://open.spotify.com/track/64r28qX8JpWv7r5OaT53bH', (res) => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
        const m = d.match(/<meta property="og:image" content="(.*?)"/);
        console.log("Spotify Cover:", m ? m[1] : 'Not found');
    });
});
