# Arquivos da marca carwoo

Os quatro arquivos vetoriais originais. Guardados aqui para poder gerar os
ícones de novo se algum dia a marca mudar de tamanho, cor ou formato.

| Arquivo | O que é | Quando usar |
|---|---|---|
| `carwoo-wordmark-fundo-preto.svg` | "carwoo" na horizontal, letras claras | sobre fundo escuro |
| `carwoo-wordmark-fundo-branco.svg` | "carwoo" na horizontal, letras escuras | sobre fundo claro |
| `carwoo-icone-fundo-preto.svg` | "car" sobre "woo", quadrado escuro | ícone pequeno |
| `carwoo-icone-fundo-branco.svg` | "car" sobre "woo", quadrado claro | ícone sobre fundo claro |

## Cores da marca

- Preto do fundo: `#141414`
- Branco do "car": `#FFFFFF`
- Laranja do "woo": `#F5813C`

> **Atenção:** o laranja da interface do sistema é `#FF6A00`, diferente do
> laranja da marca (`#F5813C`). São dois tons próximos mas não iguais. Se
> quiser unificar, é uma decisão de identidade visual — hoje convivem.

## Como os ícones do aplicativo foram feitos

Os arquivos em `../icons/` foram montados a partir destes:

- **192px, 512px e apple-touch:** o wordmark "carwoo" com "GESTÃO" embaixo,
  sobre o quadrado preto. É o que aparece na tela inicial do celular.
- **favicon de 32px:** a versão empilhada ("car" sobre "woo"). O wordmark é
  largo demais e, nesse tamanho, vira uma mancha ilegível.

As versões `maskable` têm o conteúdo um pouco menor porque o Android recorta
as bordas do ícone em círculo, e o que fica perto da margem some.
