# dashboard-fauth

Dashboard de marketing e vendas em **Node.js (Express) + PostgreSQL**, sem framework de front-end nem BI externo. Cruza investimento em mídia (Meta Ads), leads do site e vendas da plataforma de cursos para responder, por período: quanto foi gasto, quantos leads e compras vieram, de onde (campanha, estado, faixa etária/gênero) e qual o custo por lead e por venda.

Os dados chegam ao banco por workflows n8n (importação diária da Marketing API da Meta, webhooks de lead e de compra); o dashboard só lê, com consultas agregadas leves, e atualiza sozinho na tela a cada 5 minutos.

## O que mostra

- **Resumo do período** (7 / 30 / 90 dias ou intervalo livre): gasto, leads de anúncio, leads do site, compras, receita, CPL e CAC.
- **Série diária** de gasto × leads × compras × receita, com filtro por campanha ou UF.
- **Campanhas**: gasto, impressões, cliques, leads e compras por campanha.
- **Demografia**: desempenho por idade e gênero.
- **Região**: gasto e cliques por UF cruzados com vendas por estado (FULL OUTER JOIN entre anúncios e vendas).
- **Origens** dos leads do site.
- Receita usa as vendas confirmadas (`status = 'paid'`) quando existem; até lá, cai para as compras reportadas pelo pixel da Meta.

## Rotas

| Rota | Função |
|---|---|
| `GET /login`, `POST /login`, `GET /sair` | autenticação simples por sessão (usuário e senha em variáveis de ambiente) |
| `GET /api/resumo` | totais do período |
| `GET /api/serie` | série diária |
| `GET /api/campanhas`, `/api/campanhas-lista` | desempenho e lista de campanhas |
| `GET /api/demografia` | por idade e gênero |
| `GET /api/regiao` | por UF |
| `GET /api/origens` | origem dos leads |

Parâmetros comuns: `de`, `ate` (datas), `campanha_id`, `uf`. Front-end estático em `public/`.

## Modelo de dados (tabelas lidas)

`metricas_campanhas`, `metricas_regiao`, `metricas_demografia` (uma linha por dia × dimensão, alimentadas pela Meta API), `leads` (formulários do site) e `compras` (vendas, com `status`, `valor`, `estado`). Datas de leads e compras são convertidas para `America/Sao_Paulo` nas consultas.

## Rodando

```bash
npm install
PGHOST=localhost PGDATABASE=marketing PGUSER=app PGPASSWORD=... \
DASH_USER=admin DASH_PASS=... PORT=3000 node server.js
```

### Docker / Easypanel

App > Dockerfile, porta interna 3000, no mesmo projeto do Postgres para usar o host interno. Variáveis:

| Variável | Uso |
|---|---|
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | conexão ao Postgres (somente leitura) |
| `DASH_USER`, `DASH_PASS` | login do dashboard |
| `PORT` | porta (padrão 3000) |

Domínio próprio ou subdomínio do Easypanel apontando para a porta 3000.

## Stack

Node 20 · Express · node-postgres (`pg`) · HTML/CSS/JS puro no front · PostgreSQL · Docker · n8n como camada de ingestão
