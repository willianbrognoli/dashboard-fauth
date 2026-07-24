# Dashboard de Oportunidade Fauth: deploy no Easypanel

## 1. Subir o código
- Crie um repositório privado no GitHub (ex.: dashboard-fauth) e envie estes arquivos
  (pode arrastar tudo pelo site do GitHub: Add file > Upload files).

## 2. Criar o serviço no Easypanel
- Projeto (o mesmo do postgres-fauth de preferência) > + Service > App
- Source: GitHub > selecione o repositório > branch main
- Build: Dockerfile (detecta automaticamente)

## 3. Variáveis de ambiente (aba Environment)
- PGHOST = host interno do postgres-fauth (ex.: dados_postgres-fauth)
- PGPORT = 5432
- PGDATABASE = nome do banco
- PGUSER = usuário
- PGPASSWORD = senha
- DASH_USER = usuário de acesso ao dashboard (você inventa)
- DASH_PASS = senha de acesso ao dashboard (você inventa)
- PORT = 3000

## 4. Domínio
- Aba Domains: adicione um subdomínio gratuito do Easypanel, ou
  dashboard.adrianefauth.com.br (CNAME apontando pra VPS), porta 3000.

## 5. Deploy
- Clique em Deploy. Ao abrir o domínio, o navegador pede o usuário e a senha
  definidos em DASH_USER / DASH_PASS.

Observações:
- O app só lê o Postgres (nenhuma escrita), consultas agregadas leves.
- Atualiza sozinho a cada 5 minutos na tela; períodos de 7/30/90 dias no topo.
- A receita usa a Tutory quando houver vendas na tabela compras; até lá, usa o pixel do Meta.
