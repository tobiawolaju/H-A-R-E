/**
 * sheets.js - Google Sheets Tool for Node.js Orchestrator
 */

const axios = require("axios");

const BACKEND_URL = "https://script.google.com/macros/s/AKfycbyBqYISAtiw_Ut_DOBkNyVmnsvyNA1jFVGeRau38qaz-ajNjd6QtijCUu5FYo_TUhOPew/exec";

async function apiCall(action, payload) {
  try {
    const res = await axios.post(BACKEND_URL, { action, payload });
    return res.data;
  } catch (err) {
    console.error(`[Sheets Error] Action: ${action}`, err.message);
    return { status: "error", message: err.message };
  }
}

/**
 * Project Management
 */
async function addProjectNode(project) {
  return apiCall("addProject", project);
}

async function updateStatus(id, newStatus) {
  return apiCall("updateStatus", { id, status: newStatus });
}

async function readSheet(tab, status) {
  const actionMap = {
    projects: "getProjects",
    history: "getHistory",
    monitoring: "getMonitoringRules",
    state: "getSystemState"
  };
  return apiCall(actionMap[tab] || "getProjects", { status });
}

/**
 * Conversation History
 */
async function logHistory(sessionId, role, content) {
  return apiCall("logHistory", { sessionId, role, content });
}

async function getHistory(sessionId, limit = 10) {
  return apiCall("getHistory", { sessionId, limit });
}

/**
 * Monitoring Rules
 */
async function addMonitoringRule(channelId, serverId, kbUrl) {
  return apiCall("addMonitoringRule", { channelId, serverId, kbUrl });
}

async function getMonitoringRules() {
  return apiCall("getMonitoringRules", {});
}

async function removeMonitoringRule(id) {
  return apiCall("removeMonitoringRule", { id });
}

/**
 * System State (Global settings like api_key_index)
 */
async function getState(key) {
  return apiCall("getSystemState", { key });
}

async function setState(key, value) {
  return apiCall("updateSystemState", { key, value });
}

/**
 * ADK Session Persistence
 */
async function logSessionEvent(payload) {
  return apiCall("logSessionEvent", payload);
}

async function updateSessionState(payload) {
  return apiCall("updateSessionState", payload);
}

async function getSessionData(payload) {
  return apiCall("getSessionData", payload);
}

module.exports = {
  addProjectNode,
  updateStatus,
  readSheet,
  logHistory,
  getHistory,
  addMonitoringRule,
  getMonitoringRules,
  removeMonitoringRule,
  getState,
  setState,
  logSessionEvent,
  updateSessionState,
  getSessionData
};
