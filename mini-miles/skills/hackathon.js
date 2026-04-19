/**
 * skills/hackathon.js
 * Exposes hackathon project generation to the LLM agent.
 */

const kit = require('../tools/hackathon-kit');
const github = require('../tools/github');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: 'hackathon_ops',
    description: 'Hackathon productivity toolkit. Use this to: generate a full project boilerplate and push it to GitHub in one shot, write a professional README for an existing repo, create a hackathon pitch document, or update READMEs across multiple repos. ONLY available to MASTER user.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['generate_project', 'generate_readme', 'generate_pitch', 'update_readme'],
          description: 'Hackathon action to perform'
        },
        name: {
          type: 'string',
          description: 'Project/repo name'
        },
        description: {
          type: 'string',
          description: 'Project description'
        },
        stack: {
          type: 'string',
          enum: ['nextjs', 'python', 'node'],
          description: 'Tech stack template to use (default: nextjs)'
        },
        owner: {
          type: 'string',
          description: 'GitHub owner/username (defaults to tobiawolaju)'
        },
        repo: {
          type: 'string',
          description: 'Existing repo name (for update_readme)'
        },
        features: {
          type: 'string',
          description: 'Comma-separated list of features for the README'
        },
        demo_url: {
          type: 'string',
          description: 'Live demo URL'
        },
        problem: {
          type: 'string',
          description: 'Problem statement for pitch'
        },
        solution: {
          type: 'string',
          description: 'Solution description for pitch'
        },
        impact: {
          type: 'string',
          description: 'Impact statement for pitch'
        }
      },
      required: ['action']
    }
  },

  execute: async (args, context) => {
    const { userId, masterId } = context;
    if ((userId || '').toLowerCase() !== (masterId || '').toLowerCase()) {
      return 'Error: hackathon_ops is restricted to the Master user.';
    }

    const { action, name, description, stack, owner = 'tobiawolaju', repo, features, demo_url, problem, solution, impact } = args;
    skill(`Hackathon Ops: ${action} — ${name || repo}`);

    try {
      switch (action) {
        case 'generate_project': {
          return await kit.generateProject({ name, description, stack: stack || 'nextjs', owner });
        }
        case 'generate_readme': {
          const featureArr = features ? features.split(',').map(f => f.trim()) : [];
          const readme = kit.generateReadme({ name, description, stack, features: featureArr, demoUrl: demo_url });
          // Write it to the repo if repo is provided
          if (repo) {
            await github.editFiles(owner, repo, 'main', [{ path: 'README.md', content: readme }], '📝 Update README via Miles');
            return `✅ README updated in ${owner}/${repo}`;
          }
          return readme;
        }
        case 'generate_pitch': {
          return kit.generatePitch({ name, problem, solution, techStack: stack || 'Next.js, Tailwind, TypeScript', impact });
        }
        case 'update_readme': {
          const featureArr = features ? features.split(',').map(f => f.trim()) : [];
          const readme = kit.generateReadme({ name: name || repo, description, stack, features: featureArr, demoUrl: demo_url });
          await github.editFiles(owner, repo, 'main', [{ path: 'README.md', content: readme }], '📝 Update README via Miles');
          return `✅ README updated in ${owner}/${repo}`;
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Hackathon Ops Error: ${err.message}`;
    }
  }
};
