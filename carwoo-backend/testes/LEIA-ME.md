# Testes

## Para que servem

Este projeto tem um defeito que já apareceu sete vezes: a tela pede o dado,
a coluna existe no banco, e a rota do servidor ignora. O dado some sem aviso,
e só se descobre quando um cliente recarrega a página e o campo está vazio.

Estes testes conferem isso sozinhos, em menos de um segundo.

## Como rodar

Dentro da pasta `carwoo-backend`:

```
npm test
```

Deve terminar com `pass 30` e `fail 0`. Se aparecer `fail` com qualquer
número acima de zero, **alguma coisa quebrou — não publique.** A mensagem
diz qual campo sumiu e em qual arquivo.

Não precisa de banco de dados, nem de internet, nem do `.env`. Os testes
usam um banco de mentira (`banco-falso.js`) que guarda o que a rota mandou
gravar e devolve na leitura, igual ao banco de verdade faria.

## O que cada arquivo cobre

| Arquivo | O que garante |
|---|---|
| `datas.test.js` | 02/08/2026 é 2 de agosto e não 8 de fevereiro |
| `permissoes.test.js` | vendedor nunca recebe custo, lucro ou margem |
| `veiculo-tres-lados.test.js` | todo campo que a tela envia volta na resposta |
| `vazamento-custo.test.js` | vendedor que edita um carro não vê o custo do dono |
| `acesso-desativado.test.js` | funcionário desativado é barrado na hora, e troca de perfil vale sem esperar novo login |

## Ao criar uma rota nova

Acrescente um teste que faça o caminho completo: monte o objeto igual a tela
manda, chame a rota, e confira que cada campo voltou. É o que pega o defeito
antes do cliente.
