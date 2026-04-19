const director = require('../tools/video-director');
const { log, error } = require('../utils/logger');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

module.exports = {
  name: 'video_ops',
  description: 'Tools for generating explainer videos, motion graphics, and research summaries. ALWAYS use this instead of web searching if the user asks to "make a video" or "render a script".',
  actions: [
    {
      name: 'generate_script',
      description: 'Convert research notes or a topic into a structured video script JSON.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The main subject of the video' },
          research_notes: { type: 'string', description: 'Raw facts or notes to include' },
          theme: { 
            type: 'string', 
            enum: ['HackerNeon', 'MinimalPro', 'Blueprint'],
            description: 'Visual aesthetic preset'
          },
          target_duration: { type: 'number', description: 'Target length in seconds (default 15)' }
        },
        required: ['topic', 'research_notes']
      },
      run: async (args) => {
        // This is a "Thought Transition" action. 
        // The LLM will use its own reasoning to format the script based on this schema.
        return {
          status: 'success',
          message: 'Please format the research into a JSON array of scenes: [{ text, duration, preset }].'
        };
      }
    },
    {
      name: 'render_video',
      description: 'Render an MP4 video from a Motion Graphics JSON script. Resolution: 720x720 (Square).',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Output filename (e.g. project_x.mp4)' },
          bgMusic: { type: 'string', description: 'Optional URL or Path to background music' },
          scenes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Main overlay text' },
                duration: { type: 'number', description: 'Duration in seconds (default 3)' },
                bgColor: { type: 'string', description: 'Hex color (e.g. 0x222222)' },
                preset: { type: 'string', enum: ['HackerNeon', 'MinimalPro', 'Blueprint'] },
                images: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      url: { type: 'string', description: 'Image URL' },
                      x: { type: 'number', description: 'X position (0-720)' },
                      y: { type: 'number', description: 'Y position (0-720)' },
                      w: { type: 'number', description: 'Image width' },
                      anim: { type: 'string', enum: ['slide_in', 'fade_in'] }
                    }
                  }
                },
                shapes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['rect'] },
                      color: { type: 'string', description: 'Shape color' },
                      x: { type: 'number' },
                      y: { type: 'number' },
                      w: { type: 'number' },
                      h: { type: 'number' },
                      anim: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        },
        required: ['scenes']
      },
      run: async (args, { userId }) => {
        try {
          const outputPath = await director.render(args, args.filename);
          return {
            status: 'success',
            message: `✅ Video rendered successfully: ${path.basename(outputPath)}`,
            file_path: outputPath
          };
        } catch (err) {
          return { status: 'error', message: err.message };
        }
      }
    }
  ]
};
