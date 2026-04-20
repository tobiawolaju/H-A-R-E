# Mini-Miles Test Prompts

Use these prompts to verify the Twitter integration and the new Orchestrator commands.

## 🛠 Hardcoded Commands (Master Only, Discord/Telegram)
*These must be sent as exact matches.*

- `!help`
  - *Expected: Returns a structured list of all loaded skills and actions.*

## 🐦 Twitter Gateway Prompts (Master Only, from @tobiawolaju)
*Mention the bot account on Twitter with these prompts.*

- `@MiniMilesBot what is the current price of $MON?`
  - *Expected: Orchestrator triggers search tool and replies.*
- `@MiniMilesBot remind me to check the hackathon results in 2 hours`
  - *Expected: Orchestrator triggers scheduler skill and replies.*

## 🔍 Twitter Skill Prompts (via Discord/Telegram)
*Ask these via your primary chat gateways to test the tool usage.*

- "Search Twitter for the latest news about Monad blockchain"
  - *Goal: Verify `twitter_actions` search action.*
- "Who is @elonmusk? Give me his profile stats."
  - *Goal: Verify `twitter_actions` get_profile action.*
- "Fetch the latest posts from @Monad_xyz"
  - *Goal: Verify `twitter_actions` get_timeline action.*
- "Post a tweet saying: Mini-Miles is now live on X! 🚀"
  - *Goal: Verify `twitter_actions` post_tweet action (Requires permission).*

## 🔒 Restriction Verification
- Ask another user to send `!help` on Discord.
  - *Expected: No response.*
- Send `!help` on Twitter.
  - *Expected: No response.*
- Mention the bot on Twitter from an account that is NOT `@tobiawolaju`.
  - *Expected: Log shows "Ignoring mention", no reply.*
