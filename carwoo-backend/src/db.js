require('dotenv').config();
const { Pool } = require('pg');

const url = process.env.DATABASE_URL || '';

if (!url) {
  console.error('');
  console.error('DATABASE_URL nao esta definida no .env');
  console.error('Cole ali a string de conexao do seu banco. Exemplo:');
  console.error('  DATABASE_URL=postgresql://usuario:senha@host:5432/postgres');
  console.error('');
  process.exit(1);
}

/**
 * Descobre sozinho se o banco exige SSL, para voce nao precisar editar este arquivo.
 * Bancos gerenciados (Supabase, Neon, Render, Railway, Heroku) exigem.
 * Postgres local normalmente nao.
 */
const ehLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(url);
const pedeSsl = /sslmode=require|sslmode=verify/.test(url);
const ehGerenciado = /supabase|neon\.tech|render\.com|railway|amazonaws|heroku|azure|digitalocean|aivencloud/.test(url);

const usarSsl = pedeSsl || (!ehLocal && ehGerenciado);

const pool = new Pool({
  connectionString: url,
  ...(usarSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

if (usarSsl) console.log('[carwoo] Conectando ao banco com SSL');

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
