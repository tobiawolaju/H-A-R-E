const director = require('./video-director');
const { log, error } = require('../utils/logger');

async function runTest() {
  const scenes = [
    { text: 'MILES MOTION ENGINE', duration: 3, preset: 'HackerNeon' },
    { text: 'Optimized for Low-End PC', duration: 3, preset: 'HackerNeon' },
    { text: 'Ready to Cook!', duration: 2, preset: 'HackerNeon' }
  ];

  log('🚀 Starting test render...');
  try {
    const path = await director.render(scenes, 'test_render.mp4');
    log(`✅ Test Render Successful! Video saved to: ${path}`);
    process.exit(0);
  } catch (err) {
    error('❌ Test Render Failed:', err);
    process.exit(1);
  }
}

runTest();
