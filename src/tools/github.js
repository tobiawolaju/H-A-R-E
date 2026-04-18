/**
 * github.js - Enhanced GitHub automation tool
 * -------------------------------------------
 */

const { Octokit } = require("@octokit/rest");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

function assertGitHubToken() {
    if (!process.env.GITHUB_TOKEN) {
        throw new Error("Missing GITHUB_TOKEN. Set it in your environment.");
    }
}

/**
 * Get file content
 */
async function getFileContent(owner, repo, path, branch = "main") {
    assertGitHubToken();
    try {
        const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
        if (Array.isArray(data)) throw new Error("Path is a directory, not a file.");
        return Buffer.from(data.content, "base64").toString("utf8");
    } catch (err) {
        if (err.status === 404) return null;
        throw err;
    }
}

/**
 * Fork a repo
 */
async function forkRepo(owner, repo) {
    assertGitHubToken();
    const { data } = await octokit.repos.createFork({ owner, repo });
    return data.full_name;
}

/**
 * Create a fresh branch from main
 */
async function createBranch(owner, repo, branchName) {
    assertGitHubToken();
    const { data: mainRef } = await octokit.git.getRef({ owner, repo, ref: "heads/main" });
    await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: mainRef.object.sha
    });
    return branchName;
}

/**
 * Edit multiple files in a branch
 * files: [{ path, content }]
 */
async function editFiles(owner, repo, branch, files, commitMessage = "Bot update") {
    assertGitHubToken();
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
    return true;
}

/**
 * Create a pull request
 */
async function createPR(upstreamOwner, repo, headOwner, branch, title, body) {
    assertGitHubToken();
    const { data } = await octokit.pulls.create({
        owner: upstreamOwner,
        repo,
        head: `${headOwner}:${branch}`,
        base: "main",
        title,
        body
    });
    return data.html_url;
}

/**
 * Create a new repository
 */
async function createRepo(name, description = "New repository", isPrivate = false) {
    assertGitHubToken();
    try {
        const { data } = await octokit.repos.createForAuthenticatedUser({
            name,
            description,
            private: isPrivate,
            auto_init: true
        });
        return data.full_name;
    } catch (err) {
        if (err.message.includes("already exists")) {
            return `SUCCESS: ${name} already exists.`;
        }
        throw err;
    }
}

/**
 * List repositories for a user
 */
async function listUserRepos(username) {
    assertGitHubToken();
    try {
        const { data } = await octokit.repos.listForUser({
            username,
            sort: "updated",
            per_page: 50
        });
        return data.map(repo => ({
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            language: repo.language,
            stars: repo.stargazers_count
        }));
    } catch (err) {
        if (err.status === 404) return null;
        throw err;
    }
}

module.exports = {
    getFileContent,
    forkRepo,
    createBranch,
    editFiles,
    createPR,
    createRepo,
    listUserRepos
};
