const { InMemoryRunner, LlmAgent, Gemini } = require('@google/adk');
const { orchestratorAgent, discord, refreshAgentModel } = require('./src/agents/orchestrator.agent');
const sheets = require('./src/tools/sheets');
const scraper = require('./src/tools/scraper');
const keyManager = require('./src/keys/key');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });

const MASTER_USERNAME = process.env.MASTER_USERNAME || "tobiawolaju";

// ==========================================
// 1. SESSION SERVICE (SHEETS)
// ==========================================
class SheetsSessionService {
    async getSession({ appName, userId, sessionId }) {
        const sessionData = await sheets.getSessionData({ appName, userId, sessionId });
        if (!sessionData || sessionData.status === "error" || !sessionData.id) {
            return { id: sessionId, appName, userId, state: {}, events: [] };
        }
        return sessionData;
    }
    async createSession({ appName, userId, sessionId, state = {} }) {
        sheets.updateSessionState({ id: sessionId, appName, userId, state }).catch(()=>{});
        return { id: sessionId, appName, userId, state, events: [] };
    }
    async appendEvent({ session, event }) {
        sheets.logSessionEvent({ sessionId: session.id, appName: session.appName, userId: session.userId, event }).catch(()=>{});
        sheets.updateSessionState({ id: session.id, appName: session.appName, userId: session.userId, state: session.state || {} }).catch(()=>{});
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
            await sheets.addProjectNode({ id: `auto_${Date.now()}`, name: "AutoReply", desc: `Replied to ${message.author.tag} in ${message.channel.id}` });
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
    setInterval(refreshRules, 120000); // Refresh every 2 mins

    const processMasterInteraction = async (platform, msg) => {
        const sessionId = msg.channelId;
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
                if (platform === 'telegram') await tool.reply(msg.channelId, helpMsg);
                else await tool.replyToMessage(msg.channelId, msg.messageId, helpMsg);
                return;
            }

            if (command === 'clear') {
                console.log(`[System] Clearing session memory for ${sessionId}`);
                // Wipe the backend state in Sheets
                await sheets.updateSessionState({ id: sessionId, appName: "miles_orchestrator", userId: msg.authorId || msg.authorName, state: {}, events: [] }).catch(()=>{});
                const clearMsg = "🧠 **Brain Reset:** I have cleared my recent memory loops. My context window is now fresh.";
                if (platform === 'telegram') await tool.reply(msg.channelId, clearMsg);
                else await tool.replyToMessage(msg.channelId, msg.messageId, clearMsg);
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
                        await tool.reply(msg.channelId, `📂 **Top 5 Repos for ${target}:**\n${repoList}`);
                    } else if (sub === 'create') {
                        const name = args[1];
                        const desc = args.slice(2).join(' ') || "Created via Miles Command Center";
                        const result = await githubTool.createRepo(name, desc);
                        await tool.reply(msg.channelId, `✅ **GitHub:** Created ${result}`);
                    } else if (sub === 'write') {
                        const repo = args[1];
                        const path = args[2];
                        const content = args.slice(3).join(' ');
                        await githubTool.editFiles('tobiawolaju', repo, 'main', [{ path, content }]);
                        await tool.reply(msg.channelId, `📝 **GitHub:** Committed to ${repo}/${path}`);
                    } else {
                        await tool.reply(msg.channelId, "❌ Unknown github command. Use `!help` for usage.");
                    }
                } catch (err) {
                    await tool.reply(msg.channelId, `⚠️ **GitHub Error:** ${err.message}`);
                }
                return;
            }
        }

        console.log(`[System] Master message received via ${platform} in ${sessionId}`);
        
        // Log to our frontend UI database (Fire and Forget)
        sheets.logHistory(sessionId, "user", msg.content).catch(()=>{});

        const currentDate = new Date().toISOString();
        // HISTORY TRIMMING: Light-weight aiPrompt to avoid 429 Quota errors
        const aiPrompt = `[SYSTEM]\nDate: ${currentDate}\nMaster: tobiawolaju\nPlatform: ${platform}\n\nUser ${msg.authorName} says: "${msg.content}"\n\n(Response rules: Keep it brief. 1-2 sentences unless deep technical work is needed. If the user asks a direct question, answer it directly in the first sentence.)`;

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
                    const stream = runner.runAsync({ userId: msg.authorId || msg.authorName, sessionId, newMessage: { role: "user", parts: [{ text: aiPrompt }] } });
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
                sheets.logHistory(sessionId, "assistant", fullAiResponse.trim()).catch(()=>{});
                
                if (platform === 'telegram') {
                    await tool.reply(msg.channelId, fullAiResponse.trim());
                } else {
                    await tool.replyToMessage(msg.channelId, msg.messageId, fullAiResponse.trim());
                }
            } else {
                console.warn(`[System] AI returned an empty response.`);
                const fallback = "I hit an internal issue and returned an empty result. Please retry your request after using !clear to reset my context.";
                sheets.logHistory(sessionId, "assistant", fallback).catch(()=>{});
                if (platform === 'telegram') await tool.reply(msg.channelId, fallback);
                else await tool.replyToMessage(msg.channelId, msg.messageId, fallback);
            }
        } catch (error) {
            console.error("[Agent Error]", error.message);
            const fallback = "I encountered an error interpreting that: " + error.message;
            if (platform === 'telegram') await tool.reply(msg.channelId, fallback);
            else await tool.replyToMessage(msg.channelId, msg.messageId, fallback);
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
