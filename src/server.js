const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`Servidor rodando em http://localhost:${config.port}`);
});
