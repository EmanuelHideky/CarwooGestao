const express = require('express');
const db = require('../db');
const { checarLimite } = require('../middleware/plan');
const { filtrarVeiculo, pode, exigirPermissao } = require('../middleware/role');
const { asyncRoute, buildUpdate, paraNumero } = require('../helpers');
const storage = require('../storage');

const router = express.Router();

// Monta o objeto de veículo no formato que o front-end usa
async function montarVeiculo(row) {
  const [fotos, custos, portais] = await Promise.all([
    db.query('SELECT id, nome, url, ordem FROM vehicle_photos WHERE vehicle_id = $1 ORDER BY ordem, id', [row.id]),
    db.query('SELECT id, descricao AS desc, valor FROM vehicle_costs WHERE vehicle_id = $1 ORDER BY id', [row.id]),
    db.query('SELECT portal_id FROM vehicle_portals WHERE vehicle_id = $1', [row.id]),
  ]);
  return {
    id: row.id,
    marca: row.marca,
    modelo: row.modelo,
    versao: row.versao,
    anoFab: row.ano_fab,
    anoMod: row.ano_mod,
    km: row.km,
    cor: row.cor,
    cambio: row.cambio,
    combustivel: row.combustivel,
    placa: row.placa,
    renavam: row.renavam,
    chassi: row.chassi,
    portas: row.portas,
    descricao: row.descricao,
    preco: Number(row.preco),
    custo: Number(row.custo),
    status: row.status,
    destaque: row.destaque,
    entrada: row.entrada,
    fipeValor: row.fipe_valor === null ? null : Number(row.fipe_valor),
    fipeRef: row.fipe_ref,
    codigoFipe: row.codigo_fipe,
    docs: row.docs || {},
    fotos: fotos.rows.length,
    fotosData: fotos.rows,
    custosExtras: custos.rows.map((c) => ({ desc: c.desc, valor: Number(c.valor) })),
    portais: portais.rows.map((p) => p.portal_id),
  };
}

// GET /api/vehicles?status=disponivel&busca=argo
router.get('/', asyncRoute(async (req, res) => {
  const { status, busca } = req.query;
  const condicoes = ['store_id = $1'];
  const valores = [req.user.storeId];

  if (status && status !== 'todos') {
    valores.push(status);
    condicoes.push(`status = $${valores.length}`);
  }
  if (busca) {
    valores.push(`%${busca}%`);
    condicoes.push(`(marca ILIKE $${valores.length} OR modelo ILIKE $${valores.length} OR versao ILIKE $${valores.length} OR placa ILIKE $${valores.length})`);
  }

  const { rows } = await db.query(
    `SELECT * FROM vehicles WHERE ${condicoes.join(' AND ')} ORDER BY criado_em DESC`,
    valores
  );
  const veiculos = await Promise.all(rows.map(montarVeiculo));
  // Vendedor não recebe custo nem custos de preparação
  res.json(veiculos.map((v) => filtrarVeiculo(v, req)));
}));

// GET /api/vehicles/:id
router.get('/:id', asyncRoute(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM vehicles WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  if (!rows[0]) return res.status(404).json({ erro: 'Veículo não encontrado.' });
  res.json(filtrarVeiculo(await montarVeiculo(rows[0]), req));
}));

// POST /api/vehicles
router.post('/', checarLimite('veiculos'), asyncRoute(async (req, res) => {
  const b = req.body;
  if (!b.marca || !b.modelo) {
    return res.status(400).json({ erro: 'Informe ao menos a marca e o modelo do veículo.' });
  }

  const { rows } = await db.query(
    `INSERT INTO vehicles
       (store_id, marca, modelo, versao, ano_fab, ano_mod, km, cor, cambio, combustivel,
        placa, renavam, chassi, portas, descricao,
        preco, custo, status, destaque, entrada, fipe_valor, fipe_ref, codigo_fipe, docs)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
             $16,$17,$18,$19,COALESCE($20, CURRENT_DATE),$21,$22,$23,$24)
     RETURNING *`,
    [
      req.user.storeId, b.marca, b.modelo, b.versao || null,
      paraNumero(b.anoFab), paraNumero(b.anoMod), paraNumero(b.km) || 0,
      b.cor || null, b.cambio || null, b.combustivel || null, b.placa || null,
      b.renavam || null, b.chassi || null, paraNumero(b.portas), b.descricao || null,
      paraNumero(b.preco) || 0,
      pode(req, 'custos') ? (paraNumero(b.custo) || 0) : 0,
      b.status || 'disponivel',
      b.destaque === true,
      b.entrada || null, paraNumero(b.fipeValor), b.fipeRef || null, b.codigoFipe || null,
      JSON.stringify(b.docs || {}),
    ]
  );

  const veiculo = rows[0];
  if (pode(req, 'custos')) await salvarCustos(veiculo.id, b.custosExtras);
  await salvarPortais(veiculo.id, b.portais);

  res.status(201).json(await montarVeiculo(veiculo));
}));

