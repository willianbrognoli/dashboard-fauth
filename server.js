const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool(); // usa PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD do ambiente

// ---------- Autenticacao basica ----------
app.use((req, res, next) => {
  const usuario = process.env.DASH_USER;
  const senha = process.env.DASH_PASS;
  if (!usuario || !senha) {
    return res.status(500).send('Configure as variaveis DASH_USER e DASH_PASS no Easypanel.');
  }
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo === 'Basic' && token) {
    const [u, p] = Buffer.from(token, 'base64').toString().split(':');
    if (u === usuario && p === senha) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Dashboard Fauth"');
  return res.status(401).send('Autenticacao necessaria.');
});

app.use(express.static('public'));

function dias(req) {
  const d = parseInt(req.query.dias || '30', 10);
  return Math.min(365, Math.max(1, isNaN(d) ? 30 : d));
}
const num = (v) => (v === null || v === undefined ? 0 : Number(v));

async function q(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

// ---------- APIs ----------
app.get('/api/resumo', async (req, res) => {
  try {
    const d = dias(req);
    const atual = (await q(
      `SELECT coalesce(sum(gasto),0) gasto, coalesce(sum(leads),0) leads_ads,
              coalesce(sum(compras),0) compras_ads, coalesce(sum(valor_compras),0) valor_ads,
              coalesce(sum(impressoes),0) impressoes, coalesce(sum(cliques),0) cliques
       FROM metricas_campanhas WHERE data >= current_date - $1::int`, [d]))[0];
    const anterior = (await q(
      `SELECT coalesce(sum(gasto),0) gasto, coalesce(sum(leads),0) leads_ads,
              coalesce(sum(compras),0) compras_ads, coalesce(sum(valor_compras),0) valor_ads
       FROM metricas_campanhas WHERE data >= current_date - ($1::int * 2) AND data < current_date - $1::int`, [d]))[0];
    const site = (await q(
      `SELECT count(*)::int leads_site FROM leads WHERE data_hora >= now() - ($1::int || ' days')::interval`, [d]))[0];
    const siteAnt = (await q(
      `SELECT count(*)::int leads_site FROM leads WHERE data_hora >= now() - (($1::int * 2) || ' days')::interval AND data_hora < now() - ($1::int || ' days')::interval`, [d]))[0];
    const vendas = (await q(
      `SELECT count(*)::int compras, coalesce(sum(valor),0) valor FROM compras WHERE data_hora >= now() - ($1::int || ' days')::interval`, [d]))[0];

    const gasto = num(atual.gasto), leadsAds = num(atual.leads_ads);
    const comprasTot = num(vendas.compras) > 0 ? num(vendas.compras) : num(atual.compras_ads);
    const valorTot = num(vendas.valor) > 0 ? num(vendas.valor) : num(atual.valor_ads);
    res.json({
      periodo_dias: d,
      gasto, leads_ads: leadsAds, leads_site: num(site.leads_site),
      compras: comprasTot, valor_compras: valorTot,
      impressoes: num(atual.impressoes), cliques: num(atual.cliques),
      cpl: leadsAds > 0 ? gasto / leadsAds : null,
      cpa: comprasTot > 0 ? gasto / comprasTot : null,
      roas: gasto > 0 ? valorTot / gasto : null,
      anterior: {
        gasto: num(anterior.gasto), leads_ads: num(anterior.leads_ads),
        compras: num(anterior.compras_ads), valor_compras: num(anterior.valor_ads),
        leads_site: num(siteAnt.leads_site)
      },
      fonte_vendas: num(vendas.compras) > 0 ? 'tutory' : 'meta_pixel'
    });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/serie', async (req, res) => {
  try {
    const d = dias(req);
    const ads = await q(
      `SELECT data::text dia, sum(gasto) gasto, sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
       FROM metricas_campanhas WHERE data >= current_date - $1::int GROUP BY data ORDER BY data`, [d]);
    const site = await q(
      `SELECT (data_hora AT TIME ZONE 'America/Sao_Paulo')::date::text dia, count(*)::int leads_site
       FROM leads WHERE data_hora >= now() - ($1::int || ' days')::interval GROUP BY 1 ORDER BY 1`, [d]);
    res.json({ ads, site });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/campanhas', async (req, res) => {
  try {
    const d = dias(req);
    const rows = await q(
      `SELECT campanha, campanha_id, sum(gasto) gasto, sum(impressoes) impressoes, sum(cliques) cliques,
              sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
       FROM metricas_campanhas WHERE data >= current_date - $1::int
       GROUP BY campanha, campanha_id HAVING sum(gasto) > 0 ORDER BY sum(gasto) DESC LIMIT 30`, [d]);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/demografia', async (req, res) => {
  try {
    const d = dias(req);
    const rows = await q(
      `SELECT idade, genero, sum(gasto) gasto, sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
       FROM metricas_demografia WHERE data >= current_date - $1::int
       GROUP BY idade, genero ORDER BY idade, genero`, [d]);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/regiao', async (req, res) => {
  try {
    const d = dias(req);
    const rows = await q(
      `SELECT uf, max(regiao) regiao, sum(gasto) gasto, sum(cliques) cliques,
              sum(leads) leads, sum(compras) compras, sum(valor_compras) valor
       FROM metricas_regiao WHERE data >= current_date - $1::int AND uf <> ''
       GROUP BY uf ORDER BY sum(compras) DESC, sum(gasto) DESC`, [d]);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/origens', async (req, res) => {
  try {
    const d = dias(req);
    const rows = await q(
      `SELECT coalesce(nullif(origem,''),'desconhecida') origem, count(*)::int leads
       FROM leads WHERE data_hora >= now() - ($1::int || ' days')::interval
       GROUP BY 1 ORDER BY 2 DESC`, [d]);
    res.json(rows);
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

app.get('/api/oportunidades', async (req, res) => {
  try {
    const d = dias(req);
    const cards = [];
    const camp = await q(
      `SELECT campanha, sum(gasto) gasto, sum(compras) compras, sum(valor_compras) valor, sum(leads) leads
       FROM metricas_campanhas WHERE data >= current_date - $1::int
       GROUP BY campanha HAVING sum(gasto) > 50`, [d]);
    const totGasto = camp.reduce((s, c) => s + num(c.gasto), 0);
    const totValor = camp.reduce((s, c) => s + num(c.valor), 0);
    const roasMedio = totGasto > 0 ? totValor / totGasto : 0;
    for (const c of camp) {
      const roas = num(c.gasto) > 0 ? num(c.valor) / num(c.gasto) : 0;
      if (roasMedio > 0 && roas >= roasMedio * 1.4 && num(c.compras) >= 2) {
        cards.push({ tipo: 'escalar', titulo: 'Campanha acima da media', detalhe: `"${c.campanha}" com ROAS ${roas.toFixed(2)} (media ${roasMedio.toFixed(2)}). Candidata a mais verba.` });
      }
      if (num(c.gasto) >= totGasto * 0.1 && roas > 0 && roas <= roasMedio * 0.5) {
        cards.push({ tipo: 'revisar', titulo: 'Verba com baixo retorno', detalhe: `"${c.campanha}" consome ${(num(c.gasto) / totGasto * 100).toFixed(0)}% do gasto com ROAS ${roas.toFixed(2)}. Revisar criativo/publico.` });
      }
    }
    const ufs = await q(
      `SELECT uf, sum(gasto) gasto, sum(compras) compras FROM metricas_regiao
       WHERE data >= current_date - $1::int AND uf <> '' GROUP BY uf`, [d]);
    const gUf = ufs.reduce((s, u) => s + num(u.gasto), 0);
    const cUf = ufs.reduce((s, u) => s + num(u.compras), 0);
    for (const u of ufs) {
      const shareCompras = cUf > 0 ? num(u.compras) / cUf : 0;
      const shareGasto = gUf > 0 ? num(u.gasto) / gUf : 0;
      if (num(u.compras) >= 3 && shareCompras >= shareGasto * 1.8) {
        cards.push({ tipo: 'regiao', titulo: `Oportunidade regional: ${u.uf}`, detalhe: `${u.uf} responde por ${(shareCompras * 100).toFixed(0)}% das compras recebendo ${(shareGasto * 100).toFixed(0)}% da verba. Vale segmentacao dedicada.` });
      }
    }
    const pixPendente = await q(
      `SELECT count(*)::int n FROM leads WHERE data_hora >= now() - ($1::int || ' days')::interval AND lower(status) LIKE '%pix%'`, [d]);
    if (num(pixPendente[0].n) > 0) {
      cards.push({ tipo: 'recuperar', titulo: 'Recuperacao de Pix', detalhe: `${pixPendente[0].n} lead(s) com Pix gerado no periodo. Lista pronta para follow-up de recuperacao.` });
    }
    res.json(cards.slice(0, 8));
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log('Dashboard Fauth rodando na porta ' + porta));
