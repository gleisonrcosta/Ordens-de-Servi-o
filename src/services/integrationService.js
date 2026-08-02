const crypto = require('crypto');
const db = require('../db');

async function getIntegration(name = 'whatsapp') {
  const [rows] = await db.execute('SELECT * FROM integrations WHERE name = ?', [name]);
  return rows[0] || null;
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

async function upsertIntegration(name, data) {
  const existing = await getIntegration(name);
  if (existing) {
    await db.execute(
      `UPDATE integrations
       SET whatsapp_api_url = ?, whatsapp_phone_number_id = ?, whatsapp_access_token = ?, webhook_token = ?, api_token = ?, active = ?
       WHERE name = ?`,
      [
        data.whatsappApiUrl || null,
        data.whatsappPhoneNumberId || null,
        data.whatsappAccessToken || null,
        data.webhookToken || null,
        data.apiToken || null,
        data.active ? 1 : 0,
        name
      ]
    );
    return getIntegration(name);
  }

  await db.execute(
    `INSERT INTO integrations
     (name, whatsapp_api_url, whatsapp_phone_number_id, whatsapp_access_token, webhook_token, api_token, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      data.whatsappApiUrl || null,
      data.whatsappPhoneNumberId || null,
      data.whatsappAccessToken || null,
      data.webhookToken || null,
      data.apiToken || null,
      data.active ? 1 : 0
    ]
  );
  return getIntegration(name);
}

module.exports = {
  getIntegration,
  generateToken,
  upsertIntegration
};
