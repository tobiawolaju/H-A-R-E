const { InMemoryRunner, LlmAgent, Gemini, FunctionTool } = require('@google/adk');
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
// 1. BASE TOOLS (used by specialist agents)
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
// 2. MULTI-AGENT HIERARCHY
// ==========================================

function createModel() {
    return new Gemini({
        model: "gemini-3-flash-preview",
        apiKey: keyManager.getKey()
    });
}

function buildSpecialistAgent({ name, instruction, tools }) {
    return new LlmAgent({ name, model: createModel(), instruction, tools });
}

const researchAgent = buildSpecialistAgent({
    name: "Miles-Research-Agent",
    instruction: `You are the RESEARCH AGENT.
Goal: gather accurate, current, decision-ready information.
Workflow:
1) Run google_search to discover relevant sources.
2) Run browse_url on the most useful URLs.
3) Produce concise findings with assumptions and uncertainties clearly labeled.
Do not handle code edits or social automation unless explicitly requested.`,
    tools: [googleSearchTool, browseUrlTool]
});

const codeAgent = buildSpecialistAgent({
    name: "Miles-Code-Agent",
    instruction: `You are the CODE AGENT.
Goal: analyze and execute GitHub/code operations precisely.
Workflow:
1) Inspect repos/files before mutating.
2) Make minimal, safe, targeted edits.
3) Return machine-actionable summaries of what changed.
Use GitHub tools only when needed and avoid unrelated exploration.`,
    tools: [getFileTool, listReposTool, createRepoTool, writeGithubFilesTool]
});

const webAgent = buildSpecialistAgent({
    name: "Miles-Web-Agent",
    instruction: `You are the WEB AGENT.
Goal: extract clean, useful content from websites for downstream reasoning.
Use browse_url to fetch content and provide structured extraction summaries.
If browsing fails, state the failure reason and suggest a fallback URL strategy.`,
    tools: [browseUrlTool]
});

const reviewerAgent = buildSpecialistAgent({
    name: "Miles-Reviewer-Agent",
    instruction: `You are the REVIEWER AGENT.
Goal: validate and refine aggregated outputs before user delivery.
Checklist:
- Verify completeness against the user request.
- Highlight contradictions, missing steps, and risky claims.
- Rewrite into a final clear answer with zero filler.
If information is insufficient, request targeted follow-up work items.`,
    tools: []
});

const specialistRunners = {
    research: new InMemoryRunner({ agent: researchAgent, appName: 'miles_research' }),
    code: new InMemoryRunner({ agent: codeAgent, appName: 'miles_code' }),
    web: new InMemoryRunner({ agent: webAgent, appName: 'miles_web' }),
    reviewer: new InMemoryRunner({ agent: reviewerAgent, appName: 'miles_reviewer' })
};

async function runSpecialistAgent(agentKey, sessionId, userId, input, maxPasses = 2) {
    const runner = specialistRunners[agentKey];
    if (!runner) return `Error: Unknown specialist ${agentKey}`;

    let aggregated = '';

    for (let pass = 1; pass <= maxPasses; pass++) {
        const prompt = pass === 1
            ? input
            : `Refine/continue from previous result. Previous output:\n${aggregated}\n\nContinue only if there is meaningful new work.`;

        let out = '';
        const stream = runner.runAsync({
            userId,
            sessionId: `${sessionId}:${agentKey}`,
            newMessage: { role: 'user', parts: [{ text: prompt }] }
        });

        for await (const event of stream) {
            if (event.content?.parts) {
                for (const part of event.content.parts) {
                    if (part.text) out += part.text;
                }
            }
        }

        if (!out.trim()) break;
        aggregated = aggregated ? `${aggregated}\n\n---\nPass ${pass}:\n${out.trim()}` : out.trim();

        if (pass > 1 && out.trim().length < 60) break;
    }

    return aggregated || 'No output produced.';
}

function makeDelegationTool(name, specialistKey, description) {
    return new FunctionTool({
        name,
        description,
        parameters: {
            type: 'object',
            properties: {
                task: { type: 'string', description: 'Task details for the specialist agent.' },
                sessionId: { type: 'string' },
                userId: { type: 'string' }
            },
            required: ['task']
        },
        execute: async ({ task, sessionId = 'default_session', userId = 'default_user' }) => runSpecialistAgent(
            specialistKey,
            sessionId,
            userId,
            task
        )
    });
}

const delegateResearchTool = makeDelegationTool(
    'delegate_to_research_agent',
    'research',
    'Delegates research and source-gathering work to the research specialist.'
);

const delegateCodeTool = makeDelegationTool(
    'delegate_to_code_agent',
    'code',
    'Delegates GitHub/code analysis or mutation work to the code specialist.'
);

const delegateWebTool = makeDelegationTool(
    'delegate_to_web_agent',
    'web',
    'Delegates website extraction and content parsing work to the web specialist.'
);

const reviewOutputTool = makeDelegationTool(
    'delegate_to_reviewer_agent',
    'reviewer',
    'Sends aggregated specialist outputs to reviewer for final validation and rewrite.'
);

// ==========================================
// 3. ORCHESTRATOR AGENT
// ==========================================

const orchestratorAgent = new LlmAgent({
    name: 'Miles-Orchestrator',
    model: createModel(),
    instruction: `You are Miles, an AI assistant.
Answer IMMEDIATELY and DIRECTLY. Never ask what the user wants or if you are ready.
Example: User: "What's 2+2?" You: "4"
- For simple questions (e.g., math), answer yourself.
- For complex questions, use tools or delegate.
- Do NOT use conversational fillers or wait for user confirmation.`,
    tools: [
        delegateResearchTool,
        delegateCodeTool,
        delegateWebTool,
        reviewOutputTool,
        friendRequestTool,
        getAdminsTool,
        automateNetworkingTool,
        startMonitoringTool,
        stopMonitoringTool,
        listMonitoringTool
    ]
});

function refreshAgentModel() {
    console.log('[Orchestrator] Refreshing models with new key...');
    orchestratorAgent.model = createModel();
    researchAgent.model = createModel();
    codeAgent.model = createModel();
    webAgent.model = createModel();
    reviewerAgent.model = createModel();
}

module.exports = { orchestratorAgent, discord, refreshAgentModel };
