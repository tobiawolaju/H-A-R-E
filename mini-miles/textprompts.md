# Mini-Miles Comprehensive Feature Tests

Use these prompts to verify all tools and skills currently integrated into Mini-Miles.

## 🤖 Core Commands (Discord/Telegram Only)
- `!help`
  - *Expected: Instant listing of all tools and their available actions.*

---

## 🐦 Twitter (X) Integration
### Gateway (Master Only)
- Mention the bot account from `@tobiawolaju`:
  - "Search for latest Monad alpha"
  - "Post a tweet: Mini-Miles is scaling! 🚀"

### Skills (via any gateway)
- "What is @elonmusk's follower count?"
- "Search Twitter for #MonadTestnet news"
- "Show me my following timeline"

---

## 💎 Monad Ecosystem (Monad Ops)
- "Hunt for $200+ bounties in the Monad ecosystem"
- "Give me the latest news on Monad ecosystem projects"
- "Log a new job: Title 'Smart Contract Dev', Reward '500 USDC', Platform 'Gitcoin'"
- "List all my logged jobs"

---

## 📅 Scheduling (Scheduler Ops)
- "Remind me to check the crypto markets in 30 minutes"
- "Schedule a task for tomorrow at 10 AM: 'Weekly team sync'"
- "List all my active reminders"
- "Cancel task #1"

---

## 📂 File & Document Management
- "What files are in the research folder?"
- "Summarize the contents of research_notes.txt"
- "Move all .png files to the assets directory"
- "Create a new text file called 'todo.txt' with content: '1. Update Twitter tools'"

---

## 🌍 Web & Social Media
### Scraper & Search
- "Search the web for the current price of Bitcoin"
- "Scrape the content of https://monad.xyz/blog"

### Discord Ops
- "Summarize the last 50 messages in the #alpha-leaks channel"
- "Send a DM to @user123: 'Hey, I checked the transaction!'"

### Telegram Ops
- "Broadcast this message to the alpha-group: 'New bounty alert!'"
- "Read the last 10 messages from the Monad Global chat"

---

## 💻 Tech & Dev Tools
### GitHub
- "List all my repositories on GitHub"
- "Create a new issue in 'mini-miles': 'Implement media support for Twitter'"

### Video Ops
- "Merge all clips in the 'recap' folder into a single video"
- "Add a fade-in effect to the first 5 seconds of tutorial.mp4"

### Hackathon Kit
- "Generate a project description for a Monad DeFi dashboard"
- "Compile a list of resources for building on Monad"

---

## 🔒 Security Tests
1. **Platform Check**: Try `!help` on Twitter.
   - *Expected: No response.*
2. **User Check**: Ask a friend to mention the bot on Twitter.
   - *Expected: Log shows "Ignoring mention".*
3. **Master Check**: Try `!help` from a secondary Discord account.
   - *Expected: No response.*
