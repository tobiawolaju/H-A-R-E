/**
 * skills/monad_ops.js
 * Specialized skill for hunting bounties and alpha in the Monad ecosystem.
 */

const scraper = require('../tools/scraper');
const { search } = require('../tools/search');
const { skill } = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

const JOBS_FILE = path.join(process.cwd(), '.mini-miles', 'jobs.json');

module.exports = {
  definition: {
    name: "monad_ops",
    description: "Search for bounties, gigs, and ecosystem news within the Monad blockchain ecosystem. Use this to find $200+ opportunities and high-impact community discussions.",
    parameters: {
      type: "object",
      properties: {
        action: { 
          type: "string", 
          enum: ['hunt_bounties', 'track_ecosystem', 'log_job', 'get_jobs'],
          description: "Action to perform"
        },
        query: { type: "string", description: "Specific topic or project to hunt for" },
        job_data: {
          type: "object",
          description: "Data for logging a job (id, title, reward, platform, link)"
        }
      },
      required: ["action"]
    }
  },

  execute: async (args) => {
    const { action, query, job_data } = args;
    skill(`Monad Ops: ${action}`);

    try {
      switch (action) {
        case 'hunt_bounties': {
          const q = query ? `Monad blockchain ${query} bounties` : "Monad blockchain bounties $200";
          const results = await search(q);
          return JSON.stringify(results, null, 2);
        }
        case 'track_ecosystem': {
          const results = await search("Monad ecosystem latest projects and news");
          return JSON.stringify(results, null, 2);
        }
        case 'log_job': {
          await fs.ensureFile(JOBS_FILE);
          let jobs = [];
          try { jobs = await fs.readJson(JOBS_FILE); } catch(e) { jobs = []; }
          jobs.push({ ...job_data, status: 'shortlisted', timestamp: new Date().toISOString() });
          await fs.writeJson(JOBS_FILE, jobs, { spaces: 2 });
          return `✅ Job logged: ${job_data.title}`;
        }
        case 'get_jobs': {
          if (!await fs.pathExists(JOBS_FILE)) return "No jobs logged yet.";
          const jobs = await fs.readJson(JOBS_FILE);
          return JSON.stringify(jobs, null, 2);
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Monad Ops Error: ${err.message}`;
    }
  }
};
