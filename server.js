const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool();

// ---------- Login com sessao (cookie assinado) ----------
const crypto = require('crypto');

function usuarios() {
  const mapa = {};
  const lista = process.env.DASH_USERS || '';
  for (const par of lista.split(',')) {
    const i = par.indexOf(':');
    if (i > 0) mapa[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  }
  if (process.env.DASH_USER && process.env.DASH_PASS) mapa[process.env.DASH_USER] = process.env.DASH_PASS;
  return mapa;
}
function segredo() {
  return process.env.SESSION_SECRET || crypto.createHash('sha256').update('afdash|' + (process.env.DASH_PASS || '') + '|' + (process.env.PGPASSWORD || '')).digest('hex');
}
function assina(dado) { return crypto.createHmac('sha256', segredo()).update(dado).digest('hex'); }
function igual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function criaSessao(usuario) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const dado = Buffer.from(usuario).toString('base64url') + '.' + exp;
  return dado + '.' + assina(dado);
}
function leSessao(req) {
  const bruto = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('afdash_sessao='));
  if (!bruto) return null;
  const partes = bruto.slice('afdash_sessao='.length).split('.');
  if (partes.length !== 3) return null;
  const dado = partes[0] + '.' + partes[1];
  if (!igual(partes[2], assina(dado))) return null;
  if (Number(partes[1]) < Date.now()) return null;
  try { return Buffer.from(partes[0], 'base64url').toString(); } catch (e) { return null; }
}

const tentativas = {}; // ip -> {n, ate}
function bloqueado(ip) { const t = tentativas[ip]; return t && t.n >= 5 && Date.now() < t.ate; }
function registraFalha(ip) {
  const t = tentativas[ip] || { n: 0, ate: 0 };
  t.n += 1; t.ate = Date.now() + 30 * 1000;
  tentativas[ip] = t;
}

