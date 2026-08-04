const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const dayjs = require('dayjs');
const config = require('./config');
const { requireAuth, requireAdmin } = require('./middleware/auth');
const authService = require('./services/authService');
const orderService = require('./services/orderService');
const integrationService = require('./services/integrationService');
const db = require('./db');

const app = express();

app.set('view engine', 'ejs');
app.set('views', require('path').join(__dirname, 'views'));

app.use(helmet());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(require('path').join(__dirname, '..', 'public')));
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.dayjs = dayjs;
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  return res.redirect('/login');
});

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await authService.findUserByPhone(String(phone || '').trim());
    if (!user) return res.status(401).render('login', { error: 'Usuário não encontrado.' });
    const ok = await authService.verifyPassword(user, password || '');
    if (!ok) return res.status(401).render('login', { error: 'Senha inválida.' });
    req.session.user = { id: user.id, name: user.name, phone: user.phone, role: user.role };
    return res.redirect('/dashboard');
  } catch (error) {
    return res.status(500).render('login', { error: 'Erro ao autenticar.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/dashboard', requireAuth, async (req, res) => {
  const [stats] = await db.execute(`
    SELECT
      SUM(status = 'open') AS openCount,
      SUM(status = 'in_progress') AS progressCount,
      SUM(status = 'canceled') AS canceledCount,
      SUM(status = 'done') AS doneCount
    FROM service_orders
  `);
  const orders = await orderService.getRecentOrders(8);
  res.render('dashboard', { stats: stats[0], orders });
});

app.get('/orders/new', requireAuth, (req, res) => res.render('orders-new', { error: null }));

app.post('/orders', requireAuth, async (req, res) => {
  try {
    const input = {
      companyName: req.body.companyName,
      contactPhone: req.body.contactPhone,
      onSiteContact: req.body.onSiteContact,
      problemDescription: req.body.problemDescription
    };
    const created = await orderService.createServiceOrder(input, req.session.user.id, 'system');
    const order = await orderService.getServiceOrderById(created.id);
    const body = `OS ${order.os_number} aberta para ${order.company_name}. Contato: ${order.contact_phone}. Local: ${order.on_site_contact}. Problema: ${order.problem_description}`;
    await orderService.notifyAdmins(order.id, `Nova OS ${order.os_number}`, body);
    await orderService.notifyUser(order.id, req.session.user.id, `OS ${order.os_number} aberta`, body);
    await orderService.addOrderEvent(order.id, req.session.user.id, 'created', 'Ordem aberta via sistema.');

    const integration = await integrationService.getIntegration('whatsapp');
    const targets = await orderService.getNotificationTargetsForOrder(order.id);
    for (const target of targets) {
      if (!target.phone) continue;
      try {
        await integrationService.sendWhatsappText(
          integration,
          target.phone,
          `Nova OS ${order.os_number}\nEmpresa: ${order.company_name}\nWhatsApp: ${order.contact_phone}\nResponsável no local: ${order.on_site_contact}\nProblema: ${order.problem_description}`
        );
      } catch (error) {
        console.error('Falha ao enviar WhatsApp para criação da OS:', error.message);
      }
    }
    res.redirect(`/orders/${order.id}`);
  } catch (error) {
    res.status(500).render('orders-new', { error: 'Não foi possível abrir a ordem de serviço.' });
  }
});

app.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await orderService.getServiceOrderById(req.params.id);
  if (!order) return res.status(404).send('OS não encontrada.');
  const [events] = await db.execute(
    `SELECT e.*, u.name AS actor_name
     FROM service_order_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.service_order_id = ?
     ORDER BY e.created_at ASC`,
    [req.params.id]
  );
  res.render('order-detail', { order, events, error: null });
});

app.post('/orders/:id/comments', requireAuth, async (req, res) => {
  const order = await orderService.getServiceOrderById(req.params.id);
  if (!order) return res.status(404).send('OS não encontrada.');

  const status = String(req.body.status || '').trim();
  const comment = String(req.body.comment || '').trim();
  const allowed = new Set(['open', 'in_progress', 'waiting_client', 'done', 'canceled']);

  const [events] = await db.execute(
    `SELECT e.*, u.name AS actor_name
     FROM service_order_events e
     LEFT JOIN users u ON u.id = e.actor_user_id
     WHERE e.service_order_id = ?
     ORDER BY e.created_at ASC`,
    [req.params.id]
  );

  try {
    if (status && !allowed.has(status)) {
      return res.status(400).render('order-detail', {
        order,
        events,
        error: 'Status inválido.'
      });
    }

    if (status && status !== order.status) {
      await db.execute('UPDATE service_orders SET status = ? WHERE id = ?', [status, req.params.id]);
      const statusMessage = `Status atualizado para ${status} na OS ${order.os_number}.`;
      await orderService.addOrderEvent(req.params.id, req.session.user.id, 'status_changed', statusMessage);
      await orderService.notifyAdmins(req.params.id, `OS ${order.os_number} atualizada`, statusMessage);
      if (order.opened_by_user_id) {
        await orderService.notifyUser(req.params.id, order.opened_by_user_id, `OS ${order.os_number} atualizada`, statusMessage);
      }
    }

    if (comment) {
      await orderService.addOrderComment(req.params.id, req.session.user.id, comment);
      const commentMessage = `Novo comentário adicionado na OS ${order.os_number}.`;
      await orderService.notifyAdmins(req.params.id, `Comentário na OS ${order.os_number}`, commentMessage);
      if (order.opened_by_user_id) {
        await orderService.notifyUser(req.params.id, order.opened_by_user_id, `Comentário na OS ${order.os_number}`, commentMessage);
      }
    }

    const integration = await integrationService.getIntegration('whatsapp');
    const targets = await orderService.getNotificationTargetsForOrder(order.id);
    for (const target of targets) {
      if (!target.phone) continue;
      try {
        const lines = [`OS ${order.os_number} atualizada`];
        if (status && status !== order.status) lines.push(`Novo status: ${status}`);
        if (comment) lines.push(`Comentário: ${comment}`);
        await integrationService.sendWhatsappText(integration, target.phone, lines.join('\n'));
      } catch (error) {
        console.error('Falha ao enviar WhatsApp na atualização da OS:', error.message);
      }
    }

    return res.redirect(`/orders/${req.params.id}`);
  } catch (error) {
    return res.status(500).render('order-detail', {
      order,
      events,
      error: 'Não foi possível salvar a interação.'
    });
  }
});

