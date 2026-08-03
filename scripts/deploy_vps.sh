#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Execute este script como root ou com sudo."
  exit 1
fi

APP_NAME="${APP_NAME:-ordens-servico}"
APP_DIR="${APP_DIR:-/opt/ordens-servico}"
APP_USER="${APP_USER:-www-data}"
NODE_MAJOR="${NODE_MAJOR:-20}"
PORT="${PORT:-3000}"
MYSQL_DB="${MYSQL_DB:-ordens_servico}"
MYSQL_USER="${MYSQL_USER:-ordens_user}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
SESSION_SECRET="${SESSION_SECRET:-}"
WHATSAPP_WEBHOOK_TOKEN="${WHATSAPP_WEBHOOK_TOKEN:-}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_NAME="${ADMIN_NAME:-Administrador}"
ADMIN_PHONE="${ADMIN_PHONE:-11999999999}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

if [[ -z "$MYSQL_PASSWORD" || -z "$SESSION_SECRET" || -z "$WHATSAPP_WEBHOOK_TOKEN" ]]; then
  cat <<EOF
Defina estas variáveis antes de rodar:
  MYSQL_PASSWORD
  SESSION_SECRET
  WHATSAPP_WEBHOOK_TOKEN

Opcional:
  APP_NAME, APP_DIR, APP_USER, PORT, BASE_URL, ADMIN_NAME, ADMIN_PHONE, ADMIN_PASSWORD
EOF
  exit 1
fi

echo "[1/9] Atualizando sistema..."
apt-get update -y
apt-get upgrade -y

echo "[2/9] Instalando dependências base..."
apt-get install -y curl git nginx mysql-server

echo "[3/9] Instalando Node.js ${NODE_MAJOR}..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
apt-get install -y nodejs

echo "[4/9] Instalando PM2..."
npm install -g pm2

echo "[5/9] Configurando MySQL..."
systemctl enable --now mysql
mysql -e "CREATE DATABASE IF NOT EXISTS \`${MYSQL_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -e "CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';"
mysql -e "ALTER USER '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';"
mysql -e "GRANT ALL PRIVILEGES ON \`${MYSQL_DB}\`.* TO '${MYSQL_USER}'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

echo "[6/9] Preparando diretório da aplicação..."
mkdir -p "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR" || true

cat <<EOF
Coloque os arquivos do projeto em:
  ${APP_DIR}
Antes de continuar, garanta que o código foi copiado para lá.
EOF

if [[ ! -f "${APP_DIR}/package.json" ]]; then
  echo "package.json não encontrado em ${APP_DIR}."
  echo "Copie o projeto para essa pasta e execute o script novamente."
  exit 1
fi

echo "[7/9] Instalando dependências do projeto..."
cd "$APP_DIR"
npm install

echo "[8/9] Criando .env..."
cat > .env <<EOF
PORT=${PORT}
SESSION_SECRET=${SESSION_SECRET}
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=${MYSQL_USER}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
MYSQL_DATABASE=${MYSQL_DB}
WHATSAPP_WEBHOOK_TOKEN=${WHATSAPP_WEBHOOK_TOKEN}
BASE_URL=${BASE_URL}
ADMIN_NAME=${ADMIN_NAME}
ADMIN_PHONE=${ADMIN_PHONE}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

echo "[9/9] Importando schema e iniciando app..."
mysql -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DB}" < sql/schema.sql
node scripts/create-admin.js
pm2 start src/server.js --name "${APP_NAME}"
pm2 save

cat <<EOF
Concluído.

Verifique:
- PM2: pm2 status
- Logs: pm2 logs ${APP_NAME}
- Nginx: systemctl status nginx

Se quiser expor via Nginx, crie um reverse proxy apontando para 127.0.0.1:${PORT}.
EOF
