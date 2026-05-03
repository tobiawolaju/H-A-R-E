const email = require('../tools/email');
const { skill } = require('../utils/logger');

module.exports = {
  definition: {
    name: 'email_ops',
    description: 'Send, read, search, and delete email using SMTP and IMAP credentials from environment variables.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['send_email', 'read_emails', 'delete_email', 'list_mailboxes', 'search_emails'],
          description: 'Email action to perform'
        },
        to: { type: 'string', description: 'Recipient email address or comma-separated list' },
        subject: { type: 'string', description: 'Email subject' },
        text: { type: 'string', description: 'Plain-text body' },
        html: { type: 'string', description: 'HTML body' },
        cc: { type: 'string', description: 'CC recipients' },
        bcc: { type: 'string', description: 'BCC recipients' },
        replyTo: { type: 'string', description: 'Reply-to address' },
        mailbox: { type: 'string', description: 'Mailbox name, usually INBOX' },
        limit: { type: 'number', description: 'Max messages to read' },
        uid: { type: 'number', description: 'UID of the email to delete' },
        query: {
          type: 'object',
          description: 'IMAP search query, for example { unseen: true }'
        }
      },
      required: ['action']
    }
  },

  execute: async (args) => {
    const { action } = args;
    skill(`Email Ops: ${action}`);

    try {
      switch (action) {
        case 'send_email':
          return await email.sendEmail(args);
        case 'read_emails':
          return await email.readEmails(args);
        case 'delete_email':
          return await email.deleteEmail(args);
        case 'list_mailboxes':
          return await email.listMailboxes();
        case 'search_emails':
          return await email.searchEmails(args);
        default:
          return `Error: Unknown action ${action}`;
      }
    } catch (err) {
      return `Email Ops Error: ${err.message}`;
    }
  }
};
