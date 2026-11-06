import { segredoCerto } from '../../../lib/autenticacao.js';

const json = (dados, status = 200) => Response.json(dados, { status, headers: { 'Cache-Control': 'no-store' } });

// Devolve o @ para a fila. Depois de 3 falhas, a próxima consulta passa o pedido para a Apify.
export async function onRequestPost({ request, env }) {
  if (!(await segredoCerto(request, env.COLETOR_CHAVE))) return json({ erro: 'Chave incorreta.' }, 401);
  const c = await request.json().catch(() => null);
  const username = String(c?.username || '').toLowerCase();
  // Bloqueio do Instagram não é culpa do perfil: volta para a fila sem gastar tentativa.
  const soma = c?.bloqueado ? 0 : 1;
  await env.DB.prepare(
    `UPDATE analises SET estado = 'fila', tentativas = tentativas + ?, atualizado_em = ? WHERE username = ? AND estado = 'coletando'`
  ).bind(soma, new Date().toISOString(), username).run();
  return json({ ok: true });
}
