const config = require('../config');
const { skill } = require('../utils/logger');

const optionalRequire = (name) => {
  try {
    return require(name);
  } catch {
    return null;
  }
};

const nodemailer = optionalRequire('nodemailer');
const imapflow = optionalRequire('imapflow');
const mailparser = optionalRequire('mailparser');

function ensureSmtpConfig() {
  if (!nodemailer) throw new Error('Missing dependency: nodemailer');
  if (!config.EMAIL_SMTP_HOST || !config.EMAIL_SMTP_USER || !config.EMAIL_SMTP_PASS) {
    throw new Error('Missing SMTP config. Set EMAIL_SMTP_HOST, EMAIL_SMTP_USER, and EMAIL_SMTP_PASS.');
  }
}

function ensureImapConfig() {
  if (!imapflow) throw new Error('Missing dependency: imapflow');
  if (!config.EMAIL_IMAP_HOST || !config.EMAIL_IMAP_USER || !config.EMAIL_IMAP_PASS) {
    throw new Error('Missing IMAP config. Set EMAIL_IMAP_HOST, EMAIL_IMAP_USER, and EMAIL_IMAP_PASS.');
  }
}

function createImapClient() {
  ensureImapConfig();
  return new imapflow.ImapFlow({
    host: config.EMAIL_IMAP_HOST,
    port: config.EMAIL_IMAP_PORT,
    secure: config.EMAIL_IMAP_SECURE,
    auth: {
      user: config.EMAIL_IMAP_USER,
      pass: config.EMAIL_IMAP_PASS
    }
  });
}

function createSmtpTransport() {
  ensureSmtpConfig();
  return nodemailer.createTransport({
    host: config.EMAIL_SMTP_HOST,
    port: config.EMAIL_SMTP_PORT,
    secure: config.EMAIL_SMTP_SECURE,
    auth: {
      user: config.EMAIL_SMTP_USER,
      pass: config.EMAIL_SMTP_PASS
    }
  });
}

async function sendEmail({ to, subject, text, html, cc, bcc, replyTo }) {
  const transport = createSmtpTransport();
  const result = await transport.sendMail({
    from: config.EMAIL_DEFAULT_FROM,
    to,
    subject,
    text,
    html,
    cc,
    bcc,
    replyTo
  });

  return JSON.stringify({
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected
  }, null, 2);
}

async function readEmails({ mailbox = 'INBOX', limit = 10, query = {} } = {}) {
  const client = createImapClient();
  await client.connect();
  const lock = await client.getMailboxLock(mailbox);
  try {
    const max = Math.max(1, Number(limit) || 10);
    const exists = client.mailbox.exists || 0;
    if (exists === 0) {
      return JSON.stringify({ mailbox, messages: [] }, null, 2);
    }

    let searchQuery = {};
    if (query.unseen) searchQuery.seen = false;
    if (query.from) searchQuery.from = query.from;
    if (query.subject) searchQuery.subject = query.subject;

    let messages = [];
    if (Object.keys(searchQuery).length > 0) {
      const uids = await client.search(searchQuery, { uid: true });
      const slice = uids.slice(-max);
      messages = await client.fetchAll(slice, { envelope: true, flags: true, source: true }, { uid: true });
    } else {
      const start = Math.max(1, exists - max + 1);
      messages = await client.fetchAll(`${start}:${exists}`, { envelope: true, flags: true, source: true });
    }

    const parsed = [];
    for (const message of messages) {
      let body = '';
      if (message.source && mailparser && typeof mailparser.simpleParser === 'function') {
        const parsedMessage = await mailparser.simpleParser(message.source);
        body = parsedMessage.text || parsedMessage.html || '';
      }

      parsed.push({
        uid: message.uid,
        seq: message.seq,
        subject: message.envelope?.subject || '',
        from: message.envelope?.from?.map((item) => item.address || item.name).filter(Boolean) || [],
        to: message.envelope?.to?.map((item) => item.address || item.name).filter(Boolean) || [],
        date: message.envelope?.date || null,
        flags: message.flags ? Array.from(message.flags) : [],
        bodyPreview: String(body).slice(0, 1000)
      });
    }

    return JSON.stringify({ mailbox, messages: parsed }, null, 2);
  } finally {
    lock.release();
    await client.logout();
  }
}

async function deleteEmail({ mailbox = 'INBOX', uid }) {
  if (!uid && uid !== 0) throw new Error('uid is required to delete an email');
  const client = createImapClient();
  await client.connect();
  const lock = await client.getMailboxLock(mailbox);
  try {
    await client.messageDelete(uid, { uid: true });
    return JSON.stringify({ mailbox, uid, deleted: true }, null, 2);
  } finally {
    lock.release();
    await client.logout();
  }
}

async function listMailboxes() {
  const client = createImapClient();
  await client.connect();
  try {
    const mailboxes = await client.list();
    const formatted = mailboxes.map((item) => ({
      path: item.path,
      name: item.name,
      flags: item.flags ? Array.from(item.flags) : [],
      subscribed: Boolean(item.subscribed)
    }));
    return JSON.stringify(formatted, null, 2);
  } finally {
    await client.logout();
  }
}

async function searchEmails({ mailbox = 'INBOX', query = {} } = {}) {
  const client = createImapClient();
  await client.connect();
  const lock = await client.getMailboxLock(mailbox);
  try {
    const uids = await client.search(query, { uid: true });
    return JSON.stringify({ mailbox, uids }, null, 2);
  } finally {
    lock.release();
    await client.logout();
  }
}

module.exports = {
  sendEmail,
  readEmails,
  deleteEmail,
  listMailboxes,
  searchEmails
};
