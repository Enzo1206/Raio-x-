import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcularDinheiro, calcularFunil, classificar, detectarCta, escolherPosts, montarRelatorio, resumir } from '../lib/analise.js';
import { demoComentarios, demoPerfil } from '../lib/demo.js';

test('classifica comentários reais de Instagram', () => {
  const casos = {
    'Quanto custa?': 'compra',
    'qual o valor': 'compra',
    'Me manda o link': 'compra',
    'QUERO': 'compra',
    'Parcela em quantas vezes?': 'compra',
    'ainda tem vaga?': 'compra',
    'Serve pra quem está começando?': 'duvida',
    'como funciona?': 'duvida',
    'Absurdoooo🔥🔥': 'elogio',
    '👏👏👏': 'reacao',
    '😍❤️': 'reacao',
    'Te amo demais ❤️': 'elogio',
    'Lindao 👏👏👏👏': 'elogio',
    'gatinhooo': 'elogio',
    '🔥wow diferenciado': 'elogio',
    'A melhor escolha, definitivamente!!': 'elogio',
    'Conteúdo de muito valor': 'outro',
    '❤️a@solução pra sua Clinica': 'compra',
    'Serve pra minha empresa': 'compra',
    'Vou usar para o meu negócio': 'compra',
    'Parabéns pela sua empresa': 'elogio',
    'Sigo de volta': 'outro',
    'isso é golpe': 'critica',
    '': 'outro',
  };
  for (const [texto, esperado] of Object.entries(casos)) assert.equal(classificar(texto), esperado, texto);
});

test('detecta chamada para ação na legenda', () => {
  assert.equal(detectarCta('Comenta QUERO que eu te mando'), 'venda');
  assert.equal(detectarCta('Me conta o que achou'), 'conversa');
  assert.equal(detectarCta('Foto do evento'), null);
  assert.equal(detectarCta(undefined), null);
});

test('escolhe só posts da janela, os mais comentados e sem comentários desligados', () => {
  const agora = Date.parse('2026-11-02');
  const p = (dias, commentsCount, extra = {}) => ({ timestamp: new Date(agora - dias * 86400000).toISOString(), commentsCount, ...extra });
  const { comComentarios } = escolherPosts([p(5, 2), p(10, 9), p(200, 99), p(20, 0), p(30, 50, { isCommentsDisabled: true })], agora);
  assert.deepEqual(comComentarios.map(x => x.commentsCount), [9, 2]);
});

test('não conta comentário do próprio dono', () => {
  const d = resumir({ perfil: { username: 'Dono' }, posts: [], comentarios: [{ ownerUsername: 'dono', text: 'Quanto custa?' }] });
  assert.equal(d.comentarios.lidos, 0);
  assert.equal(d.comentarios.doDono, 1);
});

test('sem dado de resposta, não afirma que ninguém respondeu', () => {
  const comentarios = [{ ownerUsername: 'a', text: 'Quanto custa?', repliesCount: null }];
  const d = resumir({ perfil: { username: 'dono' }, posts: [], comentarios });
  assert.equal(d.comentarios.respostasConhecidas, false);
  const resposta = calcularFunil(d).etapas.find(e => e.chave === 'resposta');
  assert.equal(resposta.nota, null);
  assert.match(resposta.leitura, /não mostra quem respondeu/);

  const conhecido = resumir({ perfil: { username: 'dono' }, posts: [], comentarios: [{ ownerUsername: 'a', text: 'Quanto custa?', repliesCount: 2 }] });
  assert.equal(conhecido.comentarios.respostasConhecidas, true);
  assert.equal(calcularFunil(conhecido).etapas.find(e => e.chave === 'resposta').nota, 100);
});

test('resposta do dono não infla a estimativa', () => {
  const dados = { dias: 73, comentarios: { lidos: 9, doDono: 1, totalIG: 10, contagem: { compra: 1, duvida: 0, elogio: 0 } } };
  const d = calcularDinheiro(dados, 1000);
  assert.equal(d.escala, 1);
  assert.equal(d.ano, 500);
  assert.equal(d.categorias.find(c => c.classe === 'compra').valorAno, 500);
  assert.deepEqual([d.direct.min, d.direct.max], [2500, 3000]);
});

