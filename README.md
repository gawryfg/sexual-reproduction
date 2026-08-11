# Simulação: reprodução sexuada vs. assexuada

Versão estática em HTML, CSS e JavaScript do aplicativo Shiny. A simulação é executada inteiramente no navegador e não requer R, Shiny, servidor ou etapa de compilação.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie os três arquivos (`index.html`, `styles.css` e `script.js`) para a raiz do repositório.
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Escolha a branch `main`, a pasta `/ (root)` e salve.

O endereço público aparecerá na própria tela de configuração do GitHub Pages.

## Correspondência com o código R

As funções `createHost`, `createParasite`, `mutateGenotype`, `recombine` e `simulateGeneration` são traduções diretas das funções originais. A ordem das etapas, o custo reprodutivo, a seleção truncada, o momento de introdução dos indivíduos sexuais e os campos exportados no CSV foram mantidos.
