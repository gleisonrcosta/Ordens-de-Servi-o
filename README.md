# Sistema de Ordens de Serviço

Projeto em Node.js + MySQL para abertura e acompanhamento de ordens de serviço.

## Rodando localmente

1. Instale as dependências:

```bash
npm install
```

2. Crie o banco e as tabelas:

```sql
SOURCE sql/schema.sql;
```

3. Copie `.env.example` para `.env` e ajuste os valores.

4. Inicie o servidor:

```bash
npm run dev
```

5. Acesse:

- Login: `http://localhost:3000/login`
- Dashboard: `http://localhost:3000/dashboard`

## Primeiro acesso

Depois de importar o schema, crie um usuário administrador com o script:

```bash
node scripts/create-admin.js
```

O script usa os dados definidos em `.env`.

## Webhook WhatsApp

Envie um `POST` para:

`http://localhost:3000/api/webhook/whatsapp/os`

Headers:

- `x-webhook-token: <WHATSAPP_WEBHOOK_TOKEN>`

Body JSON:

```json
{
  "companyName": "Empresa X",
  "contactPhone": "(11) 99999-9999",
  "onSiteContact": "João Silva",
  "problemDescription": "Computador não liga"
}
```

Resposta esperada:

```json
{
  "success": true,
  "message": "Ordem de serviço OS26000001 aberta com sucesso.",
  "order": {
    "number": "OS26000001",
    "companyName": "Empresa X",
    "contactPhone": "(11) 99999-9999",
    "onSiteContact": "João Silva",
    "problemDescription": "Computador não liga",
    "status": "open"
  }
}
```

