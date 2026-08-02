CREATE DATABASE IF NOT EXISTS ordens_servico CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ordens_servico;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone)
);

CREATE TABLE IF NOT EXISTS service_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  os_number VARCHAR(20) NOT NULL,
  company_name VARCHAR(160) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  on_site_contact VARCHAR(160) NOT NULL,
  problem_description TEXT NOT NULL,
  status ENUM('open', 'in_progress', 'waiting_client', 'done', 'canceled') NOT NULL DEFAULT 'open',
  opened_by_user_id BIGINT UNSIGNED NULL,
  source ENUM('system', 'whatsapp') NOT NULL DEFAULT 'system',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_orders_number (os_number),
  KEY idx_service_orders_status (status),
  KEY idx_service_orders_created_at (created_at),
  CONSTRAINT fk_service_orders_user FOREIGN KEY (opened_by_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS service_order_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_order_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_events_service_order_id (service_order_id),
  CONSTRAINT fk_events_service_order FOREIGN KEY (service_order_id) REFERENCES service_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_events_actor_user FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  service_order_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('in_app', 'whatsapp', 'email', 'system') NOT NULL DEFAULT 'in_app',
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user (recipient_user_id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_service_order FOREIGN KEY (service_order_id) REFERENCES service_orders (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS integrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  whatsapp_api_url VARCHAR(255) NULL,
  whatsapp_phone_number_id VARCHAR(80) NULL,
  whatsapp_access_token TEXT NULL,
  webhook_token VARCHAR(128) NULL,
  api_token VARCHAR(128) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_integrations_name (name)
);