app.get('/admin', requireAdmin, async (req, res) => {
  const orders = await orderService.getRecentOrders(20);
  const [notifications] = await db.execute(
    `SELECT n.*, so.os_number
     FROM notifications n
     JOIN service_orders so ON so.id = n.service_order_id
     WHERE n.recipient_user_id = ?
     ORDER BY n.created_at DESC
     LIMIT 20`,
    [req.session.user.id]
  );
  const users = await authService.getUsers();
  res.render('admin', { orders, notifications, users });
});

app.get('/admin/integrations', requireAdmin, async (req, res) => {
  const integration = await integrationService.getIntegration('whatsapp');
  res.render('integrations', {
    integration: integration || {
      name: 'whatsapp',
      whatsapp_api_url: '',
      whatsapp_phone_number_id: '',
      whatsapp_access_token: '',
      webhook_token: '',
      api_token: '',
      active: 1
    },
    generatedToken: null,
    error: null
  });
});

app.post('/admin/integrations', requireAdmin, async (req, res) => {
  try {
    const keepApiToken = String(req.body.keepApiToken || '') === 'on';
    const existing = await integrationService.getIntegration('whatsapp');
    const apiToken = keepApiToken && existing?.api_token ? existing.api_token : (existing?.api_token || integrationService.generateToken());
    const saved = await integrationService.upsertIntegration('whatsapp', {
      whatsappApiUrl: String(req.body.whatsappApiUrl || '').trim(),
      whatsappPhoneNumberId: String(req.body.whatsappPhoneNumberId || '').trim(),
      whatsappAccessToken: String(req.body.whatsappAccessToken || '').trim(),
      webhookToken: String(req.body.webhookToken || '').trim(),
      apiToken,
      active: req.body.active === 'on'
    });
    return res.render('integrations', {
      integration: saved,
      generatedToken: null,
      error: null
    });
  } catch (error) {
    const integration = await integrationService.getIntegration('whatsapp');
    return res.status(500).render('integrations', {
      integration: integration || {
        name: 'whatsapp',
        whatsapp_api_url: req.body.whatsappApiUrl || '',
        whatsapp_phone_number_id: req.body.whatsappPhoneNumberId || '',
        whatsapp_access_token: req.body.whatsappAccessToken || '',
        webhook_token: req.body.webhookToken || '',
        api_token: '',
        active: req.body.active === 'on'
      },
      generatedToken: null,
      error: 'Não foi possível salvar as integrações.'
    });
  }
});

app.post('/admin/integrations/token', requireAdmin, async (req, res) => {
  const current = await integrationService.getIntegration('whatsapp');
  const apiToken = integrationService.generateToken();
  const saved = await integrationService.upsertIntegration('whatsapp', {
    whatsappApiUrl: current?.whatsapp_api_url || '',
    whatsappPhoneNumberId: current?.whatsapp_phone_number_id || '',
    whatsappAccessToken: current?.whatsapp_access_token || '',
    webhookToken: current?.webhook_token || '',
    apiToken,
    active: current ? current.active === 1 : true
  });
  return res.render('integrations', {
    integration: saved,
    generatedToken: apiToken,
    error: null
  });
});

app.get('/admin/users/new', requireAdmin, (req, res) => {
  res.render('admin-user-form', {
    title: 'Novo Usuário',
    action: '/admin/users',
    user: { name: '', phone: '', role: 'user', active: true },
    error: null
  });
});