// PUT /api/vehicles/:id
router.put('/:id', asyncRoute(async (req, res) => {
  const b = req.body;
  const campos = {
    marca: b.marca, modelo: b.modelo, versao: b.versao,
    ano_fab: paraNumero(b.anoFab), ano_mod: paraNumero(b.anoMod), km: paraNumero(b.km),
    cor: b.cor, cambio: b.cambio, combustivel: b.combustivel, placa: b.placa,
    renavam: b.renavam, chassi: b.chassi, portas: paraNumero(b.portas),
    descricao: b.descricao,
    preco: paraNumero(b.preco),
    // Quem nao tem permissao de custos nunca recebeu esse campo na leitura.
    // Se ele vier na gravacao, e engano ou tentativa - ignorar, nao zerar.
    custo: pode(req, 'custos') ? paraNumero(b.custo) : undefined,
    status: b.status,
    destaque: b.destaque,
    fipe_valor: paraNumero(b.fipeValor), fipe_ref: b.fipeRef, codigo_fipe: b.codigoFipe,
    docs: b.docs === undefined ? undefined : JSON.stringify(b.docs),
    atualizado_em: new Date(),
  };

  const update = buildUpdate('vehicles', campos, 'id = $a AND store_id = $b', [req.params.id, req.user.storeId]);
  if (!update) return res.status(400).json({ erro: 'Nenhum campo enviado para atualizar.' });

  const { rows } = await db.query(update.sql, update.valores);
  if (!rows[0]) return res.status(404).json({ erro: 'Veículo não encontrado.' });

  // Idem para os custos de preparacao: sem permissao, a lista chegaria vazia
  // e apagaria tudo que o dono lancou.
  if (b.custosExtras !== undefined && pode(req, 'custos')) await salvarCustos(rows[0].id, b.custosExtras);
  if (b.portais !== undefined) await salvarPortais(rows[0].id, b.portais);

  res.json(await montarVeiculo(rows[0]));
}));

