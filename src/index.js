const discord = require('./gateways/discord');
const telegram = require('./gateways/telegram');
const twitter = require('./gateways/twitter');
const heartbeat = require('./core/heartbeat');
const { log, error } = require('./utils/logger');

async function main() {
  log('🚀 Starting HARE...');

  try {
    // 1. Initialize Gateways
    log('Connecting to Gateways...');
    await discord.connect();
    await telegram.connect();
    await twitter.connect();

    // 2. Start Heartbeat
    heartbeat.start([discord, telegram, twitter]);

    log('✅ HARE is online and running.');
    
    // Simple process error handling
    process.on('uncaughtException', (err) => {
      error('Uncaught Exception:', err.message);
    });
    
    process.on('unhandledRejection', (reason) => {
      error('Unhandled Rejection:', reason);
    });

  } catch (err) {
    error('Startup Failure:', err.message);
    process.exit(1);
  }
}

main();
