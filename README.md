# Diagnóstico de vendas do Instagram

Página para o link da bio. O seguidor manda o @ e responde até 5 perguntas. O relatório fica no seu painel privado, e você decide quando e como enviar o link para a pessoa.

## Quanto custa

| Item | Serviço | Custo |
|---|---|---|
| Página, API e banco de dados | Cloudflare Pages + D1 | Grátis |
| Leitura do Instagram | Coletor no seu PC, sem login | Grátis |
| Reserva da leitura | Apify, plano grátis com US$ 5 por mês, sem cartão | Até cerca de US$ 0,19 por diagnóstico |
| Classificação dos comentários | Regras no próprio código | Grátis |
| Endereço | `seu-projeto.pages.dev` | Grátis |

O limite de 25 análises por mês vale só para a reserva da Apify e mantém o uso dentro dos US$ 5. Refazer o mesmo @ em até 30 dias não gasta nada.

## Como publicar

Antes de começar, crie uma conta grátis na [Cloudflare](https://dash.cloudflare.com/sign-up) e outra na [Apify](https://console.apify.com/sign-up). Na Apify, copie o token em **Settings → API & Integrations**.

No Windows PowerShell, use `npx.cmd` e `npm.cmd`, como abaixo.

1. Instale as dependências:

   ```bash
   npm.cmd install
   ```

2. Entre na sua conta da Cloudflare:

   ```bash
   npx.cmd wrangler login
   ```

3. Crie o banco de dados e cole o `database_id` que aparecer no arquivo `wrangler.toml`:

   ```bash
   npx.cmd wrangler d1 create diagnostico
   ```

4. Crie as tabelas:

   ```bash
   npx.cmd wrangler d1 execute diagnostico --remote --file schema.sql
   ```

5. Publique pela primeira vez:

   ```bash
   npx.cmd wrangler pages deploy
   ```

6. Salve as três chaves. `SALT` e `PAINEL_SENHA` devem ser textos longos e aleatórios, diferentes entre si. Guarde a `PAINEL_SENHA` no seu gerenciador de senhas:

   ```bash
   npx.cmd wrangler pages secret put APIFY_TOKEN
   ```

   ```bash
   npx.cmd wrangler pages secret put SALT
   ```

   ```bash
   npx.cmd wrangler pages secret put PAINEL_SENHA
   ```

7. Publique de novo para as chaves valerem:

   ```bash
   npx.cmd wrangler pages deploy
   ```

Depois é só colocar o endereço `https://diagnostico-instagram.pages.dev` na bio. Faça um diagnóstico com o seu próprio @ antes de divulgar.

## Coletor no seu PC

A leitura do Instagram é feita de graça por um programa no seu computador, sem login. Os pedidos ficam em uma fila no site.

- **Ligar:** abra `%USERPROFILE%\DiagnosticoColetor\iniciar.cmd` e deixe a janela aberta. Para parar, feche a janela.
- **PC desligado:** os pedidos esperam. Depois de 12 horas, ou de 3 falhas em um mesmo perfil, a Apify entra como reserva, dentro do limite de `MAX_ANALISES_MES`.
- **Instagram limitou:** o coletor faz uma pausa de 30 minutos e continua sozinho.
- **Instalar de novo:** rode `coletor\instalar.cmd`. A chave fica em `%USERPROFILE%\DiagnosticoColetor\.env`.
- **Limite diário:** a fila aceita até `MAX_FILA_DIA` pedidos por dia (padrão: 200) e 5 por conexão.

O coletor usa o projeto [omkarcloud/instagram-scraper](https://github.com/omkarcloud/instagram-scraper) em uma versão fixa, de código aberto e não oficial. A coleta não é autorizada pelo Instagram e pode parar de funcionar.

## Ver e enviar os relatórios

Abra `https://diagnostico-instagram.pages.dev/painel.html` e entre com a `PAINEL_SENHA`. Cada diagnóstico mostra o @, as respostas e os botões para abrir o relatório e copiar o link.

Abra o painel pelo menos uma vez por semana. Se o seguidor fechar a página antes do fim, é o painel que busca o resultado na Apify, que guarda os dados por tempo limitado.

Para o botão final do relatório abrir o seu WhatsApp em vez do direct, preencha o número em `public/config.js`.

## Ajustes comuns

- **Textos da página e perguntas:** `public/app.js`
- **Cores e fontes:** começo de `public/style.css`
- **Taxas do cálculo em reais:** `TAXAS` em `lib/analise.js`
- **Palavras que indicam compra, dúvida ou elogio:** começo de `lib/analise.js`
- **Limites de gasto:** `[vars]` em `wrangler.toml`

## Testar sem gastar

O arquivo `.dev.vars` liga dados inventados. Para testar, rode:

```bash
npm.cmd run banco:local
```

```bash
npm.cmd run dev
```

Os testes automáticos das regras rodam com `npm.cmd test`.

Se `banco:local` der "internal error" no Windows, o caminho da pasta está longo demais. Mova o projeto para uma pasta com caminho mais curto.
