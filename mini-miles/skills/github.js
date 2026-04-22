const github = require('../tools/github');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: "github_operation",
    description: "DIRECTLY manages GitHub repositories. Use this when the user asks to 'create', 'list', 'read', or 'write' code to GitHub. DO NOT use web search for these actions.",
    parameters: {
      type: "object",
      properties: {
        action: { 
          type: "string", 
          enum: ["whoami", "read_file", "list_repos", "create_repo", "write_files"],
          description: "Action to perform on GitHub"
        },
        repo: { type: "string", description: "Repository name (e.g., 'owner/repo')" },
        path: { type: "string", description: "File path (for read/write)" },
        content: { type: "string", description: "Content for write_files" },
        description: { type: "string", description: "Repo description for create_repo" }
      },
      required: ["action"]
    }
  },

  execute: async (args, context) => {
    const { action, repo, path, content, description } = args;
    const { userId, masterId } = context;
    const isMaster = (userId || "").toLowerCase() === (masterId || "").toLowerCase();

    if (!isMaster) {
      return "Error: This tool is restricted to the Master user.";
    }

    try {
      const [owner, repoName] = repo ? repo.split('/') : [];
      const logTarget = action === 'list_repos'
        ? (owner || 'authenticated GitHub user')
        : (owner ? `${owner}/${repoName || ''}`.replace(/\/$/, '') : userId);

      skill(`Executing GitHub action: ${action} for ${logTarget}`);
      
      switch (action) {
        case "whoami":
          return JSON.stringify({ login: await github.getAuthenticatedUsername() }, null, 2);
        case "read_file":
          return await github.getFileContent(owner, repoName, path);
        case "list_repos": {
          const targetUser = owner || await github.getAuthenticatedUsername();
          return JSON.stringify(await github.listUserRepos(targetUser), null, 2);
        }
        case "create_repo":
          return await github.createRepo(repoName, description);
        case "write_files":
          return await github.editFiles(owner, repoName, 'main', [{ path, content }], "Updated via Mini-Miles");
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `GitHub Error: ${err.message}`;
    }
  }
};
