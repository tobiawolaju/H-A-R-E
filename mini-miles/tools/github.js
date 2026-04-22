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

async function editFiles(owner, repo, branch, files, commitMessage = "Mini-Miles Update") {
  try {
    for (const file of files) {
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
  createRepo,
  listUserRepos,
  getAuthenticatedUsername
};
