const debug = require('debug');

const base = debug('mini-miles');
const core = debug('mini-miles:core');
const gateway = debug('mini-miles:gateway');
const skill = debug('mini-miles:skill');
const error = debug('mini-miles:error');

// Log to console if DEBUG is not set
if (!process.env.DEBUG) {
  debug.enable('mini-miles*');
}

module.exports = {
  log: base,
  core,
  gateway,
  skill,
  error
};
