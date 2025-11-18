# phrase-net
Visualização interativa da rede de frases usando D3.js
Uma visualização interativa baseada no conceito de **Phrase Nets**, utilizando **D3.js** para explorar relações entre palavras em textos.  
Este projeto permite analisar padrões linguísticos por meio de grafos dirigidos, exibindo a direção real entre palavras conforme sua ordem no texto.

A implementação contém:
- Extração de relações por janela (*window-based*) ou por frase
- Geração de grafos dirigidos reais (com setas)
- Ajuste de parâmetros: janela, stopwords, top N, peso mínimo de arestas
- Zoom, pan e drag interativo
- Destaque de nós e painel lateral com palavras mais frequentes
- Exportação em JSON e SVG
- Layout *force-directed* com colisão, labels e escalas proporcionais

---
![Screenshot](screenshot.png)
![Screenshot](screenshot3.png)
![Screenshot](screenshot2.png)

👉 Acesse ao vivo: https://sesasifi.github.io/phrase-net/
