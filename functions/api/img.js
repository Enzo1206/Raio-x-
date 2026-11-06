// O Instagram bloqueia imagens abertas por outros sites. Só repassa imagens dos servidores dele.
const HOSTS = ['.cdninstagram.com', '.fbcdn.net'];

export async function onRequestGet({ request }) {
  let alvo;
  try {
    alvo = new URL(new URL(request.url).searchParams.get('u'));
  } catch {
    return new Response(null, { status: 404 });
  }
  if (alvo.protocol !== 'https:' || !HOSTS.some(h => alvo.hostname.endsWith(h))) return new Response(null, { status: 404 });

  const r = await fetch(alvo.href, {
    redirect: 'manual',
    headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
  }).catch(e => {
    console.error('img', e.message);
    return null;
  });
  const tipo = r?.headers.get('content-type') || '';
  if (!r?.ok || !tipo.startsWith('image/')) {
    console.error('img', r?.status, tipo);
    return new Response(null, { status: 404 });
  }
  return new Response(r.body, { headers: { 'Content-Type': tipo, 'Cache-Control': 'public, max-age=86400' } });
}
