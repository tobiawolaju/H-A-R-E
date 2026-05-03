const director = require('../tools/video-director');
const { log, error, skill } = require('../utils/logger');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  definition: {
    name: 'video_ops',
    description: 'Tools for generating explainer videos, motion graphics, and research summaries. Use this to generate video scripts from research or render final MP4 videos.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['generate_script', 'render_video'],
          description: 'Video action to perform'
        },
        topic: { type: 'string', description: 'The main subject of the video' },
        research_notes: { type: 'string', description: 'Raw facts or notes to include' },
        theme: { 
          type: 'string', 
          enum: ['HackerNeon', 'MinimalPro', 'Blueprint'],
          description: 'Visual aesthetic preset'
        },
        filename: { type: 'string', description: 'Output filename (e.g. project_x.mp4)' },
        scenes: {
          type: 'array',
          description: 'Scenes for the video (used for render_video)',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              duration: { type: 'number' },
              preset: { type: 'string', enum: ['HackerNeon', 'MinimalPro', 'Blueprint'] }
            }
          }
        }
      },
      required: ['action']
    }
  },

  execute: async (args, context) => {
    const { action, topic, research_notes, theme, filename, scenes } = args;
    skill(`Video Ops: ${action}`);

    try {
      switch (action) {
        case 'generate_script': {
          // This returns a format hint for the LLM
          return JSON.stringify({
            status: 'success',
            message: 'Please format the research into a JSON array of scenes: [{ text, duration, preset }].',
            hint: 'Use the render_video action next with the generated scenes.'
          });
        }
        case 'render_video': {
          const outputPath = await director.render({ scenes, filename }, filename);
          return JSON.stringify({
            status: 'success',
            message: `✅ Video rendered successfully: ${path.basename(outputPath)}`,
            file_path: outputPath
          });
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Video Ops Error: ${err.message}`;
    }
  }
};
