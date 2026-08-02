const db = require('../db');

function generateOSNumber(id) {
  const year = new Date().getFullYear().toString().slice(-2);
  return `OS${year}${String(id).padStart(6, '0')}`;
}

async function createServiceOrder(input, openedByUserId = null, source = 'system') {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO service_orders
       (os_number, company_name, contact_phone, on_site_contact, problem_description, status, opened_by_user_id, source)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      ['', input.companyName, input.contactPhone, input.onSiteContact, input.problemDescription, openedByUserId, source]
    );

    const id = result.insertId;
    const osNumber = generateOSNumber(id);
    await conn.execute('UPDATE service_orders SET os_number = ? WHERE id = ?', [osNumber, id]);
    await conn.execute(
      `INSERT INTO service_order_events (service_order_id, actor_user_id, event_type, message)
       VALUES (?, ?, 'created', ?)`,
      [id, openedByUserId, `Ordem de serviço criada com status aberto.`]
    );

    await conn.commit();
    return { id, osNumber };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function addOrderEvent(serviceOrderId, actorUserId, eventType, message) {
  await db.execute(
    `INSERT INTO service_order_events (service_order_id, actor_user_id, event_type, message)
     VALUES (?, ?, ?, ?)`,
    [serviceOrderId, actorUserId, eventType, message]
  );
}

async function addOrderComment(serviceOrderId, actorUserId, comment) {
  const cleanComment = String(comment || '').trim();
  if (!cleanComment) return;
  await addOrderEvent(serviceOrderId, actorUserId, 'comment', cleanComment);
}

async function notifyAdmins(serviceOrderId, title, body) {
  const [admins] = await db.execute("SELECT id FROM users WHERE role = 'admin' AND active = 1");
  for (const admin of admins) {
    await db.execute(
      `INSERT INTO notifications (recipient_user_id, service_order_id, channel, title, body)
       VALUES (?, ?, 'in_app', ?, ?)`,
      [admin.id, serviceOrderId, title, body]
    );
  }
}

async function notifyUser(serviceOrderId, userId, title, body) {
  if (!userId) return;
  await db.execute(
    `INSERT INTO notifications (recipient_user_id, service_order_id, channel, title, body)
     VALUES (?, ?, 'in_app', ?, ?)`,
    [userId, serviceOrderId, title, body]
  );
}

async function getServiceOrderById(id) {
  const [rows] = await db.execute(
    `SELECT so.*, u.name AS opened_by_name, u.phone AS opened_by_phone
     FROM service_orders so
     LEFT JOIN users u ON u.id = so.opened_by_user_id
     WHERE so.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function getRecentOrders(limit = 10) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 10;
  const [rows] = await db.execute(
    `SELECT id, os_number, company_name, status, source, created_at
     FROM service_orders
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`
  );
  return rows;
}

module.exports = {
  createServiceOrder,
  addOrderEvent,
  addOrderComment,
  notifyAdmins,
  notifyUser,
  getServiceOrderById,
  getRecentOrders
};
