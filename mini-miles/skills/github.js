const github = require('../tools/github');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: "github_operation",
    description: "Performs GitHub operations like reading files, listing repos, or creating repositories. ONLY available to MASTER user.",
    parameters: {
      type: "object",
      properties: {
        action: { 
          type: "string", 
          enum: ["read_file", "list_repos", "create_repo", "write_files"],
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

    if (userId !== masterId) {
      return "Error: This tool is restricted to the Master user.";
    }

    skill(`Executing GitHub action: ${action} for ${userId}`);

    try {
      const [owner, repoName] = repo ? repo.split('/') : [];
      
      switch (action) {
        case "read_file":
          return await github.getFileContent(owner, repoName, path);
        case "list_repos":
          return JSON.stringify(await github.listUserRepos(owner || userId), null, 2);
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