const PAGINA_LOGIN = (erro) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex, nofollow">
<title>Entrar | Dashboard Fauth</title>
<link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Archivo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0e1116;color:#e9e7df;font-family:'Archivo',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;
background-image:radial-gradient(700px 400px at 20% 10%,rgba(201,163,91,.08),transparent 60%),radial-gradient(600px 350px at 85% 90%,rgba(74,157,248,.05),transparent 60%)}
.caixa{background:#151b23;border:1px solid #242e3a;border-radius:20px;padding:40px 36px;width:100%;max-width:400px;text-align:center;animation:sobe .5s ease both}
@keyframes sobe{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.selo{width:80px;height:80px;border-radius:50%;border:1px solid #c9a35b;display:flex;align-items:center;justify-content:center;font-family:'Marcellus',serif;font-size:30px;color:#e3c98f;margin:0 auto 18px;position:relative}
.selo:after{content:"";position:absolute;inset:5px;border-radius:50%;border:1px dashed rgba(201,163,91,.4)}
h1{font-family:'Marcellus',serif;font-weight:400;font-size:24px;margin-bottom:4px}
.sub{color:#9aa5b1;font-size:13px;margin-bottom:26px}
label{display:block;text-align:left;color:#9aa5b1;font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin:14px 0 6px}
input{width:100%;background:#0e1116;border:1px solid #242e3a;border-radius:10px;color:#e9e7df;padding:12px 14px;font-family:'Archivo';font-size:14px}
input:focus{outline:none;border-color:#c9a35b;box-shadow:0 0 0 3px rgba(201,163,91,.12)}
button{width:100%;margin-top:22px;background:linear-gradient(135deg,#c9a35b,#a9843f);border:none;border-radius:10px;color:#14100a;font-weight:700;font-size:15px;padding:13px;cursor:pointer;font-family:'Archivo';transition:.15s}
button:hover{filter:brightness(1.08);transform:translateY(-1px)}
.erro{background:rgba(255,93,93,.1);border:1px solid #ff5d5d;color:#ff9c9c;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:6px;display:${erro ? 'block' : 'none'}}
.rodape{margin-top:24px;color:#5f6a76;font-size:11.5px}
</style></head><body>
<div class="caixa">
  <div class="selo">AF</div>
  <h1>Dashboard de Oportunidade</h1>
  <div class="sub">Adriane Fauth | Fauth &amp; Freitas · Acesso restrito</div>
  <div class="erro">${erro || ''}</div>
  <form method="POST" action="/login">
    <label for="u">Usuário</label>
    <input id="u" name="usuario" autocomplete="username" required autofocus>
    <label for="p">Senha</label>
    <input id="p" name="senha" type="password" autocomplete="current-password" required>
    <button type="submit">Entrar</button>
  </form>
  <div class="rodape">Acesso concedido pela administração · Proteção LGPD</div>
</div></body></html>`;

app.use(express.urlencoded({ extended: false }));

app.get('/login', (req, res) => {
  if (leSessao(req)) return res.redirect('/');
  res.send(PAGINA_LOGIN(''));
});

app.post('/login', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (bloqueado(ip)) return res.status(429).send(PAGINA_LOGIN('Muitas tentativas. Aguarde 30 segundos.'));
  const lista = usuarios();
  if (!Object.keys(lista).length) return res.status(500).send(PAGINA_LOGIN('Nenhum usuário configurado. Defina DASH_USER/DASH_PASS ou DASH_USERS.'));
  const u = String(req.body.usuario || ''), s = String(req.body.senha || '');
  if (lista[u] !== undefined && igual(lista[u], s)) {
    delete tentativas[ip];
    res.setHeader('Set-Cookie', 'afdash_sessao=' + criaSessao(u) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + 7 * 24 * 3600);
    return res.redirect('/');
  }
  registraFalha(ip);
  return res.status(401).send(PAGINA_LOGIN('Usuário ou senha incorretos.'));
});

app.get('/sair', (req, res) => {
  res.setHeader('Set-Cookie', 'afdash_sessao=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.redirect('/login');
});

app.use((req, res, next) => {
  if (leSessao(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ erro: 'sessao expirada' });
  return res.redirect('/login');
});

app.use(express.static('public'));

// ---------- Helpers ----------
const num = (v) => (v === null || v === undefined ? 0 : Number(v));
async function q(sql, params) { return (await pool.query(sql, params)).rows; }

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const DDD_UF = {'11':'SP','12':'SP','13':'SP','14':'SP','15':'SP','16':'SP','17':'SP','18':'SP','19':'SP','21':'RJ','22':'RJ','24':'RJ','27':'ES','28':'ES','31':'MG','32':'MG','33':'MG','34':'MG','35':'MG','37':'MG','38':'MG','41':'PR','42':'PR','43':'PR','44':'PR','45':'PR','46':'PR','47':'SC','48':'SC','49':'SC','51':'RS','53':'RS','54':'RS','55':'RS','61':'DF','62':'GO','64':'GO','63':'TO','65':'MT','66':'MT','67':'MS','68':'AC','69':'RO','71':'BA','73':'BA','74':'BA','75':'BA','77':'BA','79':'SE','81':'PE','87':'PE','82':'AL','83':'PB','84':'RN','85':'CE','88':'CE','86':'PI','89':'PI','91':'PA','93':'PA','94':'PA','92':'AM','97':'AM','95':'RR','96':'AP','98':'MA','99':'MA'};
const DDD_CASE = 'CASE substring(telefone from 3 for 2) ' +
  Object.entries(DDD_UF).map(([d, u]) => `WHEN '${d}' THEN '${u}'`).join(' ') + " ELSE '' END";
const UF_LEAD = `CASE WHEN upper(coalesce(nullif(trim(estado),''),'')) IN (${UFS.map(u => `'${u}'`).join(',')}) THEN upper(trim(estado)) WHEN telefone LIKE '55%' THEN ${DDD_CASE} ELSE '' END`;

function ehData(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function periodo(req) {
  const hoje = new Date();
  const fmt = (dt) => dt.toISOString().slice(0, 10);
  let ate = ehData(req.query.ate) ? req.query.ate : fmt(hoje);
  let de;
  if (ehData(req.query.de)) de = req.query.de;
  else {
    const d = Math.min(365, Math.max(1, parseInt(req.query.dias || '30', 10) || 30));
    const ini = new Date(hoje); ini.setDate(ini.getDate() - d + 1);
    de = fmt(ini);
  }
  if (de > ate) [de, ate] = [ate, de];
  const span = Math.max(1, Math.round((new Date(ate) - new Date(de)) / 86400000) + 1);
  const antAteD = new Date(de); antAteD.setDate(antAteD.getDate() - 1);
  const antDeD = new Date(antAteD); antDeD.setDate(antDeD.getDate() - span + 1);
  return { de, ate, antDe: fmt(antDeD), antAte: fmt(antAteD), span };
}
function filtros(req) {
  const campanha = String(req.query.campanha || '').trim();
  const ufQ = String(req.query.uf || '').trim().toUpperCase();
  return { campanha, uf: UFS.includes(ufQ) ? ufQ : '' };
}

// ---------- APIs ----------
app.get('/api/campanhas-lista', async (req, res) => {
  try {
    const p = periodo(req);
    const rows = await q(
      `SELECT campanha_id, max(campanha) campanha, sum(gasto) gasto FROM metricas_campanhas
       WHERE data BETWEEN $1::date AND $2::date GROUP BY campanha_id HAVING sum(gasto) > 0
       ORDER BY sum(gasto) DESC LIMIT 100`, [p.de, p.ate]);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

async function agregadoAds(de, ate, f) {
  if (f.uf) {
    const r = (await q(
      `SELECT coalesce(sum(gasto),0) gasto, coalesce(sum(leads),0) leads_ads, coalesce(sum(compras),0) compras_ads,
              coalesce(sum(valor_compras),0) valor_ads, coalesce(sum(cliques),0) cliques, 0 impressoes
       FROM metricas_regiao WHERE data BETWEEN $1::date AND $2::date AND uf = $3`, [de, ate, f.uf]))[0];
    return r;
  }
  const params = [de, ate];
  let extra = '';
  if (f.campanha) { params.push(f.campanha); extra = ' AND campanha_id = $3'; }
  return (await q(
    `SELECT coalesce(sum(gasto),0) gasto, coalesce(sum(leads),0) leads_ads, coalesce(sum(compras),0) compras_ads,
            coalesce(sum(valor_compras),0) valor_ads, coalesce(sum(impressoes),0) impressoes, coalesce(sum(cliques),0) cliques
     FROM metricas_campanhas WHERE data BETWEEN $1::date AND $2::date${extra}`, params))[0];
}

async function leadsSite(de, ate, f) {
  const params = [de, ate];
  let extra = '';
  if (f.uf) { params.push(f.uf); extra = ` AND ${UF_LEAD} = $3`; }
  return num((await q(
    `SELECT count(*)::int n FROM leads
     WHERE (data_hora AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date${extra}`, params))[0].n);
}

app.get('/api/resumo', async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const atual = await agregadoAds(p.de, p.ate, f);
    const ant = await agregadoAds(p.antDe, p.antAte, f);
    const site = await leadsSite(p.de, p.ate, f);
    const siteAnt = await leadsSite(p.antDe, p.antAte, f);
    const vendasParams = [p.de, p.ate];
    const vendas = (await q(
      `SELECT count(*)::int compras, coalesce(sum(valor),0) valor FROM compras
       WHERE (data_hora AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date`, vendasParams))[0];
    const gasto = num(atual.gasto), leadsAds = num(atual.leads_ads);
    const usaTutory = !f.uf && !f.campanha && num(vendas.compras) > 0;
    const comprasTot = usaTutory ? num(vendas.compras) : num(atual.compras_ads);
    const valorTot = usaTutory ? num(vendas.valor) : num(atual.valor_ads);
    res.json({
      de: p.de, ate: p.ate, filtro: f,
      gasto, leads_ads: leadsAds, leads_site: site,
      compras: comprasTot, valor_compras: valorTot,
      impressoes: num(atual.impressoes), cliques: num(atual.cliques),
      cpl: leadsAds > 0 ? gasto / leadsAds : null,
      cpa: comprasTot > 0 ? gasto / comprasTot : null,
      roas: gasto > 0 ? valorTot / gasto : null,
      anterior: { gasto: num(ant.gasto), leads_ads: num(ant.leads_ads), compras: num(ant.compras_ads), valor_compras: num(ant.valor_ads), leads_site: siteAnt },
      fonte_vendas: usaTutory ? 'tutory' : 'meta_pixel'
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/serie', async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    let ads;
    if (f.uf) {
      ads = await q(
        `SELECT data::text dia, sum(gasto) gasto, sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
         FROM metricas_regiao WHERE data BETWEEN $1::date AND $2::date AND uf = $3 GROUP BY data ORDER BY data`, [p.de, p.ate, f.uf]);
    } else {
      const params = [p.de, p.ate]; let extra = '';
      if (f.campanha) { params.push(f.campanha); extra = ' AND campanha_id = $3'; }
      ads = await q(
        `SELECT data::text dia, sum(gasto) gasto, sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
         FROM metricas_campanhas WHERE data BETWEEN $1::date AND $2::date${extra} GROUP BY data ORDER BY data`, params);
    }
    const sp = [p.de, p.ate]; let se = '';
    if (f.uf) { sp.push(f.uf); se = ` AND ${UF_LEAD} = $3`; }
    const site = await q(
      `SELECT (data_hora AT TIME ZONE 'America/Sao_Paulo')::date::text dia, count(*)::int leads_site
       FROM leads WHERE (data_hora AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date${se}
       GROUP BY 1 ORDER BY 1`, sp);
    res.json({ ads, site });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/campanhas', async (req, res) => {
  try {
    const p = periodo(req);
    const rows = await q(
      `SELECT campanha, campanha_id, sum(gasto) gasto, sum(impressoes) impressoes, sum(cliques) cliques,
              sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
       FROM metricas_campanhas WHERE data BETWEEN $1::date AND $2::date
       GROUP BY campanha, campanha_id HAVING sum(gasto) > 0 ORDER BY sum(gasto) DESC LIMIT 30`, [p.de, p.ate]);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/demografia', async (req, res) => {
  try {
    const p = periodo(req);
    const rows = await q(
      `SELECT idade, genero, sum(gasto) gasto, sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
       FROM metricas_demografia WHERE data BETWEEN $1::date AND $2::date GROUP BY idade, genero ORDER BY idade, genero`, [p.de, p.ate]);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/regiao', async (req, res) => {
  try {
    const p = periodo(req);
    const rows = await q(
      `SELECT uf, max(regiao) regiao, sum(gasto) gasto, sum(cliques) cliques,
              sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
       FROM metricas_regiao WHERE data BETWEEN $1::date AND $2::date AND uf <> ''
       GROUP BY uf ORDER BY sum(compras) DESC, sum(gasto) DESC`, [p.de, p.ate]);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/origens', async (req, res) => {
  try {
    const p = periodo(req), f = filtros(req);
    const params = [p.de, p.ate]; let extra = '';
    if (f.uf) { params.push(f.uf); extra = ` AND ${UF_LEAD} = $3`; }
    const rows = await q(
      `SELECT coalesce(nullif(origem,''),'desconhecida') origem, count(*)::int leads
       FROM leads WHERE (data_hora AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date${extra}
       GROUP BY 1 ORDER BY 2 DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/oportunidades', async (req, res) => {
  try {
    const p = periodo(req);
    const cards = [];
    const camp = await q(
      `SELECT campanha, sum(gasto) gasto, sum(compras) compras, sum(valor_compras) valor
       FROM metricas_campanhas WHERE data BETWEEN $1::date AND $2::date GROUP BY campanha HAVING sum(gasto) > 50`, [p.de, p.ate]);
    const totGasto = camp.reduce((s, c) => s + num(c.gasto), 0);
    const totValor = camp.reduce((s, c) => s + num(c.valor), 0);
    const roasMedio = totGasto > 0 ? totValor / totGasto : 0;
    for (const c of camp) {
      const roas = num(c.gasto) > 0 ? num(c.valor) / num(c.gasto) : 0;
      if (roasMedio > 0 && roas >= roasMedio * 1.4 && num(c.compras) >= 2)
        cards.push({ tipo: 'escalar', titulo: 'Campanha acima da media', detalhe: `"${c.campanha}" com ROAS ${roas.toFixed(2)} (media ${roasMedio.toFixed(2)}). Candidata a mais verba.` });
      if (num(c.gasto) >= totGasto * 0.1 && roas > 0 && roas <= roasMedio * 0.5)
        cards.push({ tipo: 'revisar', titulo: 'Verba com baixo retorno', detalhe: `"${c.campanha}" consome ${(num(c.gasto) / totGasto * 100).toFixed(0)}% do gasto com ROAS ${roas.toFixed(2)}. Revisar criativo/publico.` });
    }
    const ufs = await q(
      `SELECT uf, sum(gasto) gasto, sum(compras) compras FROM metricas_regiao
       WHERE data BETWEEN $1::date AND $2::date AND uf <> '' GROUP BY uf`, [p.de, p.ate]);
    const gUf = ufs.reduce((s, u) => s + num(u.gasto), 0);
    const cUf = ufs.reduce((s, u) => s + num(u.compras), 0);
    for (const u of ufs) {
      const sc = cUf > 0 ? num(u.compras) / cUf : 0;
      const sg = gUf > 0 ? num(u.gasto) / gUf : 0;
      if (num(u.compras) >= 3 && sc >= sg * 1.8)
        cards.push({ tipo: 'regiao', titulo: `Oportunidade regional: ${u.uf}`, detalhe: `${u.uf} responde por ${(sc * 100).toFixed(0)}% das compras recebendo ${(sg * 100).toFixed(0)}% da verba. Vale segmentacao dedicada.` });
    }
    const pix = await q(
      `SELECT count(*)::int n FROM leads WHERE (data_hora AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $1::date AND $2::date AND lower(status) LIKE '%pix%'`, [p.de, p.ate]);
    if (num(pix[0].n) > 0)
      cards.push({ tipo: 'recuperar', titulo: 'Recuperacao de Pix', detalhe: `${pix[0].n} lead(s) com Pix gerado no periodo. Lista pronta para follow-up.` });
    res.json(cards.slice(0, 8));
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log('Dashboard Fauth rodando na porta ' + porta));
