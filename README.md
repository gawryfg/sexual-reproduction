# Rainha Vermelha — Hamilton et al. (1990)

Simulação estática, sem servidor e sem banco de dados, do modelo descrito em:

Hamilton, W. D.; Axelrod, R.; Tanese, R. (1990). “Sexual reproduction as an adaptation to resist parasites (A Review)”. *Proceedings of the National Academy of Sciences*, 87, 3566–3573.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. Em **Settings → Pages**, escolha **Deploy from a branch**.
4. Selecione a branch `main`, pasta `/ (root)`, e salve.

O site funciona apenas com HTML, CSS e JavaScript. Não requer instalação, compilação ou chaves de API.

## Arquivos

- `index.html`: conteúdo e estrutura da página.
- `styles.css`: identidade visual e responsividade.
- `engine.js`: motor estocástico, separado da interface.
- `ui.js`: controles, gráficos, execução e exportação CSV.
- `og.png`: capa para compartilhamento social.

## Fidelidade e decisões explícitas

O motor usa como padrão populações haploides de 200 hospedeiros e 200 parasitas por espécie, loci binários, infecção anual, escore por correspondência, seleção branda por truncamento, mortalidades de 1/14 e 0,909, reprodução clonal, recombinação entre loci adjacentes, mutação, juvenis até 13 anos, 70 anos de “graça”, introdução do alelo sexual em 50% dos hospedeiros e 400 anos de observação. O painel permite modificar tempo, tamanhos populacionais, número de espécies e loci, mortalidades, mutações, recombinação e ruído ambiental.

Durante todo o período de graça, o gene do modo reprodutivo permanece fixado em 0 e não sofre mutação. No início do ano zero, o gene é zerado em toda a população e alterado para 1 em exatamente metade dos 200 hospedeiros; a partir daí, volta a sofrer mutação junto com os demais loci.

O PDF remete a uma documentação completa do programa original que não está incluída no artigo. Por isso, o site registra as escolhas necessárias para os detalhes não especificados: desempates aleatórios; permutação um-a-um quando H = P e encontros equilibrados quando os tamanhos diferem; retenção de sobreviventes e preenchimento das vagas por descendentes; unidades reprodutivas assexuadas com peso 1 e pares sexuais com peso 1/2 por indivíduo.

Cada clique executa uma única simulação com uma nova realização aleatória.
