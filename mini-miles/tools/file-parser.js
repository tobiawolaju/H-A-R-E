/**
 * file-parser.js
 * Read/write CSV, JSON, TXT files. Central tool for data-driven campaigns.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

const DATA_DIR = path.resolve('./.mini-miles/data');

// Ensure data directory exists
if (!fsSync.existsSync(DATA_DIR)) {
  fsSync.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Parse a CSV string into an array of objects using the header row as keys.
 */
function parseCSV(raw) {
  const lines = raw.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || '']));
  });
}

/**
 * Serialize an array of objects to a CSV string.
 */
function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = rows.map(row =>
    headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

/**
 * Read a file. Supports CSV, JSON, TXT.
 */
async function readFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fsSync.existsSync(filePath)) {
    throw new Error(`File not found: ${filename}. Available files: ${fsSync.readdirSync(DATA_DIR).join(', ') || 'none'}`);
  }
  const raw = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.json') return JSON.parse(raw);
  if (ext === '.csv') return parseCSV(raw);
  return raw; // txt or other
}

/**
 * Write data to a file. Supports CSV, JSON, TXT.
 */
async function writeFile(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const ext = path.extname(filename).toLowerCase();
  let content;
  if (ext === '.csv') {
    content = Array.isArray(data) ? toCSV(data) : data;
  } else if (ext === '.json') {
    content = JSON.stringify(data, null, 2);
  } else {
    content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  }
  await fs.writeFile(filePath, content, 'utf8');
  return `Written ${content.length} bytes to ${filename}`;
}

/**
 * List all files in the data directory.
 */
async function listFiles() {
  const files = await fs.readdir(DATA_DIR);
  return files;
}

/**
 * Generate a CSV from an array of record objects.
 * e.g. [{name: 'Alice', discord: 'alice#1234'}, ...]
 */
async function generateCSV(filename, rows) {
  return writeFile(filename.endsWith('.csv') ? filename : filename + '.csv', rows);
}

module.exports = { readFile, writeFile, listFiles, generateCSV, parseCSV, toCSV };
