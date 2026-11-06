import { lerAnalise } from '../../lib/coleta.js';

const json = (dados, status = 200) => Response.json(dados, { status });

const VENDE = ['proprio', 'afiliado', 'criando', 'nao'];
const TICKETS = [25, 100, 300, 1000, 3500, 7500, 20000, 50000];
const FATURAMENTOS = ['ate5', '5a20', '20a50', '50a100', '100mais', 'naodizer'];
const SOCIAL = [0, 10, 25, 50, 75, 100];
const JA_FAZ = ['automacao', 'time', 'atende'];

// Guarda só o que o quiz pergunta, nunca o corpo inteiro enviado pelo navegador.
function limparRespostas(r = {}) {
  return {
    vende: VENDE.includes(r.vende) ? r.vende : null,
    ticket: TICKETS.includes(r.ticket) ? r.ticket : null,
    faturamento: FATURAMENTOS.includes(r.faturamento) ? r.faturamento : null,
    socialPct: SOCIAL.includes(r.socialPct) ? r.socialPct : null,
    jaFaz: Array.isArray(r.jaFaz) ? r.jaFaz.filter(v => JA_FAZ.includes(v)) : [],
  };
}

export async function onRequestPost({ request, env }) {
  const c = await request.json().catch(() => ({}));
  const username = String(c.username || '').toLowerCase();

  if (!(await lerAnalise(env, username))) return json({ erro: 'Comece pelo seu @.' }, 400);
  if (c.consentimento !== true) return json({ erro: 'Marque a autorização para continuar.' }, 400);

  // O id é o link do relatório. Não volta para o seguidor: só o painel mostra.
  const id = crypto.randomUUID().replace(/-/g, '');
  const agora = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO leads (id, username, respostas, origem, consentimento_em, criado_em) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, username, JSON.stringify(limparRespostas(c.respostas)), String(c.origem || 'bio').slice(0, 40), agora, agora).run();

  return json({ ok: true });
}
