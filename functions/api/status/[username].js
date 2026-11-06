import { avancar, lerAnalise } from '../../../lib/coleta.js';

export async function onRequestGet({ params, env }) {
  const username = String(params.username).toLowerCase();
  const linha = await avancar(env, await lerAnalise(env, username));
  if (!linha) return Response.json({ erro: 'Análise não encontrada.' }, { status: 404 });
  return Response.json({ username, estado: linha.estado });
}
