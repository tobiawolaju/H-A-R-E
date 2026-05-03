/**
 * skills/scheduler-ops.js
 * Exposes task scheduling to the LLM agent.
 */

const sched = require('../tools/scheduler');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: 'scheduler_ops',
    description: 'Schedule tasks to run in the future. Use this to: set follow-up reminders, delay outreach messages, or schedule any action to trigger after a set time. Examples: "Remind me to follow up with Alice in 2 hours", "Send a DM to @user in 30 minutes". ONLY available to MASTER user.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['schedule_in', 'list_tasks', 'cancel_task', 'cancel_all'],
          description: 'Scheduling action to perform'
        },
        label: {
          type: 'string',
          description: 'Human-readable description of the task'
        },
        minutes: {
          type: 'number',
          description: 'Number of minutes from now to schedule the task'
        },
        task_message: {
          type: 'string',
          description: 'The message/instruction to run when the timer fires (will be sent back to HARE as a command)'
        },
        platform: {
          type: 'string',
          enum: ['discord', 'telegram'],
          description: 'Platform for the scheduled message (defaults to discord)'
        },
        channel_id: {
          type: 'string',
          description: 'Channel ID for the scheduled event'
        },
        task_id: {
          type: 'string',
          description: 'Task ID to cancel (for cancel_task)'
        }
      },
      required: ['action']
    }
  },

  execute: async (args, context) => {
    const { userId, masterId } = context;
    if ((userId || '').toLowerCase() !== (masterId || '').toLowerCase()) {
      return 'Error: scheduler_ops is restricted to the Master user.';
    }

    const { action, label, minutes, task_message, platform = 'discord', channel_id, task_id } = args;
    skill(`Scheduler Ops: ${action}`);

    try {
      switch (action) {
        case 'schedule_in': {
          // Build a synthetic event that will be replayed
          const event = {
            platform,
            channelId: channel_id || 'scheduled',
            userId: masterId,
            content: task_message,
            reply: async (text) => {
              // When the scheduled task fires, we need a reply function
              // This will be replaced by the actual gateway when replayed
              console.log(`[Scheduler] Scheduled reply: ${text}`);
            },
            startTyping: async () => {}
          };
          return await sched.scheduleIn(label || task_message, minutes, event);
        }
        case 'list_tasks': {
          return sched.listTasks();
        }
        case 'cancel_task': {
          return await sched.cancelTask(task_id);
        }
        case 'cancel_all': {
          return await sched.cancelAll();
        }
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Scheduler Ops Error: ${err.message}`;
    }
  }
};
