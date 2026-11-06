import { montarRelatorio } from '../../../lib/analise.js';
import { avancar, FINAIS, lerAnalise } from '../../../lib/coleta.js';

export async function onRequestGet({ params, env }) {
  const lead = await env.DB.prepare('SELECT username, respostas FROM leads WHERE id = ?').bind(params.id).first();
  if (!lead) return Response.json({ erro: 'Diagnóstico não encontrado.' }, { status: 404 });

  const linha = await avancar(env, await lerAnalise(env, lead.username));
  if (!linha || !FINAIS.has(linha.estado)) return Response.json({ pronto: false });

  const dados = linha.estado === 'pronto' ? JSON.parse(linha.dados) : null;
  return Response.json({
    pronto: true,
    estado: linha.estado,
    relatorio: montarRelatorio(dados, JSON.parse(lead.respostas), lead.username),
  });
}