app.post('/admin/users', requireAdmin, async (req, res) => {
  try {
    const { name, phone, password, role } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).render('admin-user-form', {
        title: 'Novo Usuário',
        action: '/admin/users',
        user: { name, phone, role: role || 'user', active: true },
        error: 'Preencha nome, telefone e senha.'
      });
    }
    await authService.createUser({
      name: String(name).trim(),
      phone: String(phone).trim(),
      password: String(password),
      role: role === 'admin' ? 'admin' : 'user'
    });
    return res.redirect('/admin');
  } catch (error) {
    return res.status(500).render('admin-user-form', {
      title: 'Novo Usuário',
      action: '/admin/users',
      user: { name: req.body.name || '', phone: req.body.phone || '', role: req.body.role || 'user', active: true },
      error: 'Não foi possível criar o usuário.'
    });
  }
});

app.get('/admin/users/:id/edit', requireAdmin, async (req, res) => {
  const user = await authService.getUserById(req.params.id);
  if (!user) return res.status(404).send('Usuário não encontrado.');
  res.render('admin-user-form', {
    title: 'Editar Usuário',
    action: `/admin/users/${user.id}`,
    user,
    error: null
  });
});

app.post('/admin/users/:id', requireAdmin, async (req, res) => {
  const existing = await authService.getUserById(req.params.id);
  if (!existing) return res.status(404).send('Usuário não encontrado.');
  try {
    await authService.updateUser(req.params.id, {
      name: String(req.body.name || '').trim(),
      phone: String(req.body.phone || '').trim(),
      password: String(req.body.password || '').trim() || null,
      role: req.body.role === 'admin' ? 'admin' : 'user',
      active: req.body.active === 'on'
    });
    return res.redirect('/admin');
  } catch (error) {
    return res.status(500).render('admin-user-form', {
      title: 'Editar Usuário',
      action: `/admin/users/${req.params.id}`,
      user: existing,
      error: 'Não foi possível atualizar o usuário.'
    });
  }
});

app.post('/admin/users/:id/toggle', requireAdmin, async (req, res) => {
  const user = await authService.getUserById(req.params.id);
  if (!user) return res.status(404).send('Usuário não encontrado.');
  if (Number(req.session.user.id) === Number(user.id)) {
    return res.status(400).send('Você não pode desativar seu próprio usuário.');
  }
  await authService.updateUser(req.params.id, {
    name: user.name,
    phone: user.phone,
    password: null,
    role: user.role,
    active: !user.active
  });
  return res.redirect('/admin');
});

app.post('/admin/users/:id/delete', requireAdmin, async (req, res) => {
  const user = await authService.getUserById(req.params.id);
  if (!user) return res.status(404).send('Usuário não encontrado.');
  if (Number(req.session.user.id) === Number(user.id)) {
    return res.status(400).send('Você não pode excluir seu próprio usuário.');
  }
  if (user.role === 'admin') {
    const activeAdmins = await authService.countActiveAdmins();
    if (activeAdmins <= 1) {
      return res.status(400).send('Não é possível excluir o último administrador ativo.');
    }
  }
  await authService.deleteUser(req.params.id);
  return res.redirect('/admin');
});

app.post('/api/webhook/whatsapp/os', async (req, res) => {
  try {
    const integration = await integrationService.getIntegration('whatsapp');
    const token = req.headers['x-webhook-token'] || req.headers['x-api-token'];
    const allowedToken = integration?.webhook_token || config.whatsappWebhookToken || integration?.api_token;
    if (!allowedToken || token !== allowedToken) {
      return res.status(401).json({ error: 'invalid token' });
    }
    const { companyName, contactPhone, onSiteContact, problemDescription } = req.body;
    const created = await orderService.createServiceOrder(
      { companyName, contactPhone, onSiteContact, problemDescription },
      null,
      'whatsapp'
    );
    const order = await orderService.getServiceOrderById(created.id);
    const body = `OS ${order.os_number} aberta via WhatsApp para ${order.company_name}. Contato: ${order.contact_phone}. Local: ${order.on_site_contact}. Problema: ${order.problem_description}`;
    await orderService.notifyAdmins(order.id, `Nova OS ${order.os_number}`, body);
    return res.json({
      success: true,
      message: `Ordem de serviço ${order.os_number} aberta com sucesso.`,
      order: {
        number: order.os_number,
        companyName: order.company_name,
        contactPhone: order.contact_phone,
        onSiteContact: order.on_site_contact,
        problemDescription: order.problem_description,
        status: order.status
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'failed to create service order' });
  }
});

app.post('/api/orders/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const allowed = new Set(['open', 'in_progress', 'waiting_client', 'done', 'canceled']);
  if (!allowed.has(status)) return res.status(400).json({ error: 'status inválido' });
  const order = await orderService.getServiceOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'OS não encontrada' });
  await db.execute('UPDATE service_orders SET status = ? WHERE id = ?', [status, req.params.id]);
  const message = `Status atualizado para ${status} na OS ${order.os_number}.`;
  await orderService.addOrderEvent(req.params.id, req.session.user.id, 'status_changed', message);
  await orderService.notifyAdmins(req.params.id, `OS ${order.os_number} atualizada`, message);
  if (order.opened_by_user_id) {
    await orderService.notifyUser(req.params.id, order.opened_by_user_id, `OS ${order.os_number} atualizada`, message);
  }
  res.json({ success: true });
});

module.exports = app;
