const debug = require('debug');

const base = debug('hare');
const core = debug('hare:core');
const gateway = debug('hare:gateway');
const skill = debug('hare:skill');
const error = debug('hare:error');

// Log to console if DEBUG is not set
if (!process.env.DEBUG) {
  debug.enable('hare*');
}

module.exports = {
  log: base,
  core,
  gateway,
  skill,
  error
};
