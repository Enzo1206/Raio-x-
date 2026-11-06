import { segredoCerto } from '../../../lib/autenticacao.js';

const json = (dados, status = 200) => Response.json(dados, { status, headers: { 'Cache-Control': 'no-store' } });

// Entrega um @ da fila por vez. A troca de estado impede dois coletores de pegarem o mesmo.
export async function onRequestGet({ request, env }) {
  if (!(await segredoCerto(request, env.COLETOR_CHAVE))) return json({ erro: 'Chave incorreta.' }, 401);

  const linha = await env.DB.prepare(
    `SELECT username FROM analises WHERE estado = 'fila' AND tentativas < 3 ORDER BY criado_em LIMIT 1`
  ).first();
  if (!linha) return json({});

  const reserva = await env.DB.prepare(
    `UPDATE analises SET estado = 'coletando', atualizado_em = ? WHERE username = ? AND estado = 'fila'`
  ).bind(new Date().toISOString(), linha.username).run();
  return json(reserva.meta.changes === 1 ? { username: linha.username } : {});
}
