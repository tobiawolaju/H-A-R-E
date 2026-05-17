const { Octokit } = require("@octokit/rest");
const config = require('../config');

// Re-use the existing token check logic but simplified
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function getFileContent(owner, repo, path, branch = "main") {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if (Array.isArray(data)) return "Error: Path is a directory.";
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

function buildCommitMessage({ repo, files, action, stack }) {
  const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const firstFile = normalizedFiles[0]?.path || '';
  const firstName = firstFile.split(/[\\/]/).pop() || 'files';
  const lowerPath = String(firstFile || '').toLowerCase();
  const allReadmes = normalizedFiles.length > 0 && normalizedFiles.every((file) => String(file.path || '').toLowerCase().endsWith('readme.md'));
  const isTestFile = /(^|[\\/])(?:tests?|specs?)([\\/]|$)/.test(lowerPath) || /\.(test|spec)\.[^/\\]+$/.test(lowerPath);
  const isDocFile = /\.(md|txt|rst)$/i.test(firstName) || lowerPath.endsWith('readme.md');
  const isConfigFile = /\.(json|lock|ya?ml|toml|ini|env|cfg|conf)$/i.test(firstName) || /(^|[\\/])(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|composer\.json)$/i.test(lowerPath);
  const isSourceFile = /\.(js|jsx|ts|tsx|py|go|rb|java|cs|php|rs|c|cc|cpp|h|hpp|kt|swift|dart|mjs|cjs)$/i.test(firstName);

  if (action === 'generate_project') {
    return stack ? `chore: scaffold ${stack} project` : `chore: scaffold ${repo} project`;
  }

  if (action === 'update_readme' || action === 'generate_readme' || allReadmes) {
    return 'docs: update README';
  }

  if (isDocFile) {
    return `docs: update ${firstName}`;
  }

  if (isTestFile) {
    return `test: update ${firstName}`;
  }

  if (isConfigFile) {
    return `chore: update ${firstName}`;
  }

  if (isSourceFile) {
    return `feat: update ${firstName}`;
  }

  return `chore: update ${firstName}`;
}

async function editFiles(owner, repo, branch, files, commitMessageOrOptions = {}) {
  try {
    const options = typeof commitMessageOrOptions === 'string'
      ? { commitMessage: commitMessageOrOptions }
      : (commitMessageOrOptions || {});

    for (const file of files) {
      const commitMessage = options.commitMessage || buildCommitMessage({
        repo,
        files: [file],
        action: options.action,
        stack: options.stack
      });
      let sha;
      try {
        const { data } = await octokit.repos.getContent({ owner, repo, path: file.path, ref: branch });
        sha = data.sha;
      } catch (err) {
        if (err.status !== 404) throw err;
      }

      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: file.path,
        message: commitMessage,
        content: Buffer.from(file.content).toString("base64"),
        sha,
        branch
      });
    }
    return `Successfully updated ${files.length} files.`;
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function createRepo(name, description = "New repo", isPrivate = false) {
  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name,
      description,
      private: isPrivate,
      auto_init: true
    });
    return `✅ Created: ${data.html_url}`;
  } catch (err) {
    // 422 = repo already exists
    if (err.status === 422) {
      const { data: user } = await octokit.users.getAuthenticated();
      return `ℹ️ Repo already exists: https://github.com/${user.login}/${name}`;
    }
    return `Error: ${err.message}`;
  }
}

async function listUserRepos(username) {
  try {
    const { data } = await octokit.repos.listForUser({
      username,
      sort: "updated",
      per_page: 50
    });
    return data.map(r => ({ name: r.name, url: r.html_url }));
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function getAuthenticatedUsername() {
  try {
    const { data } = await octokit.users.getAuthenticated();
    return data.login;
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

module.exports = {
  getFileContent,
  editFiles,
  buildCommitMessage,
  createRepo,
  listUserRepos,
  getAuthenticatedUsername
};
