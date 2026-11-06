import { coletaLigada, iniciarPerfil, lerAnalise } from '../../lib/coleta.js';

const VALIDADE_MS = 30 * 86400000;
const json = (dados, status = 200) => Response.json(dados, { status });

async function hashIp(ip, sal) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sal}:${ip}`));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  const corpo = await request.json().catch(() => ({}));
  const username = String(corpo.username || '').trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9._]{2,30}$/.test(username)) return json({ erro: 'Digite o @ de um perfil público.' }, 400);

  const agora = new Date();
  const iso = agora.toISOString();

  // Reaproveita a análise recente: refazer custaria dinheiro e o resultado seria quase igual.
  const existente = await lerAnalise(env, username);
  if (existente && existente.estado !== 'sem_dados' && agora - new Date(existente.criado_em) < VALIDADE_MS) {
    return json({ username, estado: existente.estado });
  }

  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'local', env.SALT || 'dev');
  const inicioMes = iso.slice(0, 7) + '-01';
  const inicioDia = new Date(agora - 86400000).toISOString();
  const desde = inicioMes < inicioDia ? inicioMes : inicioDia;
  const { mes, dia, hoje } = await env.DB.prepare(
    `SELECT COALESCE(SUM(pago = 1 AND criado_em >= ?), 0) AS mes,
            COALESCE(SUM(ip_hash = ? AND criado_em >= ?), 0) AS dia,
            COALESCE(SUM(criado_em >= ?), 0) AS hoje
     FROM inicios WHERE criado_em >= ?`
  ).bind(inicioMes, ipHash, inicioDia, inicioDia, desde).first();

  // Com o coletor ligado, a fila não custa nada: só limita abuso. Sem ele, limita o gasto na Apify.
  const usaFila = Boolean(env.COLETOR_CHAVE);
  const passouIp = dia >= Number(env.MAX_POR_IP_DIA || 5);
  const semCota = usaFila
    ? passouIp || hoje >= Number(env.MAX_FILA_DIA || 200)
    : passouIp || mes >= Number(env.MAX_ANALISES_MES || 25);
  const ligado = usaFila || coletaLigada(env);
  const estadoInicial = !ligado || semCota ? 'sem_dados' : usaFila ? 'fila' : 'iniciando';

  // Quem chegar junto com outra pessoa não dispara uma segunda coleta.
  const reserva = await env.DB.prepare(
    `INSERT INTO analises (username, estado, criado_em, atualizado_em) VALUES (?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET estado = excluded.estado, run_id = NULL, dados = NULL, tentativas = 0,
       criado_em = excluded.criado_em, atualizado_em = excluded.atualizado_em
     WHERE analises.estado = 'sem_dados' OR analises.criado_em < ?`
  ).bind(username, estadoInicial, iso, iso, new Date(agora - VALIDADE_MS).toISOString()).run();
  if (reserva.meta.changes !== 1) {
    const atual = await lerAnalise(env, username);
    return json({ username, estado: atual.estado });
  }
  if (estadoInicial === 'sem_dados') return json({ username, estado: 'sem_dados' });

  if (estadoInicial === 'fila') {
    await env.DB.prepare('INSERT INTO inicios (ip_hash, criado_em, pago) VALUES (?, ?, 0)').bind(ipHash, iso).run();
    return json({ username, estado: 'fila' });
  }

  try {
    const runId = await iniciarPerfil(env, username);
    await env.DB.batch([
      env.DB.prepare(`UPDATE analises SET estado = 'perfil', run_id = ?, atualizado_em = ? WHERE username = ?`).bind(runId, iso, username),
      env.DB.prepare('INSERT INTO inicios (ip_hash, criado_em, pago) VALUES (?, ?, 1)').bind(ipHash, iso),
    ]);
    return json({ username, estado: 'perfil' });
  } catch (e) {
    console.error('iniciar', username, e.message);
    await env.DB.prepare(`UPDATE analises SET estado = 'sem_dados', atualizado_em = ? WHERE username = ?`).bind(iso, username).run();
    return json({ username, estado: 'sem_dados' });
  }
}
