(() => {
  const raiz = document.getElementById('painel');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // A senha fica só na memória desta aba: fechou, precisa digitar de novo.
  let senha = '', timer = null;

  const VENDE = { proprio: 'Produto ou serviço próprio', afiliado: 'Afiliado', criando: 'Criando produto', nao: 'Ainda não vende' };
  const TICKET = { 25: 'Até R$ 50', 100: 'R$ 50 a R$ 150', 300: 'R$ 150 a R$ 500', 1000: 'R$ 500 a R$ 2 mil', 3500: 'R$ 2 mil a R$ 5 mil', 7500: 'R$ 5 mil a R$ 10 mil', 20000: 'R$ 10 mil a R$ 30 mil', 50000: 'Mais de R$ 30 mil' };
  const FATURAMENTO = { ate5: 'Até R$ 5 mil', '5a20': 'R$ 5 mil a R$ 20 mil', '20a50': 'R$ 20 mil a R$ 50 mil', '50a100': 'R$ 50 mil a R$ 100 mil', '100mais': 'Mais de R$ 100 mil', naodizer: 'Preferiu não dizer' };
  const JA_FAZ = { automacao: 'automação', time: 'time comercial', atende: 'atendimento no Instagram' };
  const ESTADO = {
    pronto: 'Completo',
    privado: 'Perfil privado: só com respostas',
    nao_encontrado: '@ não encontrado: só com respostas',
    sem_dados: 'Sem leitura: só com respostas',
  };
  const FINAIS = Object.keys(ESTADO);

  function login(msg = '') {
    raiz.innerHTML = `<section class="coluna tela">
      <h2>Painel de diagnósticos</h2>
      <form class="form" id="f" novalidate>
        <div><label for="s">Senha</label><div class="campo"><input id="s" type="password" autocomplete="current-password"></div></div>
        <p class="erro" id="erro" role="alert">${esc(msg)}</p>
        <button class="btn" type="submit">Entrar</button>
      </form></section>`;
    document.getElementById('f').onsubmit = e => {
      e.preventDefault();
      senha = document.getElementById('s').value;
      carregar();
    };
    document.getElementById('s').focus();
  }

  const linha = (rotulo, valor) => (valor ? `<p class="dado"><span>${esc(rotulo)}</span> ${esc(valor)}</p>` : '');

  function cartao(l) {
    const r = l.respostas;
    const pronto = FINAIS.includes(l.estado);
    const data = new Date(l.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const jaFaz = (r.jaFaz || []).map(v => JA_FAZ[v]).join(', ');
    return `<article class="grupo">
      <header><a href="https://instagram.com/${esc(l.username)}" target="_blank" rel="noopener">@${esc(l.username)}</a><small>${esc(data)}</small></header>
      <p class="selo-estado${pronto ? '' : ' andando'}">${esc(ESTADO[l.estado] || (l.estado === 'fila' ? 'Na fila: ligue o coletor' : 'Analisando…'))}</p>
      ${linha('Vende', VENDE[r.vende])}
      ${linha('Preço', TICKET[r.ticket])}
      ${linha('Faturamento', FATURAMENTO[r.faturamento])}
      ${linha('Vem de conversas', r.socialPct === null || r.socialPct === undefined ? '' : `${r.socialPct}%`)}
      ${linha('Já tem', jaFaz || 'Nada marcado')}
      ${pronto ? `<div class="acoes-painel"><a class="btn" href="/?r=${esc(l.id)}" target="_blank" rel="noopener">Abrir relatório</a><button class="btn claro" data-id="${esc(l.id)}">Copiar link</button></div>` : ''}
    </article>`;
  }

  async function carregar() {
    clearTimeout(timer);
    let r;
    try {
      r = await fetch('/api/painel', { headers: { Authorization: `Bearer ${senha}` } });
    } catch {
      timer = setTimeout(carregar, 8000);
      return;
    }
    if (r.status === 401) return login('Senha incorreta.');
    const { leads } = await r.json();
    raiz.innerHTML = `<section class="coluna tela">
      <h2>${leads.length} ${leads.length === 1 ? 'diagnóstico' : 'diagnósticos'}</h2>
      <p class="sub">Copie o link do relatório e envie para a pessoa.</p>
      ${leads.length ? leads.map(cartao).join('') : '<p class="vazio">Ainda não chegou nenhum.</p>'}
    </section>`;
    raiz.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = async () => {
        const link = `${location.origin}/?r=${b.dataset.id}`;
        try {
          await navigator.clipboard.writeText(link);
          b.textContent = 'Copiado!';
        } catch {
          window.prompt('Copie o link:', link);
        }
      };
    });
    // Continua só enquanto há coleta em andamento, para não redesenhar a tela à toa.
    if (leads.some(l => !FINAIS.includes(l.estado))) timer = setTimeout(carregar, 30000);
  }

  login();
})();
