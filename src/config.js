require('dotenv').config();

module.exports = {
  port: process.env.PORT || process.env.port || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'ordens_servico'
  },
  whatsappWebhookToken: process.env.WHATSAPP_WEBHOOK_TOKEN || 'dev-token',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000'
};
