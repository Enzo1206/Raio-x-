// Regras do diagnóstico: funções puras, sem rede e sem banco, para poder testar tudo.

// Premissas do cálculo em reais. Ajuste aqui: o relatório mostra estes números para o lead.
export const TAXAS = { compra: 0.10, duvida: 0.03, elogio: 0.005 };
// Hipótese, sem medição: o direct costuma ter mais conversas do que os comentários.
export const MULTIPLICADOR_DIRECT = { min: 5, max: 6 };

export const normalizar = t => String(t ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const SPAM = /https?:\/\/|www\.|\bsigo de volta\b|\bsiga\b|\bparceria\b|\bdivulg|\bpromo\b|\bganhe\b|\brenda extra\b|\bcollab\b/;
const CRITICA = /\bgolpe\b|\bfraude\b|\benganacao\b|\bhorrivel\b|\bpessimo\b|\blixo\b|\bmentira\b|\bfurada\b|\bnao funciona\b|\bpalhacada\b/;
const COMPRA = /\bquanto (custa|e|fica|sai|ta|esta|cobra)\b|\bqual (e )?(o )?(valor|preco)\b|\bpreco\b|\bvalores\b|\bvalor\s*\?|\blink\b|\beu quero\b|^quero\b|\bcomo (faco|compro|contrato|adquiro|assino|entro)\b|\bonde (compro|encontro|acho|contrato)\b|\bvagas?\b|\bparcel|\bdesconto\b|\bme (manda|envia|passa|chama)\b|\bcomprar\b|\bcontratar\b|\bto dentro\b|\bchama (no|na) (dm|direct|pv|inbox)\b|\bpix\b|\b(pra|para) (a |o )?(minha|meu|nossa|nosso|sua|seu) (clinica|consultorio|empresa|negocio|loja|escritorio|equipe|time|comercial)\b/;
const DUVIDA = /\?\s*$|^(como|qual|quais|quando|onde|por que|porque|funciona|serve|da pra|tem como|e pra)\b/;
const APOIO_PESSOAL = /\bte amo\b|\blind[a-z]*|\bgat(inh)?[oa]+\b|\bbelo\b|\bbela\b|\bamigo\b|\bamiga\b|\borgulho\b|\bsaudade\b/;
const ELOGIO = /\btop\b|\bshow\b|\bincrivel\b|\bparabens\b|\bamei\b|\badorei\b|\bsensacional\b|\bperfeito\b|\bexcelente\b|\bmuito bom\b|\bmuito boa\b|\bmelhor\b|\bbrabo\b|\babsurdo+\b|\bmassa\b|\bverdade\b|\bfaz sentido\b|\be (bem )?isso\b|\bwow\b|\bdiferenciado\b|\bchique\b/;
const SEM_LETRAS = /^[^\p{L}\p{N}]+$/u;

// compra | duvida | elogio | critica | reacao | outro
export function classificar(texto) {
  const t = normalizar(texto);
  if (!t) return 'outro';
  if (SEM_LETRAS.test(t)) return 'reacao';
  if (SPAM.test(t)) return 'outro';
  if (CRITICA.test(t)) return 'critica';
  if (COMPRA.test(t)) return 'compra';
  if (DUVIDA.test(t)) return 'duvida';
  if (APOIO_PESSOAL.test(t) || ELOGIO.test(t)) return 'elogio';
  return 'outro';
}

// Só faz sentido para quem já foi classificado como elogio.
export const subtipoElogio = texto => (APOIO_PESSOAL.test(normalizar(texto)) ? 'apoio_pessoal' : 'elogio');

const CTA_VENDA = /\bcomenta\b|\bcomente\b|\bme chama\b|\bchama no\b|\blink na bio\b|\blink da bio\b|\bmanda (uma |um )?(dm|direct|mensagem)\b|\bgaranta\b|\binscreva\b|\bclique\b|\bagende\b|\bfale comigo\b/;
const CTA_CONVERSA = /\bme conta\b|\bme diz\b|\bresponde\b|\bo que voce acha\b|\bnos comentarios\b/;

// venda | conversa | null. Só "venda" leva a pessoa para uma conversa comercial.
export function detectarCta(legenda) {
  const t = normalizar(legenda);
  if (CTA_VENDA.test(t)) return 'venda';
  if (CTA_CONVERSA.test(t)) return 'conversa';
  return null;
}

// A frase da legenda que faz o pedido e a palavra-chave, se houver.
export function detalharCta(legenda) {
  const tipo = detectarCta(legenda);
  if (!tipo) return { tipo: null, trecho: '', palavra: '' };
  const regra = tipo === 'venda' ? CTA_VENDA : CTA_CONVERSA;
  const frases = String(legenda).split(/(?<=[.!?\n])\s*/);
  const trecho = (frases.find(f => regra.test(normalizar(f))) || '').trim().slice(0, 160);
  const palavra = /\b(?:[Cc]oment[ae]|COMENT[AE])\s+["“']?([A-ZÀ-Ú]{3,})\b/.exec(String(legenda))?.[1] || '';
  return { tipo, trecho, palavra };
}

const DIA = 86400000;

// Escolhe os posts que valem o gasto: só os da janela, os mais comentados primeiro.
export function escolherPosts(posts, agora = Date.now(), janelaDias = 90, maxPosts = 6) {
  const naJanela = posts.filter(p => agora - new Date(p.timestamp).getTime() <= janelaDias * DIA);
  const base = naJanela.length ? naJanela : posts;
  const comComentarios = base
    .filter(p => (p.commentsCount || 0) > 0 && !p.isCommentsDisabled)
    .sort((a, b) => b.commentsCount - a.commentsCount)
    .slice(0, maxPosts);
  return { base, comComentarios };
}

const TIPO_POST = { Video: 'Reel', Sidecar: 'Carrossel', Image: 'Foto' };
const contagemValida = n => (Number.isFinite(n) && n > 0 ? n : 0);
const umaCasa = n => Math.round(n * 10) / 10;
const media = lista => (lista.length ? umaCasa(lista.reduce((s, n) => s + n, 0) / lista.length) : 0);

function resumirPosts(posts, dias) {
  const lista = posts.map(p => {
    const cta = detalharCta(p.caption);
    return {
      url: p.url || '',
      tipo: TIPO_POST[p.type] || 'Post',
      data: p.timestamp || '',
      fixado: Boolean(p.isPinned),
      // Curtidas ocultas ou não confiáveis chegam como -1: é melhor não mostrar do que mostrar errado.
      likes: Number.isFinite(p.likesCount) && p.likesCount >= 0 ? p.likesCount : null,
      views: Math.max(contagemValida(p.videoPlayCount), contagemValida(p.videoViewCount)),
      comentarios: contagemValida(p.commentsCount),
      capa: p.displayUrl || '',
      legenda: String(p.caption || '').slice(0, 120),
      cta,
    };
  }).sort((a, b) => b.comentarios - a.comentarios);

  const comCta = lista.filter(p => p.cta.tipo);
  const semCta = lista.filter(p => !p.cta.tipo);
  const videos = lista.filter(p => p.views > 0);
  const datas = lista.map(p => p.data).filter(Boolean).sort();
  const melhor = comCta[0];
  return {
    total: lista.length,
    venda: comCta.filter(p => p.cta.tipo === 'venda').length,
    conversa: comCta.filter(p => p.cta.tipo === 'conversa').length,
    semCta: semCta.length,
    de: datas[0] || '',
    ate: datas[datas.length - 1] || '',
    likes: lista.reduce((s, p) => s + (p.likes || 0), 0),
    likesIndisponiveis: lista.filter(p => p.likes === null).length,
    views: videos.reduce((s, p) => s + p.views, 0),
    videos: videos.length,
    porSemana: umaCasa(lista.length / (dias / 7)),
    comentariosPorMes: Math.round(lista.reduce((s, p) => s + p.comentarios, 0) / (dias / 30)),
    mediaComentarios: { comCta: media(comCta.map(p => p.comentarios)), semCta: media(semCta.map(p => p.comentarios)) },
    melhorCta: melhor ? { tipo: melhor.tipo, trecho: melhor.cta.trecho, comentarios: melhor.comentarios, likes: melhor.likes, url: melhor.url } : null,
    palavrasChave: [...new Set(comCta.map(p => p.cta.palavra).filter(Boolean))],
    lista,
  };
}

// Resume os dados brutos no que fica salvo. Não guarda nenhuma resposta do lead.
export function resumir({ perfil, posts, comentarios, coletouComentarios = true }, agora = Date.now()) {
  const datas = posts.map(p => new Date(p.timestamp).getTime()).filter(Number.isFinite);
  const dias = datas.length ? Math.max(14, Math.ceil((agora - Math.min(...datas)) / DIA)) : 90;
  const contagem = { compra: 0, duvida: 0, elogio: 0, critica: 0, reacao: 0, outro: 0 };
  const respondidos = { compra: 0, duvida: 0, elogio: 0, critica: 0 };
  const exemplos = { compra: [], duvida: [], elogio: [], critica: [] };
  const subtipos = { elogio: 0, apoio_pessoal: 0 };
  let lidos = 0, doDono = 0;
  // O plano grátis da Apify devolve repliesCount vazio: sem esse dado, não dá para dizer quem ficou sem resposta.
  const respostasConhecidas = comentarios.some(c => c.repliesCount !== null && c.repliesCount !== undefined);

  for (const c of comentarios) {
    if (normalizar(c.ownerUsername) === normalizar(perfil.username)) {
      doDono++;
      continue;
    }
    const classe = classificar(c.text);
    lidos++;
    contagem[classe]++;
    if (classe === 'elogio') subtipos[subtipoElogio(c.text)]++;
    const respondido = (c.repliesCount || 0) > 0;
    if (classe in respondidos && respondido) respondidos[classe]++;
    if (exemplos[classe] && exemplos[classe].length < 20) {
      exemplos[classe].push({
        autor: c.ownerUsername || '',
        texto: String(c.text).slice(0, 200),
        respondido,
        data: c.timestamp || '',
        likes: contagemValida(c.likesCount),
      });
    }
  }

  const totalIG = posts.reduce((s, p) => s + contagemValida(p.commentsCount), 0);
  const descartados = contagem.reacao + contagem.outro;
  return {
    perfil: {
      username: perfil.username,
      nome: perfil.fullName || '',
      bio: String(perfil.biography || '').slice(0, 300),
      link: perfil.externalUrl || '',
      seguidores: contagemValida(perfil.followersCount),
      seguindo: contagemValida(perfil.followsCount),
      publicacoes: contagemValida(perfil.postsCount),
      verificado: Boolean(perfil.verified),
      negocio: Boolean(perfil.isBusinessAccount),
      categoria: perfil.businessCategoryName || '',
      foto: perfil.profilePicUrlHD || perfil.profilePicUrl || '',
    },
    dias,
    posts: resumirPosts(posts, dias),
    comentarios: {
      totalIG,
      lidos,
      doDono,
      analisados: lidos - descartados,
      descartados,
      cobertura: totalIG ? Math.min(100, Math.round(((lidos + doDono) / totalIG) * 100)) : 0,
      coletados: coletouComentarios,
      respostasConhecidas,
      contagem,
      subtipos,
      respondidos,
      maos: contagem.compra + contagem.duvida,
      respondidas: respondidos.compra + respondidos.duvida,
      exemplos,
    },
  };
}

const arredonda = n => Math.round(n / 10) * 10;
const ROTULOS = { compra: 'Intenções de compra', duvida: 'Dúvidas', elogio: 'Elogios e apoio' };

export function calcularDinheiro(dados, ticket) {
  if (!ticket || !dados.comentarios.lidos) return null;
  const { contagem, totalIG, lidos, doDono = 0 } = dados.comentarios;
  const escala = Math.max(1, totalIG / (lidos + doDono));
  const anualizar = 365 / dados.dias;
  const categorias = Object.keys(TAXAS).map(classe => {
    const clientes = contagem[classe] * TAXAS[classe] * escala;
    return { classe, rotulo: ROTULOS[classe], n: contagem[classe], taxa: TAXAS[classe], valorAno: arredonda(clientes * ticket * anualizar) };
  });
  const clientes = categorias.reduce((s, c) => s + c.n * c.taxa * escala, 0);
  const ano = arredonda(clientes * ticket * anualizar);
  return {
    ticket,
    escala: umaCasa(escala),
    clientesPeriodo: Math.round(clientes * 100) / 100,
    periodo: arredonda(clientes * ticket),
    ano,
    categorias,
    direct: { min: ano * MULTIPLICADOR_DIRECT.min, max: ano * MULTIPLICADOR_DIRECT.max, multMin: MULTIPLICADOR_DIRECT.min, multMax: MULTIPLICADOR_DIRECT.max },
  };
}

export function calcularFunil(dados) {
  const { posts, comentarios: c } = dados;
  const conversa = posts.conversa || 0;
  const validos = c.lidos - c.contagem.outro - (c.contagem.reacao || 0);
  const etapas = [
    {
      chave: 'cta',
      titulo: 'Chamada para ação',
      nota: posts.total ? Math.round(((posts.venda + conversa) / posts.total) * 100) : null,
      leitura: `${posts.venda + conversa} de ${posts.total} publicações pedem uma ação: ${posts.venda} para vender e ${conversa} para conversar`,
    },
    {
      chave: 'maos',
      titulo: 'Mãos levantadas',
      // 1 em cada 4 comentários pedindo preço ou tirando dúvida já é um ótimo sinal: vale nota 100
      nota: validos > 0 ? Math.min(100, Math.round((c.maos / validos) * 400)) : null,
      leitura: validos > 0 ? `${c.maos} de ${validos} comentários analisados perguntam preço, link ou tiram dúvida` : 'Sem comentários para analisar',
    },
    {
      chave: 'resposta',
      titulo: 'Resposta',
      nota: c.maos > 0 && c.respostasConhecidas !== false ? Math.round((c.respondidas / c.maos) * 100) : null,
      leitura: c.respostasConhecidas === false
        ? 'Esta leitura não mostra quem respondeu cada comentário. Confira no Instagram.'
        : c.maos > 0 ? `${c.respondidas} de ${c.maos} mãos levantadas têm resposta visível` : 'Ninguém levantou a mão ainda',
    },
  ];
  const comNota = etapas.filter(e => e.nota !== null);
  const quebra = comNota.length ? comNota.reduce((a, b) => (b.nota < a.nota ? b : a)).chave : 'cta';
  const geral = comNota.length ? Math.round(comNota.reduce((s, e) => s + e.nota, 0) / comNota.length) : null;
  const nivel = geral === null ? null : geral >= 70 ? 'Ouro' : geral >= 40 ? 'Prata' : 'Bronze';
  return { etapas, quebra, geral, nivel };
}

const PLANOS = {
  cta: [
    ['Termine todo post com um pedido único', 'Escolha uma palavra e peça: “comenta QUERO que eu te mando”. Um pedido só por post.'],
    ['Faça uma oferta por mês nos seus posts', 'Sem oferta clara, quem gosta do seu conteúdo não sabe que pode comprar de você.'],
  ],
  maos: [
    ['Fale de problema, não só de novidade', 'Posts sobre a dor do seu cliente geram perguntas. Posts de opinião geram só elogio.'],
    ['Responda elogio com uma pergunta', 'Quem elogia já gosta de você. Uma pergunta simples abre a conversa.'],
  ],
  resposta: [
    ['Responda toda mão levantada em até 1 hora', 'Quem pergunta preço está decidindo agora. Amanhã a pessoa já comprou de outro.'],
    ['Leve a resposta para o direct', 'No comentário você responde. No direct você descobre o que a pessoa precisa e vende.'],
  ],
};

export function montarPlano(dados, funil, respostas = {}) {
  const jaFaz = respostas.jaFaz || [];
  const acoes = [...PLANOS[funil.quebra]];
  if (!jaFaz.includes('automacao')) {
    acoes.push(['Automatize a primeira resposta', 'Uma automação manda o link no direct assim que alguém comenta a palavra-chave, mesmo de madrugada.']);
  } else if (!jaFaz.includes('time')) {
    acoes.push(['Defina quem fecha a venda', 'A automação abre a conversa. Separe um horário fixo por dia para assumir quem respondeu.']);
  } else {
    acoes.push(['Meça vendas por post', 'Marque de qual post veio cada venda e repita o que trouxe dinheiro.']);
  }
  return acoes.map(([titulo, texto]) => ({ titulo, texto }));
}

const VENDE = { proprio: true, afiliado: true };

export function montarCaminho(dados, funil, respostas = {}) {
  const jaFaz = respostas.jaFaz || [];
  const nota = chave => funil.etapas.find(e => e.chave === chave)?.nota ?? 0;
  const itens = [
    { texto: 'Tem produto ou serviço à venda', ok: Boolean(VENDE[respostas.vende]) },
    { texto: 'Pede ação em pelo menos metade dos posts', ok: nota('cta') >= 50 },
    { texto: 'Responde quem levanta a mão', ok: nota('resposta') >= 50 || jaFaz.includes('atende') },
    { texto: 'Usa automação no direct', ok: jaFaz.includes('automacao') },
    { texto: 'Tem processo comercial definido', ok: jaFaz.includes('time') },
  ];
  return { itens, pct: Math.round((itens.filter(i => i.ok).length / itens.length) * 100) };
}

// O que o navegador recebe. O faturamento fica de fora de propósito: o link do relatório pode ser compartilhado.
export function montarRelatorio(dados, respostas = {}, username = '') {
  if (!dados) {
    const vazio = { posts: { total: 0, venda: 0, conversa: 0 }, comentarios: { lidos: 0, maos: 0, respondidas: 0, contagem: { outro: 0 } } };
    const funil = { etapas: [], quebra: 'cta' };
    return {
      username,
      semDados: true,
      plano: montarPlano(vazio, funil, respostas),
      caminho: montarCaminho(vazio, funil, respostas),
    };
  }
  const funil = calcularFunil(dados);
  return {
    username: dados.perfil.username,
    semDados: false,
    perfil: dados.perfil,
    dias: dados.dias,
    posts: dados.posts,
    comentarios: dados.comentarios,
    dinheiro: calcularDinheiro(dados, respostas.ticket),
    taxas: TAXAS,
    funil,
    plano: montarPlano(dados, funil, respostas),
    caminho: montarCaminho(dados, funil, respostas),
  };
}