test('reproduz as contagens reais de um perfil', () => {
  const textos = ['❤️a@solução pra sua Clinica', '👏👏👏👏👏🙌🙌', 'A melhor escolha, definitivamente!! 👏🏻👏🏻👏🏻', '👏👏👏👏🙌🙌❤️', 'Absurdoooooo🔥🔥🔥🔥', '👏👏🔥🔥🔥', '👏👏👏👏', 'É bem isso!! 👏👏👏', 'Adorei 👏', '👏👏👏👏👏👏👏', '👏', '👏👏👏👏👏👏👏', 'Belo 👏🏼👍🏼', '😍', 'Te amo demais ❤️', 'Lindao 👏👏👏👏', 'Linduuuuuus👏👏👏', '😍😍', '😍❤️', 'Show de bol@ 👏🔥😍', '🔥wow diferenciado', 'Preto chique 👏', 'gatinhooo', '😍'];
  const d = resumir({ perfil: { username: 'dono' }, posts: [], comentarios: textos.map(text => ({ ownerUsername: 'alguem', text })) });
  const { contagem, subtipos, analisados, descartados } = d.comentarios;
  assert.deepEqual({ compra: contagem.compra, elogio: contagem.elogio, reacao: contagem.reacao, outro: contagem.outro }, { compra: 1, elogio: 12, reacao: 11, outro: 0 });
  assert.deepEqual([analisados, descartados], [13, 11]);
  assert.deepEqual(subtipos, { elogio: 7, apoio_pessoal: 5 });
});

test('resume publicações, cadência e chamadas para ação', () => {
  const agora = Date.parse('2026-11-02');
  const p = (dias, extra) => ({ timestamp: new Date(agora - dias * 86400000).toISOString(), commentsCount: 0, likesCount: 0, ...extra });
  const posts = [
    p(1, { type: 'Video', videoPlayCount: 1000, videoViewCount: 400, likesCount: 10, commentsCount: 6, caption: 'Dica de hoje. Comenta QUERO que eu te mando.' }),
    p(13, { type: 'Sidecar', likesCount: -1, commentsCount: 2, caption: 'Me conta o que achou?' }),
    p(27, { type: 'Image', likesCount: 5, caption: 'Foto do evento' }),
    p(28, { type: 'Image', likesCount: 5, caption: '' }),
  ];
  const r = resumir({ perfil: { username: 'dono', followersCount: 50, followsCount: 20, postsCount: 9 }, posts, comentarios: [] }, agora).posts;
  assert.deepEqual([r.total, r.venda, r.conversa, r.semCta], [4, 1, 1, 2]);
  assert.deepEqual([r.views, r.videos, r.likes, r.likesIndisponiveis], [1000, 1, 20, 1]);
  assert.equal(r.lista.find(x => x.comentarios === 2).likes, null);
  assert.equal(r.porSemana, 1);
  assert.deepEqual(r.mediaComentarios, { comCta: 4, semCta: 0 });
  assert.deepEqual(r.palavrasChave, ['QUERO']);
  assert.equal(r.melhorCta.tipo, 'Reel');
  assert.equal(r.melhorCta.trecho, 'Comenta QUERO que eu te mando.');
  assert.equal(r.lista[0].comentarios, 6);
});

test('calcula o dinheiro com a janela real e a amostra', () => {
  const dados = { dias: 73, comentarios: { lidos: 10, totalIG: 20, contagem: { compra: 1, duvida: 0, elogio: 0 } } };
  // 1 compra × 10% × escala 2 × R$ 1.000 × (365 / 73 = 5) = R$ 1.000
  assert.equal(calcularDinheiro(dados, 1000).ano, 1000);
  assert.equal(calcularDinheiro(dados, null), null);
  assert.equal(calcularDinheiro({ ...dados, comentarios: { ...dados.comentarios, lidos: 0 } }, 1000), null);
});

test('funil não dá nota a etapa sem dados e aponta a mais fraca', () => {
  const base = { posts: { total: 4, venda: 1 }, comentarios: { lidos: 0, maos: 0, respondidas: 0, contagem: { outro: 0 } } };
  const f = calcularFunil(base);
  assert.equal(f.etapas[0].nota, 25);
  assert.equal(f.etapas[1].nota, null);
  assert.equal(f.etapas[2].nota, null);
  assert.equal(f.quebra, 'cta');
});

test('relatório nunca expõe faturamento, contato ou respostas cruas', () => {
  const [perfil] = demoPerfil('teste');
  const dados = resumir({ perfil, posts: perfil.latestPosts, comentarios: demoComentarios() });
  const r = montarRelatorio(dados, { ticket: 1000, faturamento: 'ate5', socialPct: 10, vende: 'proprio', jaFaz: [] });
  const texto = JSON.stringify(r);
  assert.ok(!texto.includes('ate5'));
  assert.ok(!('respostas' in r));
  assert.equal(r.plano.length, 3);
  assert.ok(r.dinheiro.ano > 0);
});

test('relatório sem dados ainda entrega plano e caminho', () => {
  const r = montarRelatorio(null, { vende: 'proprio', jaFaz: ['automacao'] }, 'alguem');
  assert.equal(r.semDados, true);
  assert.equal(r.plano.length, 3);
  assert.ok(r.caminho.pct > 0);
});
