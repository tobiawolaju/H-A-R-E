const marketplace = require('../tools/skills-marketplace');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: 'skills_marketplace',
    description: 'Search, install, list, remove, check, and update skills from skills.sh using the Skills CLI.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['find', 'list', 'install', 'remove', 'check', 'update', 'list_local', 'reload_local'],
          description: 'Marketplace action to perform'
        },
        query: {
          type: 'string',
          description: 'Search query for finding skills'
        },
        source: {
          type: 'string',
          description: 'Skill package or repository, for example vercel-labs/agent-skills'
        },
        skill: {
          type: 'string',
          description: 'Specific skill name within a package when needed'
        }
      },
      required: ['action']
    }
  },

  execute: async (args, context) => {
    const { action, query, source, skill: skillName } = args;
    const orchestrator = context?.orchestrator;
    skill(`Skills Marketplace: ${action}`);

    try {
      switch (action) {
        case 'find':
          return await marketplace.findSkills(query);
        case 'list':
          return await marketplace.listSkills(source);
        case 'install': {
          const result = await marketplace.installSkill({ source, skill: skillName });
          if (orchestrator && typeof orchestrator.reloadSkills === 'function') {
            await orchestrator.reloadSkills();
          }
          return result;
        }
        case 'remove': {
          const result = await marketplace.removeSkill(source || skillName);
          if (orchestrator && typeof orchestrator.reloadSkills === 'function') {
            await orchestrator.reloadSkills();
          }
          return result;
        }
        case 'check':
          return await marketplace.checkSkills();
        case 'update':
          return await marketplace.updateSkills();
        case 'list_local': {
          const names = orchestrator && typeof orchestrator.getLoadedSkillNames === 'function'
            ? orchestrator.getLoadedSkillNames()
            : [];
          return JSON.stringify(names, null, 2);
        }
        case 'reload_local': {
          if (!orchestrator || typeof orchestrator.reloadSkills !== 'function') {
            return 'Error: local skill reload is unavailable.';
          }
          const loaded = await orchestrator.reloadSkills();
          return JSON.stringify(loaded, null, 2);
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Skills Marketplace Error: ${err.message}`;
    }
  }
};
