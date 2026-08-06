/**
 * Envio de fotos para armazenamento de objetos.
 *
 * POR QUE EXISTE
 * Um anuncio de veiculo tem de 8 a 12 fotos. Guardar isso dentro do banco
 * em base64 estoura o espaco rapido e deixa toda consulta lenta. Pior: os
 * portais (OLX, Mercado Livre) so aceitam LINK de imagem, nunca o arquivo
 * embutido. Entao a foto precisa morar num endereco publico da internet e
 * o banco guarda apenas a URL.
 *
 * DRIVER ATUAL: Supabase Storage
 * Escolhido porque ja vem na mesma conta do banco - o lojista nao precisa
 * criar servico novo. Limite gratuito: 1 GB de arquivos e 5 GB de trafego
 * por mes.
 *
 * PARA TROCAR POR CLOUDFLARE R2 OU S3
 * Escreva outro driver com as mesmas tres funcoes (configurado, enviar,
 * remover) e troque a escolha no final deste arquivo. Nada mais no sistema
 * precisa mudar, porque so estas funcoes sao usadas fora daqui.
 */

const BUCKET = process.env.SUPABASE_BUCKET || 'veiculos';

function limparUrlBase(v) {
  return String(v || '').trim().replace(/\/+$/, '');
}

const SUPABASE_URL = limparUrlBase(process.env.SUPABASE_URL);
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_KEY || '').trim();

/** Diz se ha credenciais suficientes para enviar arquivos. */
function configurado() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/** Texto curto para a rota de diagnostico e para os avisos na tela. */
function descrever() {
  if (!configurado()) {
    return {
      ativo: false,
      provedor: null,
      motivo: 'SUPABASE_URL e SUPABASE_SERVICE_KEY nao estao preenchidos no .env',
    };
  }
  return { ativo: true, provedor: 'supabase', bucket: BUCKET };
}

function cabecalhos(extras = {}) {
  return {
    Authorization: `Bearer ${SUPABASE_KEY}`,
    apikey: SUPABASE_KEY,
    ...extras,
  };
}

/**
 * Cria o bucket se ainda nao existir, ja publico.
 * Roda uma vez por processo - se falhar, o envio adiante devolve o erro real.
 */
let bucketVerificado = false;
async function garantirBucket() {
  if (bucketVerificado) return;
  try {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: cabecalhos({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: BUCKET,
        name: BUCKET,
        public: true,
        file_size_limit: 10 * 1024 * 1024,
        allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
      }),
    });
    // 409 = ja existe, que e o caso normal a partir da segunda vez
    if (resp.ok || resp.status === 409) bucketVerificado = true;
  } catch {
    // Rede fora do ar: deixa seguir, o envio abaixo reporta o problema
  }
}

/** Nome de arquivo seguro, sem acento nem espaco. */
function nomeSeguro(nome) {
  return String(nome || 'foto.jpg')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-60);
}

/**
 * Envia uma foto e devolve a URL publica.
 * O caminho separa por loja, para uma loja nunca alcancar arquivo de outra.
 */
async function enviar({ buffer, contentType, storeId, vehicleId, nome }) {
  if (!configurado()) throw new Error('Armazenamento de fotos nao configurado.');
  await garantirBucket();

  const caminho = [
    `loja-${storeId}`,
    `veiculo-${vehicleId}`,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nomeSeguro(nome)}`,
  ].join('/');

  const resp = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho}`,
    {
      method: 'POST',
      headers: cabecalhos({
        'Content-Type': contentType || 'image/jpeg',
        'x-upsert': 'true',
      }),
      body: buffer,
    }
  );

  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`Falha ao enviar a foto (${resp.status}). ${texto.slice(0, 200)}`);
  }

  return {
    url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${caminho}`,
    caminho,
  };
}

/**
 * Apaga uma foto a partir da URL publica.
 * Falha de propósito em silêncio: perder o arquivo orfao e menos grave do
 * que travar o lojista que so queria trocar a foto do anuncio.
 */
async function remover(url) {
  if (!configurado() || !url) return false;
  const marcador = `/storage/v1/object/public/${BUCKET}/`;
  const i = String(url).indexOf(marcador);
  if (i === -1) return false;
  const caminho = String(url).slice(i + marcador.length);
  try {
    const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho}`, {
      method: 'DELETE',
      headers: cabecalhos(),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** Converte o "data:image/jpeg;base64,..." que o navegador manda. */
function lerDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
}

module.exports = { configurado, descrever, enviar, remover, lerDataUrl };
