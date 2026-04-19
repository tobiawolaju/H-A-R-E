/**
 * scheduler.js
 * In-memory task scheduler for timed tasks (follow-ups, reminders, delayed outreach).
 * Tasks survive restarts if persisted to disk.
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { log, error } = require('../utils/logger');

const TASKS_FILE = path.resolve('./.mini-miles/scheduled_tasks.json');
const tasks = new Map(); // id -> { id, label, runAt, action, args, done }
let orchestratorRef = null;

function setOrchestrator(orch) {
  orchestratorRef = orch;
}

async function _saveTasks() {
  try {
    const arr = Array.from(tasks.values());
    await fs.writeFile(TASKS_FILE, JSON.stringify(arr, null, 2), 'utf8');
  } catch (err) {
    error('Scheduler: Failed to save tasks:', err.message);
  }
}

async function _loadTasks() {
  try {
    if (fsSync.existsSync(TASKS_FILE)) {
      const raw = await fs.readFile(TASKS_FILE, 'utf8');
      const arr = JSON.parse(raw);
      for (const task of arr) {
        if (!task.done && new Date(task.runAt) > new Date()) {
          tasks.set(task.id, task);
          _scheduleTimer(task);
        }
      }
      log(`Scheduler: Loaded ${tasks.size} pending tasks.`);
    }
  } catch (err) {
    error('Scheduler: Failed to load tasks:', err.message);
  }
}

function _scheduleTimer(task) {
  const delay = new Date(task.runAt) - Date.now();
  if (delay < 0) return; // Past tasks are skipped
  setTimeout(async () => {
    // Check if task was cancelled before the timer fired
    const currentTask = tasks.get(task.id);
    if (!currentTask || currentTask.done) {
      log(`Scheduler: Task "${task.label}" was cancelled or completed, skipping execution.`);
      return;
    }

    log(`Scheduler: Running task "${task.label}"`);
    task.done = true;
    tasks.set(task.id, task);
    await _saveTasks();

    if (orchestratorRef && task.event) {
      // Replay the event into the orchestrator
      await orchestratorRef.handleEvent(task.event);
    }
  }, delay);
}

/**
 * Schedule a task to run at a specific time.
 * @param {string} label - Human-readable label
 * @param {Date|string} runAt - When to run (ISO string or Date)
 * @param {object} event - The orchestrator event to replay
 */
async function schedule(label, runAt, event) {
  const id = `task_${Date.now()}`;
  const task = { id, label, runAt: new Date(runAt).toISOString(), event, done: false };
  tasks.set(id, task);
  _scheduleTimer(task);
  await _saveTasks();
  return `✅ Task "${label}" scheduled for ${new Date(runAt).toLocaleString()}`;
}

/**
 * Schedule something to run in N minutes from now.
 */
async function scheduleIn(label, minutes, event) {
  const runAt = new Date(Date.now() + minutes * 60 * 1000);
  return schedule(label, runAt, event);
}

/**
 * List all pending tasks.
 */
function listTasks() {
  const pending = Array.from(tasks.values()).filter(t => !t.done);
  if (pending.length === 0) return 'No pending tasks.';
  return pending.map(t =>
    `• [${t.id}] "${t.label}" → runs at ${new Date(t.runAt).toLocaleString()}`
  ).join('\n');
}

/**
 * Cancel ALL pending tasks at once (nuclear stop).
 */
async function cancelAll() {
  let count = 0;
  for (const [id, task] of tasks.entries()) {
    if (!task.done) {
      task.done = true;
      count++;
    }
  }
  await _saveTasks();
  return count > 0 ? `✅ Cancelled ${count} pending tasks.` : 'No pending tasks to cancel.';
}

/**
 * Cancel a task by ID.
 */
async function cancelTask(id) {
  if (tasks.has(id)) {
    tasks.get(id).done = true;
    await _saveTasks();
    return `✅ Task ${id} cancelled.`;
  }
  return `❌ Task ${id} not found.`;
}

// Load persisted tasks on startup
_loadTasks();

module.exports = { schedule, scheduleIn, listTasks, cancelTask, cancelAll, setOrchestrator };
