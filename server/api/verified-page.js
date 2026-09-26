module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#071725" />
  <meta name="description" content="View a ParlayPing-verified public X betslip record." />
  <title>Verified X Betslip — ParlayPing</title>
  <link rel="icon" href="/parlayping-approved-hero.webp" type="image/webp" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/app-nav.css?v=20260926a" data-pp-app-nav-css />
  <link rel="stylesheet" href="/verified-page.css?v=20260926a" />
</head>
<body>
  <main class="verified-page" id="verifiedPage"><div class="verified-loading">Loading verified betslip record…</div></main>
  <script src="/app-nav.js?v=20260926a" data-pp-app-nav></script>
  <script src="/verified-page.js?v=20260926a"></script>
</body>
</html>`);
};