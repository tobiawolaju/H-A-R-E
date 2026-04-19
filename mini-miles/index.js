const discord = require('./gateways/discord');
const telegram = require('./gateways/telegram'); // 1
const heartbeat = require('./core/heartbeat');
const { log, error } = require('./utils/logger');

async function main() {
  log('🚀 Starting Mini-Miles...');

  try {
    // 1. Initialize Gateways
    log('Connecting to Gateways...');
    await Promise.all([
      discord.connect(),
      telegram.connect()
    ]);

    // 2. Start Heartbeat
    heartbeat.start([discord, telegram]);

    log('✅ Mini-Miles is online and running.');
    
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
