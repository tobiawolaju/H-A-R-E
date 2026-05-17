const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const assetManager = require('../utils/asset-manager');
const { log, error } = require('../utils/logger');

// Set hard paths to the binaries we downloaded
const ffmpegPath = path.join(process.cwd(), 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(process.cwd(), 'bin', 'ffprobe.exe');

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const CACHE_DIR = path.join(process.cwd(), 'cache');
fs.ensureDirSync(OUTPUT_DIR);
fs.ensureDirSync(CACHE_DIR);

class VideoDirector {
  /**
   * Render a Motion Graphics video (v2.1)
   * @param {Object} script - { segments: [], bgMusic }
   */
  async render(script, filename = `hare_motion_${Date.now()}.mp4`) {
    const segments = script.segments || script;
    const bgMusic = script.bgMusic;
    const outputPath = path.join(OUTPUT_DIR, filename);
    
    log(`VideoDirector v2.1: Native render started...`);

    // 1. Prepare assets
    for (const seg of segments) {
      if (seg.images) {
        for (const img of seg.images) {
          img.localPath = await assetManager.get(img.url);
        }
      }
    }

    // 2. Render each segment natively
    const segmentPaths = [];
    for (let i = 0; i < segments.length; i++) {
      const segPath = path.join(CACHE_DIR, `seg_${i}.mp4`);
      await this._renderSegmentNative(segments[i], i, segPath);
      segmentPaths.push(segPath);
    }

    // 3. Concatenate and add music
    return new Promise(async (resolve, reject) => {
      const inputArgs = [];
      segmentPaths.forEach(p => {
        inputArgs.push('-i', p);
      });

      let localMusic = null;
      if (bgMusic) {
        localMusic = await assetManager.get(bgMusic);
        if (localMusic) {
          inputArgs.push('-stream_loop', '-1', '-i', localMusic);
        }
      }

      let filter = `concat=n=${segments.length}:v=1:a=0[v]`;
      let finalArgs = ['-filter_complex', filter, '-map', '[v]'];
      if (localMusic) {
        finalArgs.push('-map', `${segments.length}:a`); // The music input index is after all segments
      }

      const args = [
        ...inputArgs,
        ...finalArgs,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-y',
        outputPath
      ];

      log(`VideoDirector: Stitching ${segments.length} segments...`);
      const proc = spawn(ffmpegPath, args);
      proc.on('close', (code) => {
        if (code === 0) {
          log(`✅ VideoDirector: Render complete! -> ${outputPath}`);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg concat failed with code ${code}`));
        }
      });
    });
  }

  async _renderSegmentNative(seg, index, outputPath) {
    const duration = seg.duration || 3;
    const color = (seg.bgColor || this._getThemeColor(seg.preset)).replace('0x', '#');
    const inputArgs = [];
    let filter = `color=c='${color}':s=720x720:d=${duration}[bg]`;
    let lastLabel = 'bg';

    // Shapes
    if (seg.shapes) {
      seg.shapes.forEach((s, i) => {
        const boxLabel = `box${index}_${i}`;
        const nextLabel = `sh${index}_${i}`;
        const color = s.color.startsWith('0x') ? '#' + s.color.slice(2) : s.color;
        const x = this._parseAnim(s.x, s.anim, 'x');
        const y = this._parseAnim(s.y, s.anim, 'y');
        filter += `;color=c='${color}':s=${s.w}x${s.h}:d=${duration}[${boxLabel}]`;
        filter += `;[${lastLabel}][${boxLabel}]overlay=x='${x}':y='${y}'[${nextLabel}]`;
        lastLabel = nextLabel;
      });
    }

    // Images
    if (seg.images) {
      seg.images.forEach((img, i) => {
        if (!img.localPath) return;
        const inputIdx = inputArgs.length / 2;
        inputArgs.push('-i', img.localPath);
        const scaledLabel = `img${index}_${i}`;
        const nextLabel = `over${index}_${i}`;
        const x = this._parseAnim(img.x, img.anim, 'x');
        const y = this._parseAnim(img.y, img.anim, 'y');
        
        filter += `;[${inputIdx}:v]scale=${img.w}:-2[${scaledLabel}]`;
        filter += `;[${lastLabel}][${scaledLabel}]overlay=x='${x}':y='${y}'[${nextLabel}]`;
        lastLabel = nextLabel;
      });
    }

    // Text
    const escapedText = seg.text.replace(/'/g, "'\\\\''").replace(/:/g, '\\:');
    filter += `;[${lastLabel}]drawtext=text='${escapedText}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=(h-text_h)/2[out]`;

    const args = [
      ...inputArgs,
      '-filter_complex', filter,
      '-map', '[out]',
      '-t', duration,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-y',
      outputPath
    ];

    return new Promise((resolve, reject) => {
      log(`VideoDirector: Rendering segment ${index}...`);
      const proc = spawn(ffmpegPath, args);
      let errData = '';
      proc.stderr.on('data', (data) => errData += data);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else {
          log(`Segment ${index} Filter: ${filter}`);
          error(`Segment ${index} failed: ${errData}`);
          reject(new Error(`Segment ${index} failed with code ${code}`));
        }
      });
    });
  }

  _parseAnim(val, anim, axis) {
    if (!anim) return val;
    if (anim === 'slide_in') {
      return axis === 'x' ? `min(-w+(t*400),${val})` : val;
    }
    return val;
  }

  _getThemeColor(preset) {
    const themes = { 'HackerNeon': '0x0a0a0f', 'MinimalPro': '0x222222', 'Blueprint': '0x102a43' };
    return themes[preset] || themes['HackerNeon'];
  }
}

module.exports = new VideoDirector();
