/**
 * skills/file-manager.js
 * Exposes file read/write/generate-csv capabilities to the LLM agent.
 */

const fp = require('../tools/file-parser');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: 'file_manager',
    description: 'Read, write, list, or generate CSV/JSON/TXT files from disk. Use this to: load a CSV of contacts for DM campaigns, save research results to a file, generate a CSV after researching who to contact. Files are stored in .mini-miles/data/.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'list', 'generate_csv'],
          description: 'Action to perform on the file system'
        },
        filename: {
          type: 'string',
          description: 'File name including extension (e.g. contacts.csv, output.json)'
        },
        data: {
          type: 'string',
          description: 'For write/generate_csv: JSON string of data to write. For CSV: array of objects e.g. [{name:"Alice", discord:"alice123"}]'
        }
      },
      required: ['action']
    }
  },

  execute: async (args) => {
    const { action, filename, data } = args;
    skill(`File Manager: ${action} ${filename || ''}`);

    try {
      switch (action) {
        case 'read': {
          const result = await fp.readFile(filename);
          return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        }
        case 'write': {
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          return await fp.writeFile(filename, parsed);
        }
        case 'list': {
          const files = await fp.listFiles();
          return files.length > 0 ? `Files in data dir:\n${files.join('\n')}` : 'No files found.';
        }
        case 'generate_csv': {
          const rows = typeof data === 'string' ? JSON.parse(data) : data;
          if (!Array.isArray(rows)) return 'Error: data must be a JSON array of objects';
          return await fp.generateCSV(filename || 'output', rows);
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `File Manager Error: ${err.message}`;
    }
  }
};
