const director = require('./video-director');
const { log, error } = require('../utils/logger');
const path = require('path');

async function testMotionGraphics() {
  log('🎬 Starting Motion Graphics v2 Test...');

  const script = {
    bgMusic: 'C:\\Users\\tobia\\Desktop\\projects\\tobi\\mini-miles\\public\\audio.mp3',
    segments: [
      {
        text: 'Miles Motion v2',
        duration: 3,
        bgColor: '0x0a0a0f',
        shapes: [
          { type: 'rect', color: 'blue', x: 't*100', y: 550, w: 720, h: 50 }
        ]
      },
      {
        text: 'Picture Overlays',
        duration: 3,
        bgColor: '0x102a43',
        images: [
          { 
            url: 'C:\\Users\\tobia\\Desktop\\projects\\tobi\\mini-miles\\public\\image.webp', 
            x: 160, 
            y: 100, 
            w: 400, 
            anim: 'slide_in' 
          }
        ]
      },
      {
        text: '1:1 Square Format',
        duration: 3,
        bgColor: '0x222222',
        shapes: [
          { type: 'rect', color: 'red', x: 0, y: 0, w: 720, h: 20 }
        ]
      }
    ]
  };

  try {
    const outputPath = await director.render(script, 'motion_test_v2.mp4');
    log(`✅ Motion Graphics Test Successful! Video saved to: ${outputPath}`);
    process.exit(0);
  } catch (err) {
    error('❌ Motion Graphics Test Failed:', err);
    process.exit(1);
  }
}

testMotionGraphics();
