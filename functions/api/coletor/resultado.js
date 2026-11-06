import { resumir } from '../../../lib/analise.js';
import { segredoCerto } from '../../../lib/autenticacao.js';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_POSTS = 50;
const MAX_COMENTARIOS = 300;
const json = (dados, status = 200) => Response.json(dados, { status, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!(await segredoCerto(request, env.COLETOR_CHAVE))) return json({ erro: 'Chave incorreta.' }, 401);
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES) return json({ erro: 'Resultado grande demais.' }, 413);

  const c = await request.json().catch(() => null);
  const username = String(c?.username || '').toLowerCase();
  if (!username) return json({ erro: 'Sem @.' }, 400);

  const campos = {};
  if (c.status === 'privado' || c.status === 'nao_encontrado') {
    campos.estado = c.status;
    campos.dados = null;
  } else if (c.status === 'ok' && c.perfil && Array.isArray(c.posts) && Array.isArray(c.comentarios)) {
    if (String(c.perfil.username || '').toLowerCase() !== username) return json({ erro: 'O perfil não confere.' }, 400);
    campos.estado = 'pronto';
    campos.dados = JSON.stringify(resumir({
      perfil: c.perfil,
      posts: c.posts.slice(0, MAX_POSTS),
      comentarios: c.comentarios.slice(0, MAX_COMENTARIOS),
    }));
  } else {
    return json({ erro: 'Resultado inválido.' }, 400);
  }

  // Só aceita quem está em coleta: um resultado atrasado não sobrescreve o da Apify.
  const r = await env.DB.prepare(
    `UPDATE analises SET estado = ?, dados = ?, run_id = NULL, atualizado_em = ? WHERE username = ? AND estado = 'coletando'`
  ).bind(campos.estado, campos.dados, new Date().toISOString(), username).run();
  return r.meta.changes === 1 ? json({ ok: true }) : json({ erro: 'Este @ não está em coleta.' }, 409);
}
