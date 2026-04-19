const { InMemoryRunner, LlmAgent, Gemini } = require('@google/adk');
const { orchestratorAgent, discord, refreshAgentModel } = require('./src/agents/orchestrator.agent');
const sheets = require('./src/tools/sheets');
const scraper = require('./src/tools/scraper');
const keyManager = require('./src/keys/key');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const MASTER_USERNAME = process.env.MASTER_USERNAME || "tobiawolaju";
const SESSION_EVENT_LIMIT = parseInt(process.env.SESSION_EVENT_LIMIT || "12", 10);

function safeAsync(promise, context) {
    return promise.catch((err) => {
        console.warn(`[Warn] ${context}: ${err.message}`);
    });
}

async function sendPlatformReply(platform, tool, msg, text) {
    if (platform === 'telegram') {
        await tool.reply(msg.channelId, text);
        return;
    }
    await tool.replyToMessage(msg.channelId, msg.messageId, text);
}

// ==========================================
// 1. SESSION SERVICE (SHEETS)
// ==========================================
class SheetsSessionService {
    async getSession({ appName, userId, sessionId }) {
        const sessionData = await sheets.getSessionData({ appName, userId, sessionId });
        const baseSession = { id: sessionId, appName, userId, state: {}, events: [] };

        if (!sessionData || sessionData.status === "error" || !sessionData.id) {
            return baseSession;
        }

        // Only return the state from the sheet, not the historical events.
        // The InMemoryRunner will manage conversational history in-memory.
        return { ...baseSession, state: sessionData.state || {} };
    }

    async createSession({ appName, userId, sessionId, state = {} }) {
        await safeAsync(
            sheets.updateSessionState({ id: sessionId, appName, userId, state }),
            `createSession/updateSessionState(${sessionId})`
        );
        return { id: sessionId, appName, userId, state, events: [] };
    }

    async appendEvent({ session, event }) {
        await Promise.allSettled([
            sheets.logSessionEvent({ sessionId: session.id, appName: session.appName, userId: session.userId, event }),
            sheets.updateSessionState({ id: session.id, appName: session.appName, userId: session.userId, state: session.state || {} })
        ]);
        return event;
    }
}

// ==========================================
// 2. MONITORING & NETWORKING SYSTEM
// ==========================================

async function handleAutomatedReply(message, rule) {
    console.log(`[Monitoring] Auto-replying in ${message.channel.id} via KB: ${rule.KbUrl}`);

    // Show Miles is thinking (Continuous)
    discord.startTyping(message.channel);

    try {
        // Fetch Knowledge Base/Persona
        const kbContent = await scraper.fetchKnowledgeBase(rule.KbUrl);

        const responder = new LlmAgent({
            name: "Miles-Responder",
            model: new Gemini({
                model: "gemini-3-flash-preview",
                apiKey: keyManager.getKey()
            }),
            instruction: `You are Miles, acting with the following Persona and Knowledge:

            ${kbContent}

            CRITICAL:
            - Your reply will be sent directly to Discord.
            - Keep it concise and relevant to the channel context.
            - Do not use tools. Just provide the text response.`
        });

        const prompt = `User ${message.author.username} said: "${message.content}" in channel ${message.channel.name}. Reply appropriately.`;

        console.log(`[Monitoring] Generating auto-reply...`);
        const response = await responder.model.generateContent(prompt);
        const aiText = response.text;

        if (aiText) {
            console.log(`[Monitoring] Sending auto-reply to Discord...`);
            await discord.replyToMessage(message.channel.id, message.id, aiText);
            await safeAsync(
                sheets.addProjectNode({ id: `auto_${Date.now()}`, name: "AutoReply", desc: `Replied to ${message.author.tag} in ${message.channel.id}` }),
                'handleAutomatedReply/addProjectNode'
            );
        }
    } catch (err) {
        if (err.message.includes("429") || err.message.includes("Quota")) {
            console.log("[Monitoring] Rate limit hit. Rotating key...");
            await keyManager.rotate();
        }
        console.error("[Monitoring Error] Failed to generate/send auto-reply:", err.message);
    } finally {
        discord.stopTyping(message.channel.id);
    }
}

