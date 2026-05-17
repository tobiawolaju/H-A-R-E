const { execFile } = require('child_process');
const path = require('path');

function runSkillsCli(args, options = {}) {
  return new Promise((resolve) => {
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = execFile(
      npxCmd,
      ['skills', ...args],
      {
        cwd: options.cwd || path.resolve(__dirname, '..', '..'),
        env: {
          ...process.env,
          ...(options.env || {})
        },
        windowsHide: true,
        timeout: options.timeoutMs || 120000,
        maxBuffer: 1024 * 1024 * 8
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error?.code ?? 0,
          stdout: (stdout || '').toString().trim(),
          stderr: (stderr || '').toString().trim(),
          error: error ? error.message : null
        });
      }
    );

    if (options.input) {
      child.stdin.end(options.input);
    }
  });
}

function formatResult(result) {
  const parts = [];
  if (result.stdout) parts.push(result.stdout);
  if (result.stderr) parts.push(`stderr:\n${result.stderr}`);
  if (result.error && !result.stderr) parts.push(`error: ${result.error}`);
  return parts.join('\n\n') || 'No output.';
}

async function findSkills(query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return 'Usage: provide a search query, for example: `react testing`';

  let result = await runSkillsCli(['find', trimmed]);
  if (!result.ok) {
    const fallback = await runSkillsCli(['search', trimmed]);
    if (fallback.ok || fallback.stdout || fallback.stderr) {
      result = fallback;
    }
  }
  return formatResult(result);
}

async function listSkills(target = '') {
  const trimmed = String(target || '').trim();
  const args = trimmed ? ['list', trimmed] : ['list'];
  const result = await runSkillsCli(args);
  return formatResult(result);
}

async function installSkill({ source, skill }) {
  const target = String(source || '').trim();
  const skillName = String(skill || '').trim();
  if (!target) return 'Usage: provide a package or repository, for example: `vercel-labs/agent-skills`';

  const args = ['add', target];
  if (skillName) {
    args.push('--skill', skillName);
  }
  args.push('-g', '-y');

  const result = await runSkillsCli(args);
  return formatResult(result);
}

async function removeSkill(target) {
  const trimmed = String(target || '').trim();
  if (!trimmed) return 'Usage: provide a skill or package name to remove.';

  const result = await runSkillsCli(['remove', trimmed, '-g', '-y']);
  return formatResult(result);
}

async function checkSkills() {
  const result = await runSkillsCli(['check']);
  return formatResult(result);
}

async function updateSkills() {
  const result = await runSkillsCli(['update']);
  return formatResult(result);
}

module.exports = {
  runSkillsCli,
  findSkills,
  listSkills,
  installSkill,
  removeSkill,
  checkSkills,
  updateSkills
};
