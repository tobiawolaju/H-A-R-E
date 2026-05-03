const ffbinaries = require('ffbinaries');
const path = require('path');
const fs = require('fs-extra');

const dest = path.join(__dirname, '../bin');
fs.ensureDirSync(dest);

console.log('🚀 Downloading FFmpeg and FFprobe binaries to:', dest);

let lastPercentage = -1;

ffbinaries.downloadBinaries(['ffmpeg', 'ffprobe'], { 
  destination: dest, 
  platform: 'windows-64',
  tickerFn: (data) => {
    const percentage = Math.round(data.progress * 100);
    if (percentage !== lastPercentage) {
      process.stdout.write(`\r📦 Rendering progress: ${percentage}%...`);
      lastPercentage = percentage;
    }
  }
}, (err, data) => {
  if (err) {
    console.error('\n❌ Download failed:', err);
    process.exit(1);
  }
  console.log('\n✅ Binaries downloaded successfully!');
  data.forEach(bin => {
    console.log(` - ${bin.filename} (${bin.status})`);
  });
  process.exit(0);
});
