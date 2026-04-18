// ======== Utility ========
function getSheet(tabName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    // Add headers for new tabs
    if (tabName === "adk_events") {
      sheet.appendRow(["Timestamp", "SessionID", "AppName", "UserId", "EventJSON"]);
    } else if (tabName === "adk_sessions") {
      sheet.appendRow(["GlobalID", "SessionID", "AppName", "UserId", "StateJSON"]);
    } else if (tabName === "history") {
      sheet.appendRow(["Timestamp", "SessionID", "Role", "Content"]);
    } else if (tabName === "monitoring_rules") {
      sheet.appendRow(["ID", "ChannelID", "ServerID", "KbUrl", "Status"]);
    } else if (tabName === "system_state") {
      sheet.appendRow(["Key", "Value"]);
    }
  }
  return sheet;
}

// ======== Generic tab read ========
function getTab(tabName) {
  const tab = getSheet(tabName);
  const data = tab.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data.shift();
  return data.map(row => headers.reduce((obj, key, idx) => ({ ...obj, [key]: row[idx] }), {}));
}

// ======== API Endpoints ========

// Projects
function addProject(project) {
  const tab = getSheet("projects");
  tab.appendRow([
    project.id, project.name, project.x_handle || "", project.website || "", project.discord || "",
    project.bounty || "", project.desc, project.activity_score || "", project.funding || "",
    project.tech_score || "", project.pain_guess || "", project.status || "scraped"
  ]);
  return { status: "ok" };
}

function updateStatus(projectId, newStatus) {
  const tab = getSheet("projects");
  const data = tab.getDataRange().getValues();
  if (data.length <= 1) return { status: "not_found" };
  const headers = data[0];
  const idCol = headers.indexOf("id");
  const statusCol = headers.indexOf("status");

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === projectId) {
      tab.getRange(i + 1, statusCol + 1).setValue(newStatus);
      return { status: "ok", updated: projectId, newStatus: newStatus };
    }
  }
  return { status: "not_found", id: projectId };
}

function getProjects(status) {
  const rows = getTab("projects");
  return rows.filter(r => !status || r.status === status);
}

// History
function logHistory(payload) {
  const tab = getSheet("history");
  tab.appendRow([new Date(), payload.sessionId, payload.role, payload.content]);
  return { status: "ok" };
}

function getHistory(payload) {
  const tab = getSheet("history");
  const data = tab.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  const headers = data.shift();
  const sessionIdCol = headers.indexOf("SessionID");
  
  const history = data
    .filter(row => row[sessionIdCol] === payload.sessionId)
    .map(row => ({
      timestamp: row[0],
      role: row[2],
      content: row[3]
    }));
    
  const limit = payload.limit || 10;
  return history.slice(-limit);
}

// System State
function updateSystemState(payload) {
  const tab = getSheet("system_state");
  const data = tab.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === payload.key) {
      tab.getRange(i + 1, 2).setValue(payload.value);
      return { status: "ok", updated: payload.key };
    }
  }
  tab.appendRow([payload.key, payload.value]);
  return { status: "ok", created: payload.key };
}

function getSystemState(payload) {
  const rows = getTab("system_state");
  const match = rows.find(r => r.Key === payload.key);
  return match ? { value: match.Value } : { value: null };
}

// Monitoring Rules
function addMonitoringRule(payload) {
  const tab = getSheet("monitoring_rules");
  const id = `${payload.channelId || payload.serverId}_${new Date().getTime()}`;
  tab.appendRow([id, payload.channelId || "", payload.serverId || "", payload.kbUrl, "active"]);
  return { status: "ok", id: id };
}

function getMonitoringRules() {
  return getTab("monitoring_rules").filter(r => r.Status === "active");
}

function removeMonitoringRule(payload) {
  const tab = getSheet("monitoring_rules");
  const data = tab.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("ID");
  const statusCol = headers.indexOf("Status");

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === payload.id) {
      tab.getRange(i + 1, statusCol + 1).setValue("inactive");
      return { status: "ok", removed: payload.id };
    }
  }
  return { status: "not_found", id: payload.id };
}

// ADK Sessions
function logSessionEvent(payload) {
  const tab = getSheet("adk_events");
  tab.appendRow([new Date(), payload.sessionId, payload.appName, payload.userId, JSON.stringify(payload.event)]);
  return { status: "ok" };
}

function updateSessionState(payload) {
  const tab = getSheet("adk_sessions");
  const data = tab.getDataRange().getValues();
  const id = `${payload.appName}_${payload.userId}_${payload.id}`;
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      tab.getRange(i + 1, 5).setValue(JSON.stringify(payload.state));
      return { status: "ok", updated: id };
    }
  }
  
  tab.appendRow([id, payload.id, payload.appName, payload.userId, JSON.stringify(payload.state)]);
  return { status: "ok", created: id };
}

function getSessionData(payload) {
  const id = `${payload.appName}_${payload.userId}_${payload.sessionId}`;
  const sessionTab = getSheet("adk_sessions");
  const sessionRows = sessionTab.getDataRange().getValues();
  let state = {};
  for (let i = 1; i < sessionRows.length; i++) {
    if (sessionRows[i][0] === id) {
      state = JSON.parse(sessionRows[i][4]);
      break;
    }
  }
  
  const eventTab = getSheet("adk_events");
  const eventRows = eventTab.getDataRange().getValues();
  const events = [];
  for (let i = 1; i < eventRows.length; i++) {
    if (eventRows[i][1] === payload.sessionId) {
      events.push(JSON.parse(eventRows[i][4]));
    }
  }
  
  return { id: payload.sessionId, appName: payload.appName, userId: payload.userId, state: state, events: events };
}

// ======== Web App Entry ========
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const { action, payload } = body;

  try {
    switch (action) {
      case "addProject": return respond(addProject(payload));
      case "updateStatus": return respond(updateStatus(payload.id, payload.status));
      case "getProjects": return respond(getProjects(payload.status));
      
      case "logHistory": return respond(logHistory(payload));
      case "getHistory": return respond(getHistory(payload));

      case "updateSystemState": return respond(updateSystemState(payload));
      case "getSystemState": return respond(getSystemState(payload));

      case "addMonitoringRule": return respond(addMonitoringRule(payload));
      case "getMonitoringRules": return respond(getMonitoringRules());
      case "removeMonitoringRule": return respond(removeMonitoringRule(payload));
      
      case "logSessionEvent": return respond(logSessionEvent(payload));
      case "updateSessionState": return respond(updateSessionState(payload));
      case "getSessionData": return respond(getSessionData(payload));

      default: return respond({ status: "unknown_action", action });
    }
  } catch (err) {
    return respond({ status: "error", message: err.toString() });
  }
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
