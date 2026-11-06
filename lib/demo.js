// Dados inventados para testar sem gastar nada (DEMO=1). Nenhum perfil aqui é real.
const haDias = n => new Date(Date.now() - n * 86400000).toISOString();

const post = (id, dias, comentarios, caption) => ({
  url: `https://www.instagram.com/p/demo${id}/`,
  timestamp: haDias(dias),
  commentsCount: comentarios,
  likesCount: comentarios * 9,
  shortCode: `demo${id}`,
  videoViewCount: id % 2 ? comentarios * 80 : 0,
  type: id % 2 ? 'Video' : 'Sidecar',
  isPinned: id === 1,
  caption,
});

export function demoPerfil(username) {
  if (username === 'naoexiste') return [];
  if (username === 'privado') return [{ username, private: true }];
  return [{
    username,
    fullName: 'Perfil de Demonstração',
    followersCount: 4200,
    followsCount: 310,
    postsCount: 87,
    biography: 'Perfil inventado para testes.\nNão é uma pessoa real.',
    externalUrl: 'https://exemplo.test/',
    isBusinessAccount: true,
    businessCategoryName: 'Consultoria',
    private: false,
    latestPosts: [
      post(1, 3, 14, 'Três erros que travam suas vendas no direct. Comenta QUERO que eu te mando o roteiro.'),
      post(2, 10, 8, 'O que aprendi vendendo pelo Instagram esse ano.'),
      post(3, 18, 5, 'Bastidores da semana. Me conta o que achou.'),
      post(4, 27, 3, 'Foto do evento em São Paulo.'),
      post(5, 41, 2, 'Novidade chegando por aqui.'),
    ],
  }];
}

// Como no plano grátis da Apify: os Reels trazem reproduções, e os comentários não dizem quem respondeu.
export const demoReels = username => demoPerfil(username)[0].latestPosts
  .filter(p => p.type === 'Video')
  .map(p => ({ shortCode: p.shortCode, videoPlayCount: p.videoViewCount * 5 }));

const c = (ownerUsername, text) => ({ ownerUsername, text, repliesCount: null });

export function demoComentarios() {
  return [
    c('cliente.um', 'Quanto custa a mentoria?'),
    c('cliente.dois', 'Quero! Me manda o link'),
    c('cliente.tres', 'Tem vaga ainda?', 1),
    c('cliente.quatro', 'Parcela em quantas vezes?'),
    c('curioso.um', 'Serve pra quem está começando?'),
    c('curioso.dois', 'Funciona pra loja física?'),
    c('fa.um', 'Conteúdo incrível, parabéns! 👏'),
    c('fa.dois', '🔥🔥🔥'),
    c('fa.tres', 'Muito bom demais'),
    c('fa.quatro', '❤️❤️', 1),
    c('fa.cinco', 'Sensacional'),
    c('fa.seis', 'É isso!'),
    c('critico.um', 'Isso é furada'),
    c('spam.um', 'Sigo de volta, parceria?'),
    c('alguem.um', 'Marcando meu amigo aqui'),
  ];
}
