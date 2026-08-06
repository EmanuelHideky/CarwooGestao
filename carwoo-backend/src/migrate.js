require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

/**
 * Aplica o schema.sql comando por comando.
 * Se algo falhar, mostra qual comando, em que linha, e o erro do Postgres.
 * Seguro para rodar mais de uma vez.
 */

function separarComandos(sql) {
  const linhas = sql.split('\n');
  const comandos = [];
  let atual = [];
  let linhaInicial = 0;

  linhas.forEach((linha, indice) => {
    const semComentario = linha.split('--')[0];
    if (atual.length === 0 && !semComentario.trim()) return;
    if (atual.length === 0) linhaInicial = indice + 1;
    atual.push(linha);
    if (semComentario.trimEnd().endsWith(';')) {
      comandos.push({ linha: linhaInicial, sql: atual.join('\n').trim() });
      atual = [];
    }
  });
  if (atual.join('').trim()) comandos.push({ linha: linhaInicial, sql: atual.join('\n').trim() });
  return comandos;
}

function resumir(sql) {
  const limpo = sql.replace(/\s+/g, ' ').trim();
  return limpo.length > 78 ? limpo.slice(0, 78) + '...' : limpo;
}

async function migrar() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const comandos = separarComandos(sql);

  console.log('');
  console.log('carwoo - aplicando o schema no banco');
  console.log('-'.repeat(62));

  try {
    const { rows } = await pool.query('SELECT current_database() AS db, version() AS v');
    console.log(`Banco:    ${rows[0].db}`);
    console.log(`Versao:   ${rows[0].v.split(',')[0]}`);
  } catch (err) {
    console.error('');
    console.error('Nao foi possivel conectar ao banco.');
    console.error(`Erro: ${err.message}`);
    console.error('');
    console.error('Verifique:');
    console.error('  1. A DATABASE_URL no .env esta correta?');
    console.error('  2. O provedor exige SSL? Se sim, adicione em src/db.js:');
    console.error('       ssl: { rejectUnauthorized: false }');
    console.error('  3. O banco aceita conexoes do seu IP?');
    console.error('');
    await pool.end();
    process.exit(1);
  }

  console.log(`Comandos: ${comandos.length}`);
  console.log('-'.repeat(62));

  let ok = 0;
  const jaExistiam = [];

  for (const cmd of comandos) {
    try {
      await pool.query(cmd.sql);
      ok++;
    } catch (err) {
      if (['42P07', '42710', '42701', '42P16'].includes(err.code)) {
        jaExistiam.push(`linha ${cmd.linha}: ${resumir(cmd.sql)}`);
        continue;
      }
      console.error('');
      console.error('-'.repeat(62));
      console.error(`FALHOU no comando da linha ${cmd.linha} do schema.sql`);
      console.error('-'.repeat(62));
      console.error('');
      console.error(cmd.sql);
      console.error('');
      console.error(`Erro do Postgres: ${err.message}`);
      if (err.code) console.error(`Codigo: ${err.code}`);
      if (err.detail) console.error(`Detalhe: ${err.detail}`);
      if (err.hint) console.error(`Dica: ${err.hint}`);
      console.error('');
      console.error(`${ok} comando(s) aplicado(s) antes da falha.`);
      console.error('Corrija a linha indicada e rode "npm run migrate" de novo.');
      console.error('');
      await pool.end();
      process.exit(1);
    }
  }

  const { rows: tabelas } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  const nomes = tabelas.map((t) => t.table_name);

  console.log('');
  console.log(`Aplicados: ${ok} comando(s)`);
  if (jaExistiam.length) console.log(`Ja existiam: ${jaExistiam.length} (normal ao rodar de novo)`);
  console.log('');
  console.log(`Tabelas no banco (${nomes.length}):`);
  for (let i = 0; i < nomes.length; i += 4) {
    console.log('  ' + nomes.slice(i, i + 4).map((n) => n.padEnd(20)).join(''));
  }

  const esperadas = [
    'stores', 'users', 'vehicles', 'vehicle_photos', 'vehicle_costs', 'vehicle_portals',
    'leads', 'sales', 'post_sale_costs', 'finance_entries', 'invoices', 'tasks',
    'comparables', 'integrations', 'notifications', 'inbound_tokens', 'push_subscriptions',
    'plans', 'subscriptions', 'charges', 'password_resets', 'login_attempts',
  ];
  const faltando = esperadas.filter((e) => !nomes.includes(e));

  console.log('');
  if (faltando.length) {
    console.log(`ATENCAO - faltam tabelas: ${faltando.join(', ')}`);
  } else {
    console.log('Todas as 22 tabelas esperadas estao no banco.');
    console.log('');
    console.log('Proximo passo:  npm start');
  }
  console.log('');
  await pool.end();
}

migrar().catch(async (err) => {
  console.error('Erro inesperado:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
