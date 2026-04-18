require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { LlmAgent, InMemoryRunner, Gemini, FunctionTool } = require('@google/adk');
const { readSheet, writeToSheet, updateStatus } = require('../tools/sheets');
const { searchGoogle } = require('../tools/search');

// --- TOOLS ---
const serperSearchTool = new FunctionTool({
    name: "google_search",
    description: "Searches Google for live information, official websites, and social media links.",
    parameters: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "The exact search query to send to Google (e.g., 'Paradex crypto official website')"
            }
        },
        required: ["query"]
    },
    handler: async ({ query }) => {
        console.log(`      [Tool] Googling: "${query}"...`);
        const results = await searchGoogle(query);
        return JSON.stringify(results);
    }
});

// --- AGENT ---
const agent = new LlmAgent({
    name: "research_agent",
    model: new Gemini({ model: "gemini-3-flash-preview", apiKey: process.env.GEMINI_API_KEY }),
    instruction: `
You are an expert Web3 Project Researcher.

When researching a project:
1. Use the 'google_search' tool to find their official information. Search multiple times if needed for website, Twitter, and GitHub.
2. Extract the following:
   - Official Website URL
   - X (Twitter) URL
   - GitHub URL
   - A 1-sentence description
3. Also analyze the project for:
   - Gaps (docs, onboarding, friction)
   - The #1 thing they should fix first

Return ONLY JSON:
{
  "website": "URL or 'Not found'",
  "twitter": "URL or 'Not found'",
  "github": "URL or 'Not found'",
  "summary": "1-sentence description",
  "gaps": "Bullet points of identified gaps",
  "fix_first": "The #1 thing they should fix first"
}
`,
    tools: [serperSearchTool]
});

// --- LOOP ---
async function runResearchAgent() {
    console.log("🔍 Running Research Agent...");

    let projectsRes = await readSheet("projects");
    let projects = Array.isArray(projectsRes) ? projectsRes : (projectsRes.data || []);

    for (const p of projects) {
        if (p.status !== "scraped") continue;

        console.log(`\n   [Action] Researching: ${p.name}`);

        // Lock status
        await updateStatus(p.id, "researching");

        try {
            const runner = new InMemoryRunner({ agent });
            const events = runner.runEphemeral({
                userId: "system",
                newMessage: {
                    role: "user",
                    parts: [{
                        text: `Research this project and find official links and analysis:\n${JSON.stringify({ name: p.name, desc: p.desc })}`
                    }]
                }
            });

            let output = {};
            for await (const e of events) {
                if (e.content?.parts) {
                    for (const part of e.content.parts) {
                        if (part.text && !part.thought && !part.call) {
                            try {
                                const rawText = part.text.replace(/```json/g, "").replace(/```/g, "").trim();
                                const parsed = JSON.parse(rawText);
                                output = { ...output, ...parsed };
                            } catch (err) {
                                // Not JSON or partial
                            }
                        }
                    }
                }
            }

            console.log(`      [LLM] Logging research for ${p.name}`);
            await writeToSheet("research", {
                project_id: p.id,
                summary: output.summary || "No summary provided",
                gaps: output.gaps || "No gaps identified",
                fix_first: output.fix_first || "Nothing identified",
                website: output.website || "unknown",
                twitter: output.twitter || "unknown",
                github: output.github || "unknown"
            });

            // Unlock status
            await updateStatus(p.id, "researched");
            console.log(`   [Done] ${p.name} -> researched`);

        } catch (err) {
            console.error(`   [Error] Research failed for ${p.name}:`, err.message);
            // Revert lock on failure
            await updateStatus(p.id, "scraped");
        }
    }

    console.log(`\n✅ Research Agent complete.`);
}

if (require.main === module) {
    runResearchAgent();
}

module.exports = runResearchAgent;
