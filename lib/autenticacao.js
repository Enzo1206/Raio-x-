const resumo = async texto => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));

// Compara os resumos, não os textos, para o tempo de resposta não revelar a senha.
export async function segredoCerto(request, certo) {
  if (!certo) return false;
  const enviado = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const [a, b] = await Promise.all([resumo(enviado), resumo(certo)]);
  return a.reduce((dif, byte, i) => dif | (byte ^ b[i]), 0) === 0;
}