// ==========================================
// 3. MAIN BOT LOOP
// ==========================================

async function runBot() {
    console.log("[System] Initializing KeyManager...");
    await keyManager.init();

    console.log("Connecting to Discord...");
    await discord.connect();
    console.log("Discord Connected!");

    const runner = new InMemoryRunner({ agent: orchestratorAgent, appName: "miles_orchestrator" });
    runner.sessionService = new SheetsSessionService();

    let monitoringRules = [];
    const refreshRules = async () => {
        monitoringRules = await sheets.getMonitoringRules();
        console.log(`[System] Refreshed ${monitoringRules.length} monitoring rules.`);
    };
    await refreshRules().catch(err => console.error("Initial rule fetch failed:", err.message));
    setInterval(() => {
        refreshRules().catch(err => console.error("Rule refresh failed:", err.message));
    }, 120000); // Refresh every 2 mins

    const processMasterInteraction = async (platform, msg) => {
        const sessionId = `${platform}:${msg.channelId}`;
        const tool = platform === 'telegram' ? require('./src/tools/telegram') : discord;

        // 1. COMMAND SYSTEM INTERCEPTION
        if (msg.content.startsWith('!')) {
            const [cmd, ...args] = msg.content.slice(1).split(' ');
            const command = cmd.toLowerCase();

            if (command === 'help') {
                const helpMsg = `🛠️ **Miles Command Center**\n\n` +
                    `**Memory**\n` +
                    `• \`!clear\`: Wipes my recent memory loops (Resets Brain)\n\n` +
                    `**GitHub Overrides**\n` +
                    `• \`!github list [user]\`: Lists repos (default: tobiawolaju)\n` +
                    `• \`!github create [name] [desc]\`: Creates a new repo\n` +
                    `• \`!github write [repo] [path] [content]\`: Commits code\n\n` +
                    `**System**\n` +
                    `• \`!status\`: Check bridge & API health`;
                await sendPlatformReply(platform, tool, msg, helpMsg);
                return;
            }

            if (command === 'clear') {
                console.log(`[System] Clearing session memory for ${sessionId}`);
                // Wipe the backend state in Sheets
                await safeAsync(
                    sheets.updateSessionState({ id: sessionId, appName: "miles_orchestrator", userId: msg.authorId || msg.authorName, state: {}, events: [] }),
                    `clear/updateSessionState(${sessionId})`
                );
                const clearMsg = "🧠 **Brain Reset:** I have cleared my recent memory loops. My context window is now fresh.";
                await sendPlatformReply(platform, tool, msg, clearMsg);
                return;
            }

            if (command === 'github') {
                const sub = args[0]?.toLowerCase();
                const githubTool = require('./src/tools/github');

                try {
                    if (sub === 'list') {
                        const target = args[1] || 'tobiawolaju';
                        const repos = await githubTool.listUserRepos(target);
                        const repoList = repos.slice(0, 5).map(r => `• ${r.name}`).join('\n');
                        await sendPlatformReply(platform, tool, msg, `📂 **Top 5 Repos for ${target}:**\n${repoList}`);
                    } else if (sub === 'create') {
                        const name = args[1];
                        const desc = args.slice(2).join(' ') || "Created via Miles Command Center";
                        const result = await githubTool.createRepo(name, desc);
                        await sendPlatformReply(platform, tool, msg, `✅ **GitHub:** Created ${result}`);
                    } else if (sub === 'write') {
                        const repo = args[1];
                        const filePath = args[2];
                        const content = args.slice(3).join(' ');
                        await githubTool.editFiles('tobiawolaju', repo, 'main', [{ path: filePath, content }]);
                        await sendPlatformReply(platform, tool, msg, `📝 **GitHub:** Committed to ${repo}/${filePath}`);
                    } else {
                        await sendPlatformReply(platform, tool, msg, "❌ Unknown github command. Use `!help` for usage.");
                    }
                } catch (err) {
                    await sendPlatformReply(platform, tool, msg, `⚠️ **GitHub Error:** ${err.message}`);
                }
                return;
            }
        }

        if (!msg.content || !msg.content.trim()) return;

        console.log(`[System] Master message received via ${platform} in ${sessionId}`);

        // Log to our frontend UI database (Fire and Forget)
        safeAsync(sheets.logHistory(sessionId, "user", msg.content), `logHistory(user:${sessionId})`);

        // Telegram uses string ID for typing, Discord requires the raw channel object
        tool.startTyping(platform === 'telegram' ? msg.channelId : msg.channelObj);

        try {
            console.log(`[System] Generating agent response...`);
            let fullAiResponse = "";
            let maxRetries = keyManager.keys.length > 0 ? keyManager.keys.length : 3;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                fullAiResponse = "";
                let streamError = null;

                try {
                    let toolCallsMade = 0;
                    const stream = runner.runAsync({ userId: msg.authorId || msg.authorName, sessionId, newMessage: { role: "user", parts: [{ text: msg.content }] } });
                    for await (const event of stream) {
                        if (event.errorCode || event.errorMessage) {
                            streamError = new Error(event.errorMessage || `Error ${event.errorCode}`);
                        }
                        if (event.content?.parts) {
                            for (const part of event.content.parts) {
                                if (part.text) fullAiResponse += part.text;
                                if (part.functionCall) toolCallsMade++;
                            }
                        }
                    }

                    if (streamError) throw streamError;

                    // If Google's API silently blocks output or returns junk like "null"
                    const trimmed = fullAiResponse.trim();
                    const looksEmpty = !trimmed || trimmed.toLowerCase() === 'null' || trimmed === 'none';

                    // If it looks empty and NO tools were called, it's a failure.
                    // If tools WERE called, it might just be the runner finishing a cycle.
                    if (looksEmpty && toolCallsMade === 0) {
                        throw new Error("EmptyResult");
                    }

                    // Success, break out of retry loop
                    break;
                } catch (error) {
                    if (error.message.includes("429") || error.message.includes("Quota") || error.message.includes("EmptyResult")) {
                        console.log(`[Master] Key exhaustion or safety filter hit. Rotating key... (Attempt ${attempt}/${maxRetries})`);
                        await keyManager.rotate();
                        refreshAgentModel();

                        if (attempt === maxRetries) throw error;
                        await new Promise(r => setTimeout(r, 1000));
                    } else {
                        throw error;
                    }
                }
            }

            if (fullAiResponse.trim()) {
                console.log(`[System] Sending final response to ${platform} and Sheets...`);
                safeAsync(sheets.logHistory(sessionId, "assistant", fullAiResponse.trim()), `logHistory(assistant:${sessionId})`);
                await sendPlatformReply(platform, tool, msg, fullAiResponse.trim());
            } else {
                console.warn(`[System] AI returned an empty response.`);
                const fallback = "I hit an internal issue and returned an empty result. Please retry your request after using !clear to reset my context.";
                safeAsync(sheets.logHistory(sessionId, "assistant", fallback), `logHistory(fallback:${sessionId})`);
                await sendPlatformReply(platform, tool, msg, fallback);
            }
        } catch (error) {
            console.error("[Agent Error]", error.message);
            const fallback = "I encountered an error interpreting that: " + error.message;
            await sendPlatformReply(platform, tool, msg, fallback);
        } finally {
            tool.stopTyping(platform === 'telegram' ? msg.channelId : msg.channelObj.id);
        }
    };

    // CONNECT TELEGRAM (Userbot)
    const telegramTool = require('./src/tools/telegram');
    await telegramTool.connect(async (msg) => {
        await processMasterInteraction('telegram', {
            channelId: msg.channelId,
            authorName: msg.author,
            authorId: msg.author,
            content: msg.content,
        });
    });

    discord.client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // 1. MASTER INTERACTION
        if (message.author.username === MASTER_USERNAME) {
            await processMasterInteraction('discord', {
                channelId: message.channel.id,
                authorName: message.author.username,
                authorId: message.author.id,
                content: message.content,
                channelObj: message.channel,
                messageId: message.id
            });
            return;
        }

        // 2. AUTOMATED MONITORING
        const activeRule = monitoringRules.find(r => r.ChannelID === message.channel.id || r.ServerID === message.guild?.id);
        if (activeRule) {
            await handleAutomatedReply(message, activeRule);
        }
    });
}

runBot().catch(console.error);
