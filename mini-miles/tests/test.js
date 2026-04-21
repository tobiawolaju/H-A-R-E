const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');

const fileParser = require('../tools/file-parser');
const scraper = require('../tools/scraper');
const github = require('../tools/github');
const scheduler = require('../tools/scheduler');
const telegram = require('../tools/telegram-actions');
const discordActions = require('../tools/discord-actions');
const discordGateway = require('../gateways/discord');
const twitter = require('../tools/twitter');
const { EventEmitter } = require('events');

const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, '.mini-miles', 'data');
const tasksFile = path.join(rootDir, '.mini-miles', 'scheduled_tasks.json');
const outputDir = path.join(rootDir, 'output');

const results = [];

function createCollection(items) {
  const list = [...items];
  return {
    map: (fn) => list.map(fn),
    filter: (fn) => createCollection(list.filter(fn)),
    get size() {
      return list.length;
    },
    [Symbol.iterator]: function* () {
      yield* list;
    }
  };
}

async function backupFile(filePath) {
  if (!fsSync.existsSync(filePath)) {
    return null;
  }

  const backupPath = `${filePath}.smoke-backup-${Date.now()}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

async function restoreFile(filePath, backupPath) {
  if (!backupPath) {
    await fs.rm(filePath, { force: true });
    return;
  }

  await fs.copyFile(backupPath, filePath);
  await fs.rm(backupPath, { force: true });
}

async function cleanupFile(filePath) {
  await fs.rm(filePath, { force: true });
}

async function runStep(name, fn, { optional = false } = {}) {
  const startedAt = Date.now();

  try {
    const result = await fn();
    const elapsed = Date.now() - startedAt;
    results.push({ name, status: 'PASS', elapsed });
    console.log(`PASS  ${name} (${elapsed}ms)`);
    return result;
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    const status = optional ? 'SKIP' : 'FAIL';
    results.push({ name, status, elapsed, error: err.message });
    console.log(`${status}  ${name} (${elapsed}ms) - ${err.message}`);
    if (!optional) {
      throw err;
    }
    return null;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testFileParser() {
  const filename = `smoke-${Date.now()}.json`;
  const filePath = path.join(dataDir, filename);
  const rows = [
    { name: 'Alice', discord: 'alice123' },
    { name: 'Bob', discord: 'bob456' }
  ];

  try {
    const csv = fileParser.toCSV(rows);
    assert(csv.includes('name,discord'), 'CSV header missing');
    const parsed = fileParser.parseCSV(csv);
    assert(parsed.length === 2, 'CSV roundtrip failed');

    const writeResult = await fileParser.writeFile(filename, rows);
    assert(writeResult.includes(filename), 'writeFile did not mention output file');

    const readResult = await fileParser.readFile(filename);
    assert(Array.isArray(readResult) && readResult.length === 2, 'readFile roundtrip failed');

    const files = await fileParser.listFiles();
    assert(files.includes(filename), 'listFiles did not include the written file');
  } finally {
    await cleanupFile(filePath);
  }
}

async function testScraper() {
  const result = await scraper.scrape('https://example.com');
  assert(typeof result === 'string', 'scrape did not return text');
  assert(result.length > 0 || result.startsWith('Scrape Error:'), 'scrape returned an unexpected value');
}

async function testGitHub() {
  const username = process.env.GITHUB_USERNAME || process.env.GITHUB_ACTOR || 'tobiawolaju';
  const repos = await github.listUserRepos(username);
  assert(Array.isArray(repos) || typeof repos === 'string', 'listUserRepos returned an unexpected value');
}

async function testScheduler() {
  const backupPath = await backupFile(tasksFile);
  try {
    const before = scheduler.listTasks();
    assert(typeof before === 'string', 'listTasks should return a string');

    const scheduled = await scheduler.scheduleIn('smoke-task', 1, { action: 'noop' });
    assert(scheduled.includes('smoke-task'), 'scheduleIn did not acknowledge the task');

    const afterSchedule = scheduler.listTasks();
    assert(afterSchedule.includes('smoke-task'), 'scheduled task was not listed');

    const cancelled = await scheduler.cancelAll();
    assert(typeof cancelled === 'string', 'cancelAll should return a string');
  } finally {
    await restoreFile(tasksFile, backupPath);
  }
}

async function testTelegram() {
  const fakeClient = {
    async getEntity(input) {
      return {
        id: { toString: () => '42' },
        username: String(input).replace(/^@/, ''),
        firstName: 'Test',
        lastName: 'User',
        phone: '12345'
      };
    },
    async sendMessage() {
      return undefined;
    },
    async getMessages() {
      return [
        {
          id: 1,
          senderId: { toString: () => '7' },
          message: 'hello',
          date: Math.floor(Date.now() / 1000)
        }
      ];
    }
  };

  telegram.setClient(fakeClient);

  const dmResult = await telegram.sendDM('tester', 'hello');
  assert(dmResult.includes('DM sent') || dmResult.includes('Failed to DM'), 'sendDM returned an unexpected value');

  const chat = await telegram.readChat('some-chat', 5);
  assert(Array.isArray(chat) && chat.length === 1, 'readChat did not return messages');

  const info = await telegram.getUserInfo('tester');
  assert(info.username === 'tester', 'getUserInfo did not return the expected username');

  const bulk = await telegram.bulkDM([{ name: 'Alice', username: 'alice' }], 'Hello {name}');
  assert(Array.isArray(bulk) && bulk.length === 1, 'bulkDM did not return results');
}

async function testDiscord() {
  const messages = createCollection([
    {
      author: { username: 'alpha' },
      content: 'hello world',
      createdAt: new Date(),
      id: '1'
    },
    {
      author: { username: 'beta' },
      content: 'another message',
      createdAt: new Date(),
      id: '2'
    }
  ]);

  const guildMembers = createCollection([
    {
      user: { id: '10', username: 'alpha' },
      nickname: 'Al',
      joinedAt: new Date('2024-01-01T00:00:00Z')
    },
    {
      user: { id: '11', username: 'beta' },
      nickname: null,
      joinedAt: new Date('2024-01-02T00:00:00Z')
    }
  ]);

  discordGateway.client = {
    channels: {
      async fetch() {
        return {
          messages: {
            async fetch() {
              return messages;
            }
          }
        };
      }
    },
    users: {
      async fetch() {
        return {
          username: 'alpha',
          async createDM() {
            return {
              async send() {
                return undefined;
              }
            };
          }
        };
      }
    },
    guilds: {
      async fetch() {
        return {
          members: {
            async fetch() {
              return guildMembers;
            },
            cache: guildMembers
          }
        };
      }
    }
  };

  const channelMessages = await discordActions.readChannel('123', 5);
  assert(Array.isArray(channelMessages) && channelMessages.length === 2, 'readChannel did not return messages');

  const summary = await discordActions.analyzeChannel('123', 5);
  assert(summary.totalMessages === 2, 'analyzeChannel returned the wrong count');

  const dmResult = await discordActions.sendDM('123', 'hello');
  assert(dmResult.includes('DM sent') || dmResult.includes('Failed to DM'), 'sendDM returned an unexpected value');

  const bulk = await discordActions.bulkDM([{ username: 'alpha', name: 'Alpha' }], 'Hello {name}');
  assert(Array.isArray(bulk) && bulk.length === 1, 'bulkDM did not return results');

  const users = await discordActions.findUser('guild-1', 'alp');
  assert(Array.isArray(users) && users.length === 1, 'findUser did not return expected results');
}

async function testTwitter() {
  const tweetId = twitter.extractTweetId('https://x.com/tobiawolaju/status/1234567890');
  assert(tweetId === '1234567890', 'extractTweetId failed');

  const authToken = process.env.TWITTER_AUTH_TOKEN;
  if (!authToken) {
    throw new Error('Set TWITTER_AUTH_TOKEN to run live Twitter smoke tests.');
  }

  await twitter.init();

  const username = process.env.TWITTER_MASTER_USERNAME || 'tobiawolaju';
  const profile = await twitter.getProfile(username);
  assert(profile && profile.username, 'getProfile did not return a profile');

  const timeline = await twitter.getTimeline('posts', username);
  assert(Array.isArray(timeline), 'getTimeline did not return an array');

  const home = await twitter.getTimeline('home');
  assert(Array.isArray(home), 'home timeline did not return an array');
}

async function testVideoDirector() {
  if (process.env.RUN_VIDEO_SMOKE === '0') {
    throw new Error('Set RUN_VIDEO_SMOKE=1 to run the video render smoke test.');
  }

  await fs.mkdir(outputDir, { recursive: true });
  const outputName = `smoke-video-${Date.now()}.mp4`;
  const outputPath = path.join(outputDir, outputName);
  const childProcess = require('child_process');
  const originalSpawn = childProcess.spawn;
  delete require.cache[require.resolve('../tools/video-director')];

  try {
    childProcess.spawn = (command, args) => {
      const outputTarget = args[args.length - 1];
      fsSync.writeFileSync(outputTarget, 'smoke-video');

      const proc = new EventEmitter();
      proc.stderr = new EventEmitter();
      setImmediate(() => proc.emit('close', 0));
      return proc;
    };

    const videoDirector = require('../tools/video-director');
    const renderedPath = await videoDirector.render(
      {
        segments: [
          {
            text: 'Mini-Miles smoke test',
            duration: 1,
            bgColor: '0x102a43'
          }
        ]
      },
      outputName
    );

    assert(renderedPath === outputPath, 'render returned an unexpected path');
    const stats = await fs.stat(outputPath);
    assert(stats.size > 0, 'rendered video is empty');
  } finally {
    childProcess.spawn = originalSpawn;
    delete require.cache[require.resolve('../tools/video-director')];
    await cleanupFile(outputPath);
  }
}

async function main() {
  console.log('Mini-Miles tool smoke test');

  await runStep('file-parser', testFileParser);
  await runStep('scraper', testScraper);
  await runStep('github', testGitHub);
  await runStep('scheduler', testScheduler);
  await runStep('telegram-actions', testTelegram);
  await runStep('discord-actions', testDiscord);
  await runStep('twitter', testTwitter, { optional: true });
  await runStep('video-director', testVideoDirector, { optional: true });

  const passed = results.filter((result) => result.status === 'PASS').length;
  const skipped = results.filter((result) => result.status === 'SKIP').length;
  const failed = results.filter((result) => result.status === 'FAIL').length;

  console.log('');
  console.log(`Summary: ${passed} passed, ${skipped} skipped, ${failed} failed`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test runner failed:', err.message);
  process.exit(1);
});
