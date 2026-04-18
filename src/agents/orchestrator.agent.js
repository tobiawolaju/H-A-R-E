const { LlmAgent, Gemini, FunctionTool } = require('@google/adk');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Tool Imports
const github = require('../tools/github');
const sheets = require('../tools/sheets');
const DiscordTool = require('../tools/discord');
const scraper = require('../tools/scraper');
const keyManager = require('../keys/key');
const { searchGoogle } = require('../tools/search');

const discord = new DiscordTool(process.env.DISCORD_BOT_TOKEN);

// ==========================================
// 1. TOOL DEFINITIONS
// ==========================================

// --- Social Networking Tools ---

const friendRequestTool = new FunctionTool({
    name: "send_friend_request",
    description: "Sends a friend request to a Discord user by ID or Username#Tag.",
    parameters: {
        type: "object",
        properties: { userIdOrName: { type: "string" } },
        required: ["userIdOrName"]
    },
    execute: async ({ userIdOrName }) => {
        try {
            return await discord.sendFriendRequest(userIdOrName);
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

const getAdminsTool = new FunctionTool({
    name: "get_guild_admins",
    description: "Fetches a list of administrators for a given Discord server ID.",
    parameters: {
        type: "object",
        properties: { guildId: { type: "string" } },
        required: ["guildId"]
    },
    execute: async ({ guildId }) => {
        try {
            const admins = await discord.getGuildAdmins(guildId);
            return JSON.stringify(admins, null, 2);
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

const automateNetworkingTool = new FunctionTool({
    name: "automate_member_networking",
    description: "Fetches members of a guild and sends friend requests/DMs with a safety delay.",
    parameters: {
        type: "object",
        properties: {
            guildId: { type: "string" },
            limit: { type: "number", default: 10 },
            message: { type: "string", description: "Optional DM message to send after friend request" }
        },
        required: ["guildId"]
    },
    execute: async ({ guildId, limit = 10, message }) => {
        try {
            const members = await discord.getTopMembers(guildId, limit);
            
            // Start the batch process in the background (no await)
            (async () => {
                for (const member of members) {
                    try {
                        await discord.sendFriendRequest(member.id);
                        if (message) await discord.sendDM(member.id, message);
                        await sheets.addProjectNode({ 
                            id: `net_${Date.now()}`, 
                            name: "Networking", 
                            desc: `Sent request to ${member.tag}` 
                        });
                        console.log(`[Networking] Request sent to ${member.tag}. Waiting for jitter delay...`);
                    } catch (e) {
                        console.error(`[Networking Error] Failed for ${member.tag}:`, e.message);
                    }
                    await discord.networkingDelay();
                }
            })();

            return `Started networking with ${members.length} members. I will send requests every 2-3 minutes. Check the 'projects' or 'engagement_log' for progress updates.`;
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

// --- Monitoring Tools ---

const startMonitoringTool = new FunctionTool({
    name: "start_channel_monitoring",
    description: "Starts monitoring a channel for messages to auto-reply using a knowledge base.",
    parameters: {
        type: "object",
        properties: {
            channelId: { type: "string" },
            serverId: { type: "string", description: "Optional server ID to monitor whole guild" },
            kbUrl: { type: "string", description: "URL of the knowledge base/persona definition" }
        },
        required: ["kbUrl"]
    },
    execute: async (args) => {
        try {
            const res = await sheets.addMonitoringRule(args.channelId, args.serverId, args.kbUrl);
            return `Monitoring started. Rule ID: ${res.id}`;
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

const stopMonitoringTool = new FunctionTool({
    name: "stop_channel_monitoring",
    description: "Stops an active monitoring rule.",
    parameters: {
        type: "object",
        properties: { ruleId: { type: "string" } },
        required: ["ruleId"]
    },
    execute: async ({ ruleId }) => {
        try {
            await sheets.removeMonitoringRule(ruleId);
            return `Monitoring stopped for ${ruleId}`;
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

const listMonitoringTool = new FunctionTool({
    name: "list_active_monitors",
    description: "Lists all currently active channel/server monitoring rules.",
    parameters: { type: "object", properties: {} },
    execute: async () => {
        try {
            const rules = await sheets.getMonitoringRules();
            return JSON.stringify(rules, null, 2);
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

// --- Research & Discovery Tools ---

const googleSearchTool = new FunctionTool({
    name: "google_search",
    description: "Searches Google for live information, websites, and data.",
    parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
    },
    execute: async ({ query }) => {
        try {
            const results = await searchGoogle(query);
            return JSON.stringify(results, null, 2);
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

const browseUrlTool = new FunctionTool({
    name: "browse_url",
    description: "Fetches and extracts clean text content from a web URL.",
    parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"]
    },
    execute: async ({ url }) => {
        try {
            return await scraper.fetchKnowledgeBase(url);
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

const getFileTool = new FunctionTool({
    name: "get_github_file_content",
    description: "Fetches its content from a GitHub repo.",
    parameters: {
        type: "object",
        properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" } },
        required: ["owner", "repo", "path"]
    },
    execute: async (args) => {
        const content = await github.getFileContent(args.owner, args.repo, args.path);
        return content || "File not found.";
    }
});

const listReposTool = new FunctionTool({
    name: "list_github_repos",
    description: "Lists up to 50 public repositories for a specified GitHub username.",
    parameters: {
        type: "object",
        properties: { username: { type: "string" } },
        required: ["username"]
    },
    execute: async ({ username }) => {
        try {
            const repos = await github.listUserRepos(username);
            return repos ? JSON.stringify(repos, null, 2) : "User not found.";
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

const createRepoTool = new FunctionTool({
    name: "create_github_repo",
    description: "Creates a new repository on the authenticated user's GitHub account.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string" },
            description: { type: "string" },
            isPrivate: { type: "boolean", default: false }
        },
        required: ["name"]
    },
    execute: async (args) => {
        try {
            const fullName = await github.createRepo(args.name, args.description, args.isPrivate);
            return `Repo created: ${fullName}`;
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

const writeGithubFilesTool = new FunctionTool({
    name: "write_files_to_github",
    description: "Creates or updates one or more files in a GitHub repository.",
    parameters: {
        type: "object",
        properties: {
            owner: { type: "string" },
            repo: { type: "string" },
            branch: { type: "string", default: "main" },
            files: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        path: { type: "string", description: "Path to the file (e.g., 'README.md')" },
                        content: { type: "string", description: "Content of the file" }
                    },
                    required: ["path", "content"]
                }
            },
            commitMessage: { type: "string", default: "Update via Miles Orchestrator" }
        },
        required: ["owner", "repo", "files"]
    },
    execute: async (args) => {
        try {
            await github.editFiles(args.owner, args.repo, args.branch, args.files, args.commitMessage);
            return `Successfully updated ${args.files.length} file(s) in ${args.repo}.`;
        } catch (err) {
            return `Error: ${err.message}`;
        }
    }
});

// ==========================================
// 2. AGENT INITIALIZATION
// ==========================================

function createOrchestratorModel() {
    return new Gemini({
        model: "gemini-3-flash-preview",
        apiKey: keyManager.getKey()
    });
}

const orchestratorAgent = new LlmAgent({
    name: "Miles-Orchestrator",
    model: createOrchestratorModel(),
    instruction: `You are Miles, the proactive Hackathon Orchestrator for 'tobiawolaju'.

--- MASTER PROFILE ---
Master Username: tobiawolaju
Master GitHub: tobiawolaju
Master Platforms: Discord, Telegram
Primary Goal: Hackathon success, community growth, and personal site management.
----------------------

RESPONSE CONTRACT:
- BE BRIEF BUT ACTIVE. Never reply with just an acknowledgment like "I understand" if a task was requested.
- If the Master asks for information (e.g., "list my projects"), use the appropriate tools immediately.
- If the Master says "Hi", reply briefly: "Hi Master, Miles here. Ready for the next hackathon task."
- Return your final user-facing response as plain text.
- Maximum 3 tool calls per request.

NETWORKING & SOCIAL:
- Use 'get_guild_admins' and friendship tools to expand reach.
- Always warn about the 2m+ safety delay for social tasks.

MONITORING & AUTO-REPLY:
- Use 'start_channel_monitoring' and 'list_active_monitors' to manage background watches.

RESEARCH & DISCOVERY:
- Use 'google_search', 'browse_url', and 'list_github_repos' to fetch live data.
- Use 'create_github_repo' and 'write_files_to_github' to build. You HAVE full control over the Master's account.

GENERAL:
- Always prioritize ACTION over conversation.`,
    tools: [
        googleSearchTool, browseUrlTool,
        friendRequestTool, getAdminsTool, automateNetworkingTool,
        startMonitoringTool, stopMonitoringTool, listMonitoringTool,
        getFileTool, listReposTool, createRepoTool, writeGithubFilesTool
    ]
});

function refreshAgentModel() {
    console.log("[Orchestrator] Refreshing model with new key...");
    orchestratorAgent.model = createOrchestratorModel();
}

module.exports = { orchestratorAgent, discord, refreshAgentModel };
