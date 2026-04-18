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
        await sheets.updateSessionState({ id: sessionId, appName, userId, state });
        return { id: sessionId, appName, userId, state, events: [] };
    }
    async appendEvent({ session, event }) {
        try {
            await sheets.logSessionEvent({ sessionId: session.id, appName: session.appName, userId: session.userId, event });
            await sheets.updateSessionState({ id: session.id, appName: session.appName, userId: session.userId, state: session.state || {} });
        } catch (err) {}
        return event;
    }
}

// ==========================================
// 2. MONITORING & NETWORKING SYSTEM
// ==========================================

async function handleAutomatedReply(message, rule) {
    console.log(`[Monitoring] Auto-replying in ${message.channel.id} via KB: ${rule.KbUrl}`);
    
    // Show Miles is thinking
    try { await message.channel.sendTyping(); } catch (e) {}

    // Fetch Knowledge Base/Persona
    const kbContent = await scraper.fetchKnowledgeBase(rule.KbUrl);
    
    const responder = new LlmAgent({
        name: "Miles-Responder",
        model: new Gemini({ 
            model: "gemini-3-flash-preview", 
            apiKey: keyManager.getKey() // Use KeyManager
        }),
        instruction: `You are Miles, acting with the following Persona and Knowledge:
        
        ${kbContent}
        
        CRITICAL: 
        - Your reply will be sent directly to Discord. 
        - Keep it concise and relevant to the channel context.
        - Do not use tools. Just provide the text response.`
    });

    const prompt = `User ${message.author.username} said: "${message.content}" in channel ${message.channel.name}. Reply appropriately.`;
    
    try {
        const response = await responder.model.generateContent(prompt);
        const aiText = response.text;
        
        if (aiText) {
            await discord.replyToMessage(message.channel.id, message.id, aiText);
            await sheets.addProjectNode({ id: `auto_${Date.now()}`, name: "AutoReply", desc: `Replied to ${message.author.tag} in ${message.channel.id}` });
        }
    } catch (err) {
        if (err.message.includes("429") || err.message.includes("Quota")) {
            console.log("[Monitoring] Rate limit hit. Rotating key...");
            await keyManager.rotate();
            // Optional: retry once
        }
        console.error("[Monitoring Error] Failed to generate/send auto-reply:", err.message);
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

    discord.client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // 1. MASTER INTERACTION
        if (message.author.username === MASTER_USERNAME) {
            const sessionId = message.channel.id;
            await sheets.logHistory(sessionId, "user", message.content);
            const history = await sheets.getHistory(sessionId, 5);
            const contextStr = history.map(h => `${h.role}: ${h.content}`).join("\n");

            const aiPrompt = `[CONTEXT]\n${contextStr}\n\n[MESSAGE]\nUser ${message.author.username}: "${message.content}"\nChannel: ${message.channel.id}\nMessage: ${message.id}`;

            // Show Miles is thinking
            try { await message.channel.sendTyping(); } catch (e) {}

            try {
                const stream = runner.runAsync({ userId: message.author.id, sessionId, newMessage: { role: "user", parts: [{ text: aiPrompt }] } });
                let fullAiResponse = "";
                for await (const event of stream) {
                    if (event.content?.parts) {
                        for (const part of event.content.parts) if (part.text) fullAiResponse += part.text;
                    }
                }
                if (fullAiResponse.trim()) {
                    await sheets.logHistory(sessionId, "assistant", fullAiResponse.trim());
                    // Always reply to the master in Discord
                    await discord.replyToMessage(message.channel.id, message.id, fullAiResponse.trim());
                }
            } catch (error) {
                if (error.message.includes("429") || error.message.includes("Quota")) {
                    console.log("[Master] Rate limit hit. Rotating key...");
                    await keyManager.rotate();
                    refreshAgentModel();
                }
                console.error("[Agent Error]", error.message);
            }
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
