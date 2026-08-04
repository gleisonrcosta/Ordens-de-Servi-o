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

function buildUazapiConfig(integration) {
  if (!integration) return null;
  return {
    url: integration.whatsapp_api_url || 'https://agenciai43.uazapi.com/send/text',
    token: integration.whatsapp_access_token || '',
    active: Number(integration.active) === 1
  };
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

async function sendWhatsappText(integration, number, text) {
  const config = buildUazapiConfig(integration);
  if (!config || !config.active || !config.url || !config.token) {
    return { skipped: true };
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      token: config.token
    },
    body: JSON.stringify({
      number: normalizePhone(number),
      text
    })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Uazapi respondeu ${response.status}`);
  }

  return payload;
}

module.exports = {
  getIntegration,
  generateToken,
  upsertIntegration,
  sendWhatsappText,
  normalizePhone
};
