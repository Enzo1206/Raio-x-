// Fala com a Apify e avança a análise um passo a cada consulta do navegador.
// Assim nenhuma requisição fica presa esperando a coleta, o que cabe no plano grátis da Cloudflare.
import { escolherPosts, resumir } from './analise.js';
import { demoComentarios, demoPerfil, demoReels } from './demo.js';

const API = 'https://api.apify.com/v2';
const ATOR_PERFIL = 'apify~instagram-profile-scraper';
const ATOR_COMENTARIOS = 'apify~instagram-comment-scraper';
const ATOR_REELS = 'apify~instagram-reel-scraper';

export const FINAIS = new Set(['pronto', 'privado', 'nao_encontrado', 'sem_dados']);
const COLETANDO = new Set(['perfil', 'comentarios', 'views']);
const TRAVADO_MS = 10 * 60 * 1000;
const RESULTADO_EXPIRA_MS = 8 * 86400000;
const MAX_TENTATIVAS = 3;
const agoraIso = () => new Date().toISOString();

function cliente(env) {
  if (env.DEMO === '1') {
    return {
      iniciar: async ator => `demo:${ator}`,
      status: async () => 'SUCCEEDED',
      itens: async (runId, username) => {
        if (runId.includes('profile')) return demoPerfil(username);
        return runId.includes('reel') ? demoReels(username) : demoComentarios();
      },
    };
  }
  const chamar = async (caminho, init = {}) => {
    const r = await fetch(API + caminho, {
      ...init,
      headers: { Authorization: `Bearer ${env.APIFY_TOKEN}`, 'Content-Type': 'application/json' },
    });
    if (!r.ok) throw new Error(`Apify respondeu ${r.status}`);
    return r.json();
  };
  return {
    iniciar: async (ator, entrada) => (await chamar(`/acts/${ator}/runs`, { method: 'POST', body: JSON.stringify(entrada) })).data.id,
    status: async runId => (await chamar(`/actor-runs/${runId}`)).data.status,
    itens: runId => chamar(`/actor-runs/${runId}/dataset/items?clean=1`),
  };
}

export const coletaLigada = env => env.DEMO === '1' || Boolean(env.APIFY_TOKEN);

export const iniciarPerfil = (env, username) =>
  cliente(env).iniciar(ATOR_PERFIL, { usernames: [username] });

async function salvar(env, username, campos) {
  const nomes = Object.keys(campos);
  const sets = nomes.map(n => `${n} = ?`).join(', ');
  await env.DB.prepare(`UPDATE analises SET ${sets}, atualizado_em = ? WHERE username = ?`)
    .bind(...nomes.map(n => campos[n]), agoraIso(), username)
    .run();
}

// Só uma consulta por vez passa daqui: evita pagar duas vezes pela mesma coleta.
async function travar(env, username, de) {
  const r = await env.DB.prepare(`UPDATE analises SET estado = 'processando', atualizado_em = ? WHERE username = ? AND estado = ?`)
    .bind(agoraIso(), username, de)
    .run();
  return r.meta.changes === 1;
}

const finalizar = (env, username, rascunho) =>
  salvar(env, username, { estado: 'pronto', run_id: null, dados: JSON.stringify(resumir(rascunho)) });

// As reproduções dos Reels só vêm nesta coleta. Sem ela, o relatório usa o número menor do perfil.
async function iniciarViews(env, api, username, rascunho) {
  const videos = rascunho.posts.filter(p => p.type === 'Video' && p.url).map(p => p.url);
  if (!videos.length) return finalizar(env, username, rascunho);
  try {
    const runId = await api.iniciar(ATOR_REELS, { username: videos });
    return await salvar(env, username, { estado: 'views', run_id: runId, dados: JSON.stringify(rascunho) });
  } catch (e) {
    console.error('reels', username, e.message);
    return finalizar(env, username, rascunho);
  }
}

async function aposPerfil(env, api, linha) {
  const { username } = linha;
  const [perfil] = await api.itens(linha.run_id, username);
  if (!perfil || perfil.error || !perfil.username) return salvar(env, username, { estado: 'nao_encontrado', run_id: null });
  if (perfil.private) return salvar(env, username, { estado: 'privado', run_id: null });

  const { base, comComentarios } = escolherPosts(perfil.latestPosts || []);
  const limite = Number(env.MAX_COMENTARIOS || 60);
  const { latestPosts, ...dadosPerfil } = perfil;
  const rascunho = {
    perfil: dadosPerfil,
    posts: base.map(p => ({
      url: p.url, shortCode: p.shortCode, type: p.type, timestamp: p.timestamp, caption: p.caption, isPinned: p.isPinned,
      commentsCount: p.commentsCount, likesCount: p.likesCount, videoViewCount: p.videoViewCount, videoPlayCount: p.videoPlayCount, displayUrl: p.displayUrl,
    })),
    comentarios: [],
  };
  if (!comComentarios.length) return iniciarViews(env, api, username, rascunho);
  const runId = await api.iniciar(ATOR_COMENTARIOS, {
    directUrls: comComentarios.map(p => p.url),
    resultsLimit: Math.max(1, Math.floor(limite / comComentarios.length)),
  });
  return salvar(env, username, { estado: 'comentarios', run_id: runId, dados: JSON.stringify(rascunho) });
}

