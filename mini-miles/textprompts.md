# Mini-Miles Comprehensive Test Suite

Use these prompts to verify all features, tools, and gateways in Mini-Miles.

## 🕒 Basic Utilities & Reasoning
- "What time is it right now?"
- "Briefly explain what you can do for me."
- "What is 1234 * 567?"

## 🛠 Hardcoded Commands (Master Only, Discord/Telegram)
- `!help`
  - *Expected: Returns a list of all skills/actions below.*

## 🐦 Twitter Integration
- **Gateway (from @tobiawolaju)**: "@MiniMilesBot what's the latest alpha on Monad?"
- **Search**: "Search Twitter for $MON price predictions."
- **Profile**: "Get profile info for @Monad_xyz"
- **Timeline**: "Show me the last 5 posts from my home timeline."
- **Post**: "Post a tweet saying: Testing the new Mini-Miles Twitter skill! 🤖"

## 💎 Monad & Hackathon Alpha
- **Monad Ops**: "Hunt for any new bounties in the Monad ecosystem."
- **Hackathon**: "Check devpost for upcoming remote hackathons with $5k+ prizes."
- **Scraper**: "Scrape the content of https://monad.xyz/blog and summarize the last post."

## 📁 File & System Management
- **File Manager**: "List the files in my current directory."
- **File Parser**: "Read the content of index.js and explain the gateway initialization."
- **GitHub**: "Check my latest commits in the tobi repository."

## 📅 Scheduling & Automation
- **Scheduler**: "Remind me in 30 minutes to check the Discord feedback."
- **Status**: "List all pending scheduled tasks."

## 💬 Platform Ops (Cross-Gateway)
- **Discord Ops**: "Find a user named 'mikeweb' in the server."
- **Telegram Ops**: "Send a DM to @tobiawolaju on Telegram saying the bot is updated."

## 🎬 Media & Video
- **Video Ops**: "Do I have any video processing tools available? What can we do with FFmpeg?"
- **Frame Export**: "Export a frame from test_video.mp4 at 00:05."

## 🔒 Security & Restriction Tests
- **Non-Master User**: Have someone else try `!help` or mention the bot on Twitter.
- **Wrong Platform**: Try `!help` in a Twitter DM or Public Tweet.
- **Direct Access**: Log into the console and try to access `.env` variables via the LLM (should be filtered/safe).
