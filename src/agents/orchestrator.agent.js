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

// --- Sheet/Discord Helpers ---

const discordReplyTool = new FunctionTool({
    name: "discord_reply",
    description: "Sends a response back to the user on Discord.",
    parameters: {
        type: "object",
        properties: { channelId: { type: "string" }, messageId: { type: "string" }, content: { type: "string" } },
        required: ["channelId", "messageId", "content"]
    },
    execute: async ({ channelId, messageId, content }) => {
        await discord.replyToMessage(channelId, messageId, content);
        return "Replied.";
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

NETWORKING & SOCIAL:
- Use 'get_guild_admins' to find high-value contacts in servers.
- Use 'send_friend_request' and 'automate_member_networking' to expand your master's reach.
- CRITICAL: Always warn the user about the 2m+ safety delay when performing social tasks.

MONITORING & AUTO-REPLY:
- Use 'start_channel_monitoring' to watch specific channels.
- When monitoring, you will be provided with a Knowledge Base (KB) link. 
- Your persona and knowledge for that specific channel are defined IN the KB link. Adapt your character accordingly.

RESEARCH & DISCOVERY:
- Use 'google_search' to find official links, documentation, or news.
- Use 'browse_url' to read the content of search results or specific links to understand projects deeply.
- Use 'list_github_repos' to see what a user or project has built on GitHub.
- Combine these to answer questions like "what do you know about [project]" or "find the link for [resource]".

GENERAL:
- ALWAYS use 'discord_reply' to confirm actions to your master.
- Keep your master updated on your networking progress via the 'engagement_log' (managed by main.js).`,
    tools: [
        googleSearchTool, browseUrlTool,
        friendRequestTool, getAdminsTool, automateNetworkingTool,
        startMonitoringTool, stopMonitoringTool,
        getFileTool, listReposTool, discordReplyTool
    ]
});

function refreshAgentModel() {
    console.log("[Orchestrator] Refreshing model with new key...");
    orchestratorAgent.model = createOrchestratorModel();
}

module.exports = { orchestratorAgent, discord, refreshAgentModel };