async function aposComentarios(env, api, linha, ok) {
  const rascunho = JSON.parse(linha.dados);
  const itens = ok ? await api.itens(linha.run_id, linha.username) : [];
  rascunho.coletouComentarios = ok;
  rascunho.comentarios = itens.map(c => ({
    ownerUsername: c.ownerUsername, text: c.text, timestamp: c.timestamp, likesCount: c.likesCount, repliesCount: c.repliesCount ?? null,
  }));
  return iniciarViews(env, api, linha.username, rascunho);
}

async function aposViews(env, api, linha, ok) {
  const rascunho = JSON.parse(linha.dados);
  const itens = ok ? await api.itens(linha.run_id, linha.username) : [];
  const porCodigo = new Map(itens.filter(i => i.shortCode).map(i => [i.shortCode, i]));
  for (const post of rascunho.posts) {
    const reel = porCodigo.get(post.shortCode);
    if (reel) post.videoPlayCount = reel.videoPlayCount;
  }
  return finalizar(env, linha.username, rascunho);
}

const PROXIMO_PASSO = { perfil: aposPerfil, comentarios: aposComentarios, views: aposViews };

// Quando o coletor do PC não dá conta, a Apify entra como reserva, dentro do limite do mês.
async function usarReserva(env, linha) {
  const { username, tentativas } = linha;
  const inicioMes = new Date().toISOString().slice(0, 7) + '-01';
  const { mes } = await env.DB.prepare(`SELECT COUNT(*) AS mes FROM inicios WHERE pago = 1 AND criado_em >= ?`).bind(inicioMes).first();
  if (!coletaLigada(env) || mes >= Number(env.MAX_ANALISES_MES || 25)) {
    // Sem saldo: quem o coletor ainda pode tentar continua na fila.
    if (tentativas < MAX_TENTATIVAS) return;
    return salvar(env, username, { estado: 'sem_dados', run_id: null });
  }
  const reserva = await env.DB.prepare(`UPDATE analises SET estado = 'iniciando', atualizado_em = ? WHERE username = ? AND estado = 'fila'`)
    .bind(agoraIso(), username).run();
  if (reserva.meta.changes !== 1) return;
  try {
    const runId = await iniciarPerfil(env, username);
    const iso = agoraIso();
    await env.DB.batch([
      env.DB.prepare(`UPDATE analises SET estado = 'perfil', run_id = ?, atualizado_em = ? WHERE username = ?`).bind(runId, iso, username),
      env.DB.prepare('INSERT INTO inicios (ip_hash, criado_em, pago) VALUES (?, ?, 1)').bind('reserva', iso),
    ]);
  } catch (e) {
    console.error('reserva', username, e.message);
    await salvar(env, username, { estado: 'sem_dados', run_id: null });
  }
}

export async function lerAnalise(env, username) {
  return env.DB.prepare('SELECT * FROM analises WHERE username = ?').bind(username).first();
}

// Avança no máximo um passo e devolve a linha atualizada.
export async function avancar(env, linha) {
  if (!linha || FINAIS.has(linha.estado)) return linha;
  const { username, estado } = linha;
  const idade = Date.now() - new Date(linha.atualizado_em).getTime();
  if (estado === 'fila') {
    const espera = Date.now() - new Date(linha.criado_em).getTime();
    const limite = Number(env.ESPERA_FILA_HORAS || 12) * 3600000;
    if (espera <= limite && linha.tentativas < MAX_TENTATIVAS) return linha;
    await usarReserva(env, linha);
    return lerAnalise(env, username);
  }
  if (estado === 'coletando') {
    // O PC pode ter desligado no meio: o pedido volta para a fila.
    if (idade <= TRAVADO_MS) return linha;
    await salvar(env, username, { estado: 'fila' });
    return lerAnalise(env, username);
  }
  if (!COLETANDO.has(estado)) {
    if (idade <= TRAVADO_MS) return linha;
    await salvar(env, username, { estado: 'sem_dados', run_id: null });
    return lerAnalise(env, username);
  }

  // O seguidor pode fechar a página: a coleta continua na Apify e o painel busca o resultado depois.
  const api = cliente(env);
  let status;
  try {
    status = await api.status(linha.run_id);
  } catch (e) {
    console.error('status', username, e.message);
    if (idade <= RESULTADO_EXPIRA_MS) return linha;
    await salvar(env, username, { estado: 'sem_dados', run_id: null });
    return lerAnalise(env, username);
  }
  if (status === 'READY' || status === 'RUNNING') return linha;

  try {
    const ok = status === 'SUCCEEDED';
    if (await travar(env, username, estado)) {
      if (estado === 'perfil' && !ok) await salvar(env, username, { estado: 'sem_dados', run_id: null });
      else await PROXIMO_PASSO[estado](env, api, linha, ok);
    }
  } catch (e) {
    console.error('coleta', username, e.message);
    await salvar(env, username, { estado: 'sem_dados', run_id: null });
  }
  return lerAnalise(env, username);
}