// PUT /api/vehicles/:id/costs -> custo de aquisicao e custos de preparacao
//
// Rota separada de proposito. O cadastro do veiculo e mexido por qualquer
// perfil; o custo, nao. Deixando em uma rota so, com uma permissao so, fica
// claro quem pode alterar dinheiro - e o vendedor nem chega aqui.
router.put('/:id/costs', exigirPermissao('custos'), asyncRoute(async (req, res) => {
  const b = req.body;
  const { rows } = await db.query(
    `UPDATE vehicles SET custo = $1, atualizado_em = now()
      WHERE id = $2 AND store_id = $3 RETURNING *`,
    [paraNumero(b.custo) || 0, req.params.id, req.user.storeId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Veículo não encontrado.' });

  if (b.custosExtras !== undefined) await salvarCustos(rows[0].id, b.custosExtras);

  res.json(filtrarVeiculo(await montarVeiculo(rows[0]), req));
}));

// DELETE /api/vehicles/:id
router.delete('/:id', asyncRoute(async (req, res) => {
  // As linhas de vehicle_photos somem sozinhas pelo ON DELETE CASCADE, mas os
  // arquivos no armazenamento nao - precisam ser apagados na mao antes.
  const { rows: fotos } = await db.query(
    'SELECT p.url FROM vehicle_photos p JOIN vehicles v ON v.id = p.vehicle_id WHERE p.vehicle_id = $1 AND v.store_id = $2',
    [req.params.id, req.user.storeId]
  );

  const { rowCount } = await db.query('DELETE FROM vehicles WHERE id = $1 AND store_id = $2', [req.params.id, req.user.storeId]);
  if (!rowCount) return res.status(404).json({ erro: 'Veículo não encontrado.' });

  for (const f of fotos) await storage.remover(f.url);
  res.status(204).end();
}));

// Confirma que o veículo é da loja de quem está pedindo. Sem isso, uma loja
// conseguiria mexer na foto do carro de outra só chutando o número do id.
async function veiculoDaLoja(req) {
  const { rows } = await db.query(
    'SELECT id FROM vehicles WHERE id = $1 AND store_id = $2',
    [req.params.id, req.user.storeId]
  );
  return rows[0] || null;
}

// POST /api/vehicles/:id/photos/upload -> recebe UMA foto e devolve a URL
// O navegador envia uma de cada vez, já reduzida, para não estourar o limite
// de tamanho do corpo da requisição e para poder mostrar o progresso.
router.post('/:id/photos/upload', asyncRoute(async (req, res) => {
  const veiculo = await veiculoDaLoja(req);
  if (!veiculo) return res.status(404).json({ erro: 'Veículo não encontrado.' });

  if (!storage.configurado()) {
    return res.status(503).json({
      erro: 'O armazenamento de fotos ainda não está configurado neste servidor.',
      detalhe: storage.descrever().motivo,
    });
  }

  const lida = storage.lerDataUrl(req.body.dataUrl);
  if (!lida) return res.status(400).json({ erro: 'Formato de imagem não reconhecido.' });

  const enviada = await storage.enviar({
    buffer: lida.buffer,
    contentType: lida.contentType,
    storeId: req.user.storeId,
    vehicleId: veiculo.id,
    nome: req.body.nome,
  });

  res.json({ url: enviada.url, nome: req.body.nome || null });
}));

// POST /api/vehicles/:id/photos -> grava a lista final de fotos, já em ordem.
// Recebe só as URLs, porque o envio do arquivo aconteceu na rota acima.
router.post('/:id/photos', asyncRoute(async (req, res) => {
  const veiculo = await veiculoDaLoja(req);
  if (!veiculo) return res.status(404).json({ erro: 'Veículo não encontrado.' });

  const fotos = (Array.isArray(req.body.fotos) ? req.body.fotos : []).filter((f) => f && f.url);

  // Apaga do armazenamento as fotos que o lojista tirou do anúncio, para não
  // acumular arquivo órfão consumindo espaço.
  const { rows: antigas } = await db.query(
    'SELECT url FROM vehicle_photos WHERE vehicle_id = $1',
    [veiculo.id]
  );
  const mantidas = new Set(fotos.map((f) => f.url));
  for (const a of antigas) {
    if (a.url && !mantidas.has(a.url)) await storage.remover(a.url);
  }

  await db.query('DELETE FROM vehicle_photos WHERE vehicle_id = $1', [veiculo.id]);
  for (let i = 0; i < fotos.length; i++) {
    await db.query(
      'INSERT INTO vehicle_photos (vehicle_id, nome, url, ordem) VALUES ($1,$2,$3,$4)',
      [veiculo.id, fotos[i].nome || null, fotos[i].url, i]
    );
  }
  res.json({ total: fotos.length });
}));

async function salvarCustos(vehicleId, custos) {
  if (!Array.isArray(custos)) return;
  await db.query('DELETE FROM vehicle_costs WHERE vehicle_id = $1', [vehicleId]);
  for (const c of custos) {
    if (!c || !c.desc) continue;
    await db.query('INSERT INTO vehicle_costs (vehicle_id, descricao, valor) VALUES ($1,$2,$3)', [vehicleId, c.desc, paraNumero(c.valor) || 0]);
  }
}

async function salvarPortais(vehicleId, portais) {
  if (!Array.isArray(portais)) return;
  await db.query('DELETE FROM vehicle_portals WHERE vehicle_id = $1', [vehicleId]);
  for (const p of portais) {
    await db.query('INSERT INTO vehicle_portals (vehicle_id, portal_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [vehicleId, p]);
  }
}

module.exports = router;
