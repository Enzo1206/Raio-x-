(() => {
  const app = document.getElementById('app');
  const cfg = window.CONFIG;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmt = n => new Intl.NumberFormat('pt-BR').format(n || 0);
  const postar = async (url, corpo) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || 'Não deu certo. Tente de novo.');
    return dados;
  };
  const mostrar = html => {
    app.innerHTML = html;
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  };

  const estado = { username: '', analise: '', respostas: { jaFaz: [] }, indice: 0, poll: null };
  const vendeAlgo = r => ['proprio', 'afiliado', 'criando'].includes(r.vende);

  const PERGUNTAS = [
    { id: 'vende', titulo: 'Você vende algo pelo Instagram?', opcoes: [['proprio', 'Vendo produto ou serviço próprio'], ['afiliado', 'Vendo como afiliado'], ['criando', 'Estou criando meu produto'], ['nao', 'Ainda não vendo']] },
    { id: 'ticket', quando: vendeAlgo, titulo: 'Quanto custa o seu produto principal?', sub: 'É com esse valor que eu calculo quanto está em jogo.', opcoes: [[25, 'Até R$ 50'], [100, 'R$ 50 a R$ 150'], [300, 'R$ 150 a R$ 500'], [1000, 'R$ 500 a R$ 2 mil'], [3500, 'R$ 2 mil a R$ 5 mil'], [7500, 'R$ 5 mil a R$ 10 mil'], [20000, 'R$ 10 mil a R$ 30 mil'], [50000, 'Mais de R$ 30 mil']] },
    { id: 'faturamento', quando: vendeAlgo, titulo: 'Quanto você fatura por mês?', sub: 'Um valor aproximado. Isso não aparece no seu diagnóstico.', opcoes: [['ate5', 'Até R$ 5 mil'], ['5a20', 'R$ 5 mil a R$ 20 mil'], ['20a50', 'R$ 20 mil a R$ 50 mil'], ['50a100', 'R$ 50 mil a R$ 100 mil'], ['100mais', 'Mais de R$ 100 mil'], ['naodizer', 'Prefiro não dizer']] },
    { id: 'socialPct', quando: vendeAlgo, titulo: 'Quanto disso vem de conversas?', sub: 'Vendas fechadas no direct, nos comentários ou no WhatsApp.', opcoes: [[0, 'Nada ainda'], [10, 'Cerca de 10%'], [25, 'Cerca de 25%'], [50, 'Cerca de metade'], [75, 'A maior parte'], [100, 'Quase tudo']] },
    { id: 'jaFaz', varios: true, titulo: 'O que você já tem hoje?', sub: 'Marque tudo que vale. Se não tiver nenhum, é só continuar.', opcoes: [['automacao', 'Automação no direct'], ['time', 'Time comercial'], ['atende', 'Alguém que atende no Instagram']] },
  ];
  const fila = () => PERGUNTAS.filter(p => !p.quando || p.quando(estado.respostas));

  function capa() {
    mostrar(`<section class="capa"><div class="coluna">
      <p class="assinatura">${esc(cfg.nome)} · Vendas e IA</p>
      <h1>Tem gente pedindo para comprar de você. <em>Você viu?</em></h1>
      <p class="lead">Eu leio os comentários dos seus últimos posts e mostro quem levantou a mão, quanto isso vale em reais e o que fazer primeiro.</p>
      <ol class="passos">
        <li><b>1</b> Você manda o seu @</li>
        <li><b>2</b> Responde até 5 perguntas rápidas</li>
        <li><b>3</b> Eu te envio o seu diagnóstico com um plano de ação</li>
      </ol>
      <button class="btn" id="comecar">Fazer meu diagnóstico</button>
      <p class="miudo">Grátis · 2 minutos · Sem pedir sua senha</p>
    </div></section>`);
    document.getElementById('comecar').onclick = () => telaPerfil();
  }

  const topo = (texto, pct, comVoltar = true) => `
    <div class="topo">${comVoltar ? '<button class="voltar" id="voltar">← Voltar</button>' : '<span></span>'}<span>${esc(texto)}</span></div>
    <div class="barra"><i style="width:${pct}%"></i></div>`;

  function telaPerfil(valor = '') {
    pararPoll();
    mostrar(`<section class="coluna tela">${topo('Para começar', 5)}
      <h2>Qual é o seu @ no Instagram?</h2>
      <p class="sub">O perfil precisa ser público. Eu nunca peço a sua senha.</p>
      <form class="form" id="f" novalidate>
        <div><label for="u">Seu @</label><div class="campo" id="cu"><span aria-hidden="true">@</span><input id="u" value="${esc(valor)}" placeholder="seu.perfil" autocapitalize="none" autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="go"></div></div>
        <p class="erro" id="erro" role="alert"></p>
        <button class="btn" type="submit">Começar</button>
      </form></section>`);
    document.getElementById('voltar').onclick = capa;
    const campo = document.getElementById('u');
    campo.focus();
    document.getElementById('f').onsubmit = async e => {
      e.preventDefault();
      const btn = e.target.querySelector('.btn'), erro = document.getElementById('erro');
      const username = campo.value.trim().replace(/^@+/, '').replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '').toLowerCase();
      if (!/^[a-z0-9._]{2,30}$/.test(username)) {
        erro.textContent = 'Digite o @ de um perfil público.';
        document.getElementById('cu').classList.add('invalido');
        return;
      }
      btn.disabled = true;
      try {
        const r = await postar('/api/iniciar', { username });
        estado.username = r.username;
        estado.analise = r.estado;
        estado.indice = 0;
        acompanhar();
        telaPergunta();
      } catch (falha) {
        erro.textContent = falha.message;
        btn.disabled = false;
      }
    };
  }

  // A coleta roda enquanto a pessoa responde. Se o @ estiver errado, ela descobre antes do fim.
  function acompanhar() {
    pararPoll();
    const passo = async () => {
      try {
        const r = await fetch(`/api/status/${encodeURIComponent(estado.username)}`).then(x => x.json());
        const anterior = estado.analise;
        estado.analise = r.estado;
        // Na fila o resultado só sai mais tarde: não adianta continuar consultando daqui.
        if (['pronto', 'privado', 'nao_encontrado', 'sem_dados', 'fila'].includes(r.estado)) {
          pararPoll();
          if (anterior !== r.estado && document.getElementById('aviso')) atualizarAviso();
          return;
        }
      } catch { /* a próxima tentativa resolve */ }
      estado.poll = setTimeout(passo, 4000);
    };
    passo();
  }
  function pararPoll() { clearTimeout(estado.poll); estado.poll = null; }

  const textoAviso = () => ({
    privado: `O perfil @${esc(estado.username)} é privado, então não consigo ler os comentários.`,
    nao_encontrado: `Não encontrei o perfil @${esc(estado.username)}.`,
  })[estado.analise];
  function atualizarAviso() {
    const el = document.getElementById('aviso');
    const texto = textoAviso();
    el.innerHTML = texto ? `<div class="aviso">${texto} <button id="corrigir">Corrigir o @</button></div>` : '';
    const b = document.getElementById('corrigir');
    if (b) b.onclick = () => telaPerfil(estado.username);
  }

  function telaPergunta() {
    const perguntas = fila();
    if (estado.indice >= perguntas.length) return telaFinal();
    const p = perguntas[estado.indice];
    const pct = 10 + (estado.indice / perguntas.length) * 75;
    const marcado = v => p.varios ? estado.respostas.jaFaz.includes(v) : estado.respostas[p.id] === v;
    mostrar(`<section class="coluna tela">${topo(`Pergunta ${estado.indice + 1} de ${perguntas.length}`, pct)}
      <div id="aviso"></div>
      <h2>${esc(p.titulo)}</h2>${p.sub ? `<p class="sub">${esc(p.sub)}</p>` : ''}
      <div class="opcoes">${p.opcoes.map(([v, t], i) => `<button class="opcao" data-i="${i}" aria-pressed="${marcado(v)}">${esc(t)}</button>`).join('')}</div>
      ${p.varios ? '<div class="acoes"><button class="btn" id="seguir">Continuar</button></div>' : ''}
    </section>`);
    atualizarAviso();
    document.getElementById('voltar').onclick = () => {
      if (estado.indice === 0) return telaPerfil(estado.username);
      estado.indice--;
      telaPergunta();
    };
    app.querySelectorAll('.opcao').forEach(b => {
      b.onclick = () => {
        const v = p.opcoes[Number(b.dataset.i)][0];
        if (p.varios) {
          const lista = estado.respostas.jaFaz;
          const pos = lista.indexOf(v);
          if (pos >= 0) lista.splice(pos, 1); else lista.push(v);
          b.setAttribute('aria-pressed', String(pos < 0));
          return;
        }
        estado.respostas[p.id] = v;
        if (p.id === 'vende' && !vendeAlgo(estado.respostas)) {
          for (const k of ['ticket', 'faturamento', 'socialPct']) delete estado.respostas[k];
        }
        estado.indice++;
        telaPergunta();
      };
    });
    if (p.varios) document.getElementById('seguir').onclick = () => { estado.indice++; telaPergunta(); };
  }

  function telaFinal() {
    mostrar(`<section class="coluna tela">${topo('Último passo', 92)}
      <div id="aviso"></div>
      <h2>Posso preparar o seu diagnóstico?</h2>
      <p class="sub">Vou analisar o @${esc(estado.username)} e te enviar o resultado.</p>
      <form class="form" id="f" novalidate>
        <label class="aceite"><input type="checkbox" id="aceite"><span>Autorizo ${esc(cfg.nome)} a analisar este perfil, usar minhas respostas para gerar o diagnóstico e falar comigo pelo Instagram sobre ele. Veja a <a href="/privacidade.html" target="_blank" rel="noopener">política de privacidade</a>.</span></label>
        <p class="erro" id="erro" role="alert"></p>
        <button class="btn" type="submit">Enviar</button>
      </form></section>`);
    atualizarAviso();
    document.getElementById('voltar').onclick = () => { estado.indice = fila().length - 1; telaPergunta(); };
    document.getElementById('f').onsubmit = async e => {
      e.preventDefault();
      const btn = e.target.querySelector('.btn'), erro = document.getElementById('erro');
      btn.disabled = true;
      erro.textContent = '';
      try {
        await postar('/api/lead', {
          username: estado.username,
          consentimento: document.getElementById('aceite').checked,
          respostas: estado.respostas,
          origem: new URLSearchParams(location.search).get('utm_source') || 'bio',
        });
        telaEnviado();
      } catch (falha) {
        erro.textContent = falha.message;
        btn.disabled = false;
      }
    };
  }

  // O relatório fica com o dono da página: esta tela não recebe o link dele.
  function telaEnviado() {
    mostrar(`<section class="coluna tela espera">
      <h2>Recebi, ${'@' + esc(estado.username)}!</h2>
      <p class="sub" role="status">Vou preparar o seu diagnóstico e te enviar em breve. Me chama no direct para a minha resposta não ficar perdida nas suas solicitações.</p>
      <div class="acoes"><a class="btn" href="https://ig.me/m/${esc(cfg.instagram)}">Me chamar no direct</a></div>
    </section>`);
  }

  async function carregarRelatorio(id, tentativa = 0) {
    if (tentativa === 0) {
      mostrar(`<section class="coluna tela espera"><div class="pulso" aria-hidden="true"></div>
        <h2>Lendo os seus comentários…</h2><p class="sub" role="status">Costuma levar menos de um minuto. Pode deixar esta tela aberta.</p></section>`);
    }
    try {
      const r = await fetch(`/api/relatorio/${encodeURIComponent(id)}`);
      if (r.status === 404) return naoAchou();
      const d = await r.json();
      if (d.pronto) return mostrar(relatorio(d.relatorio, d.estado, id));
    } catch { /* tenta de novo abaixo */ }
    if (tentativa < 60) return void setTimeout(() => carregarRelatorio(id, tentativa + 1), 4000);
    mostrar(`<section class="coluna tela espera"><h2>Está demorando mais do que o normal.</h2>
      <p class="sub">Guarde este link e abra de novo em alguns minutos. Seu diagnóstico continua aqui.</p>
      <div class="acoes"><button class="btn" onclick="location.reload()">Tentar de novo</button></div></section>`);
  }

  function naoAchou() {
    mostrar(`<section class="coluna tela espera"><h2>Não encontrei esse diagnóstico.</h2>
      <p class="sub">Confira o link ou faça o seu agora.</p>
      <div class="acoes"><a class="btn" href="/">Fazer meu diagnóstico</a></div></section>`);
  }

  const GRUPOS = [
    ['compra', 'Querem comprar', 'Pediram preço, link ou vaga.', true],
    ['duvida', 'Têm dúvida', 'Quase lá: falta uma resposta.', false],
    ['elogio', 'Elogiaram', 'Gostam de você e podem virar conversa.', false],
    ['critica', 'Criticaram', 'Vale responder antes que outros leiam.', false],
  ];

  const compacto = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} mi` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',')} mil` : fmt(n));
  const plural = (n, um, varios) => `${compacto(n)} ${n === 1 ? um : varios}`;
  const dia = d => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
  const imagem = (u, classe) => (u ? `<img class="${classe}" src="/api/img?u=${encodeURIComponent(u)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '');
  const linkSeguro = u => (/^https?:\/\//i.test(u) ? u : '');
  const numero = (valor, rotulo) => `<div><b>${valor}</b><span>${esc(rotulo)}</span></div>`;

  function comentarioHtml(e, respostasConhecidas) {
    const resposta = respostasConhecidas ? (e.respondido ? 'Tem resposta' : 'Sem resposta visível') : '';
    const detalhes = [dia(e.data), e.likes ? `${fmt(e.likes)} ${e.likes === 1 ? 'curtida' : 'curtidas'}` : '', resposta].filter(Boolean).join(' · ');
    return `<div class="comentario"><strong>${esc(e.autor)}</strong> ${esc(e.texto)}<small>${esc(detalhes)}</small></div>`;
  }

  function grupo([chave, titulo, sub, quente], r) {
    const c = r.comentarios;
    const n = c.contagem[chave] || 0;
    const lista = c.exemplos[chave] || [];
    const valor = r.dinheiro?.categorias.find(x => x.classe === chave);
    const meta = [
      valor ? `R$ ${fmt(valor.valorAno)} por ano` : '',
      n && c.respostasConhecidas ? `${fmt(c.respondidos[chave] || 0)} de ${fmt(n)} com resposta visível` : '',
      chave === 'elogio' && n ? `${fmt(c.subtipos.elogio)} sobre o conteúdo e ${fmt(c.subtipos.apoio_pessoal)} de apoio pessoal` : '',
    ].filter(Boolean);
    const extras = lista.slice(3);
    return `<div class="grupo${quente && n ? ' quente' : ''}"><header><span>${esc(titulo)}</span><b>${fmt(n)}</b></header>
      <p class="vazio">${esc(sub)}</p>${meta.map(m => `<p class="dado">${esc(m)}</p>`).join('')}
      ${lista.slice(0, 3).map(e => comentarioHtml(e, c.respostasConhecidas)).join('') || '<p class="vazio">Nenhum nos comentários lidos.</p>'}
      ${extras.length ? `<details><summary>Ver mais ${extras.length}</summary>${extras.map(e => comentarioHtml(e, c.respostasConhecidas)).join('')}</details>` : ''}</div>`;
  }

  function cartaoPost(p) {
    const cta = { venda: 'Pede para comprar', conversa: 'Pede conversa' }[p.cta.tipo] || 'Sem chamada para ação';
    const numeros = [p.views ? `${compacto(p.views)} views` : '', p.likes === null ? '' : plural(p.likes, 'curtida', 'curtidas'), plural(p.comentarios, 'comentário', 'comentários')].filter(Boolean).join(' · ');
    const url = linkSeguro(p.url);
    const abre = url ? `<a class="post" href="${esc(url)}" target="_blank" rel="noopener">` : '<div class="post">';
    return `${abre}${imagem(p.capa, 'miniatura')}<div><strong>${esc(p.tipo)} · ${esc(dia(p.data))}${p.fixado ? ' · Fixado' : ''}</strong>
      <small>${esc(numeros)}</small><small>${esc(cta)}${p.cta.palavra ? `: ${esc(p.cta.palavra)}` : ''}</small></div>${url ? '</a>' : '</div>'}`;
  }

  function blocoPerfil(r) {
    const p = r.perfil;
    const selos = [p.verificado ? 'Verificado' : '', p.negocio ? 'Conta comercial' : '', p.categoria].filter(Boolean).join(' · ');
    const link = linkSeguro(p.link);
    return `<section class="bloco"><div class="coluna"><h2>Seu perfil</h2>
      ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
      ${selos ? `<p class="dado">${esc(selos)}</p>` : ''}
      ${link ? `<p class="dado"><a href="${esc(link)}" target="_blank" rel="noopener nofollow">${esc(link)}</a></p>` : '<p class="dado">Sem link na bio</p>'}
      <div class="numeros">${numero(compacto(p.seguidores), 'seguidores')}${numero(compacto(p.seguindo), 'seguindo')}${numero(compacto(p.publicacoes), 'publicações no total')}</div>
    </div></section>`;
  }

  function blocoPeriodo(r) {
    const { posts: p, comentarios: c } = r;
    return `<section class="bloco"><div class="coluna"><h2>Seus últimos ${r.dias} dias</h2>
      <p class="sub">De ${esc(dia(p.de))} a ${esc(dia(p.ate))}.</p>
      <div class="numeros">
        ${numero(fmt(p.total), 'publicações')}
        ${numero(compacto(p.views), `views em ${p.videos} ${p.videos === 1 ? 'Reel' : 'Reels'}`)}
        ${numero(compacto(p.likes), 'curtidas')}
        ${numero(fmt(c.totalIG), 'comentários')}
        ${numero(String(p.porSemana).replace('.', ','), 'posts por semana')}
        ${numero(fmt(p.comentariosPorMes), 'comentários por mês')}
      </div>
      ${p.likesIndisponiveis ? `<p class="dado">O total de curtidas não inclui ${fmt(p.likesIndisponiveis)} ${p.likesIndisponiveis === 1 ? 'publicação' : 'publicações'} em que esse número não veio confiável.</p>` : ''}
      ${p.lista.length ? `<h3 class="subtitulo">Publicações mais comentadas</h3><div class="posts">${p.lista.slice(0, 6).map(cartaoPost).join('')}</div>` : ''}
    </div></section>`;
  }

  function blocoCta(r) {
    const p = r.posts;
    const m = p.melhorCta;
    return `<section class="bloco"><div class="coluna"><h2>Chamadas para ação</h2>
      <p class="sub">Li a legenda de cada publicação. O que é dito só no vídeo fica de fora.</p>
      <div class="numeros">${numero(fmt(p.venda), 'pedem para comprar')}${numero(fmt(p.conversa), 'pedem conversa')}${numero(fmt(p.semCta), 'sem pedido')}</div>
      <div class="numeros dois">${numero(String(p.mediaComentarios.comCta).replace('.', ','), 'comentários por post com pedido')}${numero(String(p.mediaComentarios.semCta).replace('.', ','), 'comentários por post sem pedido')}</div>
      ${p.palavrasChave.length ? `<p class="dado"><span>Palavras-chave usadas:</span> ${esc(p.palavrasChave.join(', '))}</p>` : '<p class="dado">Nenhuma palavra-chave nas legendas.</p>'}
      ${m ? `<div class="grupo"><header><span>Sua melhor chamada</span></header><div class="comentario">${esc(m.trecho)}<small>${esc(m.tipo)} · ${plural(m.comentarios, 'comentário', 'comentários')} ${m.likes === null ? '' : ` · ${plural(m.likes, 'curtida', 'curtidas')}`}</small></div></div>` : ''}
    </div></section>`;
  }

  function blocoDinheiro(r) {
    const d = r.dinheiro;
    if (!d) return '';
    const amostra = d.escala > 1 ? ` Li uma amostra dos comentários, então multipliquei por ${String(d.escala).replace('.', ',')} para chegar ao total.` : '';
    return `<section class="bloco"><div class="coluna"><h2>De onde vem o valor</h2>
      <div class="numeros dois">${numero(`R$ ${fmt(d.periodo)}`, `nos últimos ${r.dias} dias`)}${numero(String(d.clientesPeriodo).replace('.', ','), 'clientes estimados no período')}</div>
      <table class="tabela"><thead><tr><th>Categoria</th><th>Qtd.</th><th>Taxa</th><th>Por ano</th></tr></thead><tbody>
      ${d.categorias.map(c => `<tr><td>${esc(c.rotulo)}</td><td>${fmt(c.n)}</td><td>${String(c.taxa * 100).replace('.', ',')}%</td><td>R$ ${fmt(c.valorAno)}</td></tr>`).join('')}
      </tbody></table>
      <p class="dado">Usei o preço de R$ ${fmt(d.ticket)} e levei o período de ${r.dias} dias para um ano.${amostra} As taxas são suposições, não vendas medidas. A classificação é automática e pode ter erros.</p>
      <div class="grupo"><header><span>E no direct?</span></header>
        <p class="dado">Se o direct tiver de ${d.direct.multMin} a ${d.direct.multMax} vezes mais conversas que os comentários, o valor iria de R$ ${fmt(d.direct.min)} a R$ ${fmt(d.direct.max)} por ano. É uma hipótese: este diagnóstico não lê mensagens do direct.</p></div>
    </div></section>`;
  }

  function hero(r, estadoFinal) {
    const quem = `<div class="quem">${r.perfil ? imagem(r.perfil.foto, 'foto') : ''}<p>Diagnóstico de @${esc(r.username)}${r.perfil?.nome ? `<br>${esc(r.perfil.nome)}` : ''}</p></div>`;
    if (r.semDados) {
      const motivo = {
        privado: 'Seu perfil é privado, então este diagnóstico usa só as suas respostas.',
        nao_encontrado: 'Não encontrei esse @, então este diagnóstico usa só as suas respostas.',
      }[estadoFinal] || 'Não consegui ler seus comentários agora, então este diagnóstico usa só as suas respostas.';
      return `<section class="hero"><div class="coluna">${quem}<h1>Seu próximo passo está aqui embaixo.</h1><p class="nota">${motivo}</p></div></section>`;
    }
    const d = r.dinheiro;
    if (d && d.ano > 0) {
      return `<section class="hero"><div class="coluna">${quem}<p class="rotulo">Vendas em jogo nos seus comentários</p>
        <p class="valor">R$ ${fmt(d.ano)}</p><p class="nota">por ano, numa estimativa com o seu preço e os seus últimos ${r.dias} dias.</p></div></section>`;
    }
    const n = r.comentarios.contagem.compra + r.comentarios.contagem.duvida;
    return `<section class="hero"><div class="coluna">${quem}<p class="rotulo">Mãos levantadas nos seus comentários</p>
      <p class="valor">${fmt(n)}</p><p class="nota">pessoas pediram preço, link ou tiraram dúvida nos últimos ${r.dias} dias.</p></div></section>`;
  }

  function relatorio(r, estadoFinal, id) {
    const link = `${location.origin}/?r=${id}`;
    const mensagem = `Oi, ${cfg.nome}! Fiz o diagnóstico do @${r.username}: ${link}`;
    const cta = cfg.whatsapp
      ? `<a class="btn" href="https://wa.me/${esc(cfg.whatsapp)}?text=${encodeURIComponent(mensagem)}">${esc(cfg.chamadaFinal)}</a>`
      : `<a class="btn" href="https://ig.me/m/${esc(cfg.instagram)}">${esc(cfg.chamadaFinal)}</a>`;

    const c = r.comentarios;
    const dadosReais = r.semDados ? '' : `
      ${blocoPerfil(r)}${blocoPeriodo(r)}${blocoCta(r)}
      <section class="bloco"><div class="coluna"><h2>Quem levantou a mão</h2>
        <p class="sub">Separei cada comentário pelo que a pessoa quis dizer.</p>
        <div class="numeros">${numero(fmt(c.lidos), 'comentários lidos')}${numero(fmt(c.analisados), 'analisados')}${numero(fmt(c.descartados), 'só emoji ou sem assunto')}</div>
        <p class="dado">Li ${fmt(c.lidos + c.doDono)} de ${fmt(c.totalIG)} comentários do período. Respostas dentro de conversas não entram nesta leitura.</p>
        ${c.coletados ? '' : '<p class="vazio">Não consegui ler os comentários desta vez. Os números abaixo usam só as suas publicações.</p>'}
        ${GRUPOS.map(g => grupo(g, r)).join('')}
      </div></section>
      <section class="bloco"><div class="coluna"><h2>Onde a venda escapa</h2>
        <p class="sub">Uma nota de 0 a 100 para cada etapa.</p>
        ${r.funil.geral === null ? '' : `<div class="numeros dois">${numero(fmt(r.funil.geral), 'nota geral do funil')}${numero(esc(r.funil.nivel), 'seu nível hoje')}</div>`}
        ${r.funil.etapas.map(e => `<div class="etapa${e.chave === r.funil.quebra ? ' quebra' : ''}">
          <header>${esc(e.titulo)}<span>${e.nota === null ? '–' : e.nota}</span></header>
          <div class="trilho"><i style="width:${e.nota || 0}%"></i></div>
          <p>${esc(e.leitura)}</p>${e.chave === r.funil.quebra ? '<span class="selo">Comece por aqui</span>' : ''}</div>`).join('')}
      </div></section>
      ${blocoDinheiro(r)}`;

    return `${hero(r, estadoFinal)}${dadosReais}
      <section class="bloco"><div class="coluna"><h2>Seu plano de ação</h2>
        <ol class="plano">${r.plano.map(a => `<li><div><h3>${esc(a.titulo)}</h3><p>${esc(a.texto)}</p></div></li>`).join('')}</ol>
      </div></section>
      <section class="bloco"><div class="coluna"><h2>Quanto falta</h2>
        <p class="pct">${r.caminho.pct}%</p><p class="sub">do caminho para vender pelo Instagram com processo.</p>
        <ul class="caminho">${r.caminho.itens.map(i => `<li class="${i.ok ? 'ok' : ''}">${esc(i.texto)}</li>`).join('')}</ul>
      </div></section>
      <section class="final"><div class="coluna"><h2>Quer colocar isso para rodar?</h2>
        <p>Me chama com o seu diagnóstico e eu te digo qual é o primeiro passo para o seu caso.</p>${cta}
      </div></section>
      <footer class="rodape coluna">${esc(cfg.nome)} · <a href="/privacidade.html">Privacidade</a></footer>`;
  }

  const id = new URLSearchParams(location.search).get('r');
  if (id) carregarRelatorio(id); else capa();
  window.addEventListener('popstate', () => location.reload());
})();
