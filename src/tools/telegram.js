const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const input = require('input');
const fs = require('fs');

class TelegramTool {
    constructor() {
        this.apiId = parseInt(process.env.TELEGRAM_API_ID);
        this.apiHash = process.env.TELEGRAM_API_HASH;
        
        // This is the session string that allows the bot to remember it's logged in
        const savedSession = process.env.TELEGRAM_SESSION_STRING || '';
        this.stringSession = new StringSession(savedSession);
        
        this.client = null;
        this.masterUsername = process.env.TELEGRAM_MASTER_USERNAME;
        this.masterChatId = null;

        this.onMessageReceived = null;
        this.typingIntervals = new Map();
    }

    async connect(onMessageReceivedCallback) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.apiId || !this.apiHash) {
                    console.log("[Telegram] Skipping Telegram integration - Missing API_ID or API_HASH in .env");
                    return resolve(false);
                }

                this.onMessageReceived = onMessageReceivedCallback;

                console.log("[System] Connecting to Telegram MTProto API...");
                this.client = new TelegramClient(this.stringSession, this.apiId, this.apiHash, {
                    connectionRetries: 10,
                    useWSS: false, // Standard TCP is often more stable for CLI
                    floodSleepThreshold: 60,
                    deviceModel: "Miles Orchestrator",
                });

                // This will block and prompt the user in terminal if no valid session string exists
                await this.client.start({
                    phoneNumber: async () => await input.text('Please enter your Telegram number (e.g., +1234567890): '),
                    password: async () => await input.text('Please enter your Telegram password (if any): '),
                    phoneCode: async () => await input.text('Please enter the Telegram code you received: '),
                    onError: (err) => console.log(err),
                });

                console.log("[Telegram] Connected successfully!");
                
                // Save session so user doesn't have to log in again next time they run `node main`
                const currentSession = this.client.session.save();
                if (currentSession !== process.env.TELEGRAM_SESSION_STRING && currentSession !== '') {
                    try {
                        let envContent = fs.readFileSync('.env', 'utf8');
                        if (envContent.includes('TELEGRAM_SESSION_STRING=')) {
                            envContent = envContent.replace(/TELEGRAM_SESSION_STRING=.*/g, `TELEGRAM_SESSION_STRING=${currentSession}`);
                            fs.writeFileSync('.env', envContent);
                        } else {
                            fs.appendFileSync('.env', `\nTELEGRAM_SESSION_STRING=${currentSession}`);
                        }
                        console.log("[Telegram] 🔒 Saved new SESSION_STRING to .env securely.");
                    } catch(e) {
                        console.warn("[Telegram] Failed to save session string to .env:", e.message);
                    }
                }

                const me = await this.client.getMe();
                console.log(`[Telegram] Logged in natively as: @${me.username || me.firstName}`);

                // Connect to incoming message events
                this.client.addEventHandler((event) => this.handleIncomingMessage(event), new NewMessage({}));
                
                // Keep-Alive Heartbeat (prevent timeouts)
                setInterval(async () => {
                    try {
                        if (this.client && this.client.connected) {
                            await this.client.getMe().catch(()=>{});
                        }
                    } catch(e) {}
                }, 60000); // Pulse every minute
                
                resolve(true);

            } catch(e) {
                console.error("[Telegram] Connection Error:", e.message);
                resolve(false);
            }
        });
    }

    async handleIncomingMessage(event) {
        const message = event.message;
        
        // Ensure it's a valid message with text
        if (!message || !message.text) return;
        
        // To mimic the Discord architecture, we only reply to the allowed MASTER_USERNAME
        // GramJS requires us to fetch the sender
        const sender = await message.getSender();
        if (!sender || !sender.username) return;

        // Check if the sender is the master assigned in .env
        if (sender.username.toLowerCase() === this.masterUsername.toLowerCase()) {
            
            // Log that we received a valid master message
            console.log(`[Telegram] Master message received from @${sender.username} in Chat ID: ${message.chatId}`);
            
            // Pass it back up to the Orchestrator loop (main.js)
            // Note: chat IDs in Telegram are often BigInt, so we convert to string to be safe
            if (this.onMessageReceived) {
                this.onMessageReceived({
                    author: sender.username,
                    content: message.text,
                    channelId: message.chatId.toString(),
                    platform: 'telegram'
                });
            }
        }
    }

    startTyping(chatId) {
        try {
            // Send the typing state
            this.client.invoke(new Api.messages.SetTyping({
                peer: chatId,
                action: new Api.SendMessageTypingAction()
            })).catch(() => {});

            // Unlike Discord, Telegram typing states expire after a few seconds,
            // so we must send them repeatedly using an interval for long AI generations
            const interval = setInterval(() => {
                this.client.invoke(new Api.messages.SetTyping({
                    peer: chatId,
                    action: new Api.SendMessageTypingAction()
                })).catch(() => {});
            }, 4000);
            
            this.typingIntervals.set(chatId.toString(), interval);
            console.log(`[Telegram] Starting persistent typing indicator in ${chatId}`);
        } catch(e) {
            console.warn(`[Telegram] Failed to start typing: ${e.message}`);
        }
    }

    stopTyping(chatId) {
        try {
            const interval = this.typingIntervals.get(chatId.toString());
            if (interval) {
                clearInterval(interval);
                this.typingIntervals.delete(chatId.toString());
            }

            // Immediately send the CancelAction to clear the state across clients
            this.client.invoke(new Api.messages.SetTyping({
                peer: chatId,
                action: new Api.SendMessageCancelAction()
            })).catch(() => {});
            
            console.log(`[Telegram] Stopped typing indicator in ${chatId}`);
        } catch(e) {
            console.warn(`[Telegram] Failed to stop typing: ${e.message}`);
        }
    }

    async reply(chatId, text) {
        try {
            await this.client.sendMessage(chatId, { message: text });
            console.log(`[Telegram] Message successfully sent to ${chatId}`);
        } catch(e) {
            console.error(`[Telegram] Failed to send message:`, e.message);
        }
    }
}

module.exports = new TelegramTool();
