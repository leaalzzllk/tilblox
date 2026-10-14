# TikBlox

MVP que conecta comentários de um TikTok Live a NPCs de jogadores Roblox dançando dentro de uma experiência Roblox.

## O que já funciona

- Painel de controle em português para iniciar/parar a conexão e acompanhar os pedidos.
- Comentário com apenas o nome Roblox, `!join NomeRoblox` ou `!roblox NomeRoblox` cria um pedido.
- Consulta de username para `UserId` pela API pública do Roblox.
- Fila temporária, limite de 100 pedidos pendentes e intervalo de 30 segundos por jogador.
- Modo de teste no painel, sem precisar abrir uma live.
- Endpoint autenticado para o servidor Roblox buscar o próximo pedido e confirmar que o processou.
- Script Roblox de servidor que cria um NPC com o avatar solicitado, toca a animação e o remove após 30 segundos.

## Publicar grátis no Render

O arquivo `render.yaml` configura um Web Service gratuito, compila o backend e gera `ROBLOX_BRIDGE_TOKEN` como segredo no Render. O Render fornece uma URL HTTPS fixa `*.onrender.com`, sem precisar manter um túnel Cloudflare.

1. Coloque o projeto em um repositório GitHub e conecte esse repositório à sua conta Render. Não envie `.env` nem outros arquivos com segredos; eles são ignorados pelo `.gitignore`.
2. No Render, escolha **New > Blueprint** e selecione o repositório. Confirme a criação do serviço `tikblox-bridge` usando o plano **Free**.
3. Aguarde o deploy ficar disponível e copie a URL `https://...onrender.com` mostrada na página do serviço.
4. No painel do serviço, abra **Environment** e copie o valor gerado para `ROBLOX_BRIDGE_TOKEN`.
5. Atualize `BRIDGE_URL` em `roblox/TikBlox.server.lua` para `<URL_DO_RENDER>/api/roblox` e `BRIDGE_TOKEN` para o valor secreto do Render. Não compartilhe nem coloque o token em um `LocalScript`.
6. No Roblox Studio, substitua o Script em `ServerScriptService`, habilite **Game Settings > Security > Allow HTTP Requests** e publique a experiência.
7. Abra `https://...onrender.com/api/status` para confirmar que o serviço responde. O campo `bridgeConfigured` deve ser `true`.

O plano gratuito pode suspender o serviço após um período sem tráfego, reiniciá-lo ou impor limites de uso. Quando suspenso, a primeira chamada pode demorar enquanto o serviço inicia. A fila é mantida em memória e pedidos pendentes podem ser perdidos em reinicializações. Quando o servidor Roblox está ativo, ele consulta a fila a cada 3 segundos.

## Requisitos

- Node.js 20 ou superior e npm.
- Uma experiência Roblox publicada/aberta no Roblox Studio.
- Para usar o Roblox, um servidor acessível pela internet com HTTPS. O Roblox não consegue chamar `localhost` no computador do streamer.
- Acesso ao chat da live pelo conector TikTok usado pelo MVP.

## Iniciar o painel e a ponte

1. No terminal, instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e troque `ROBLOX_BRIDGE_TOKEN` por um segredo aleatório longo.
3. Rode `npm run dev` e abra `http://localhost:3000`.
4. Use **Testar pedido** com um username existente para verificar a consulta ao Roblox e a fila.
5. Durante uma live, informe o usuário da conta no TikTok e conecte. A pessoa pode comentar somente seu username Roblox, ou usar `!join NomeRoblox`.

O backend usa a biblioteca comunitária `tiktok-live-connector`, que não é uma integração oficial do TikTok. Ela pode parar de funcionar quando o TikTok mudar o protocolo, pode exigir uma live pública com chat habilitado e não é adequada para credenciais ou operações críticas. O TikBlox não pede senha nem cookie do TikTok. Se você tiver acesso a uma API oficial de LIVE Chat, substitua somente o adaptador em `src/tiktok.ts`.

## Ligar ao Roblox

1. No Roblox Studio, abra **Game Settings > Security** e habilite **Allow HTTP Requests**.
2. Adicione `roblox/TikBlox.server.lua` como um `Script` em `ServerScriptService`. Não use `LocalScript`.
3. Defina `BRIDGE_URL` para a URL HTTPS pública do backend, terminando em `/api/roblox`.
4. Cole no script o mesmo segredo usado em `ROBLOX_BRIDGE_TOKEN`.
5. Ajuste `SPAWN_CFRAME`, `NPC_LIFETIME_SECONDS` e `DANCE_ANIMATION_ID` no script.
6. Publique o jogo e mantenha o backend acessível. O script busca pedidos a cada 3 segundos.

O token fica no código do servidor Roblox e nunca deve ser colocado em um LocalScript ou enviado ao cliente. Para produção, hospede o backend em um serviço com HTTPS e configure limites de acesso e logs. A fila atual fica em memória, então reiniciar o backend apaga os pedidos.

## Verificação

- `npm test` executa os testes de parsing e fila.
- `npm run build` compila o backend para `dist/`.
- `npm start` inicia a versão compilada.

## Escopo do MVP

Cada comentário válido cria um NPC temporário, não teleporta o jogador real para a experiência. O jogo Roblox continua sendo uma experiência separada: o jogador precisa entrar nela pelo Roblox. O conector de TikTok é não oficial e precisa ser validado no ambiente da live antes de uso público.
