import { segredoCerto } from '../../lib/autenticacao.js';
import { avancar, FINAIS, lerAnalise } from '../../lib/coleta.js';

const MAX_AVANCOS = 5;
const json = (dados, status = 200) => Response.json(dados, { status, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestGet({ request, env }) {
  if (!(await segredoCerto(request, env.PAINEL_SENHA))) return json({ erro: 'Senha incorreta.' }, 401);

  const { results } = await env.DB.prepare(
    `SELECT l.id, l.username, l.respostas, l.origem, l.criado_em, a.estado
     FROM leads l LEFT JOIN analises a ON a.username = l.username
     ORDER BY l.criado_em DESC LIMIT 200`
  ).all();

  // Quem fechou a página não consulta mais a coleta: o painel termina o trabalho.
  const pendentes = [...new Set(results.filter(l => !FINAIS.has(l.estado)).map(l => l.username))].slice(0, MAX_AVANCOS);
  const estados = {};
  for (const username of pendentes) {
    const linha = await avancar(env, await lerAnalise(env, username));
    if (linha) estados[username] = linha.estado;
  }

  return json({
    leads: results.map(l => ({ ...l, estado: estados[l.username] || l.estado, respostas: JSON.parse(l.respostas) })),
  });
}
