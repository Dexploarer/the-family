import { brandCssVars, brandHead } from "./brand.js";
import type { BrandingSnapshot } from "../services/brandingService.js";

// Public landing page at "/". Art-deco luxury: molten gold on near-black, a live
// gold-dust canvas, Lenis buttery smooth-scroll, staggered reveals. Telegram-aware
// (expands + themes if opened inside Telegram); otherwise drives to the bot.
export function renderLandingPage(
  botUsername = "bnancy_bsc_bot",
  options?: { showAdminLink?: boolean; branding?: BrandingSnapshot }
): string {
  const branding = options?.branding;
  const productName = branding?.productName ?? "BNancy";
  const tagline = branding?.tagline ?? "the Golden Girl of Binance";
  const footerNote = branding?.footerNote ?? "BNancy is infrastructure only — no profit, token, or execution guarantees.";
  const telegramUrl = `https://t.me/${botUsername}`;
  const adminLink =
    options?.showAdminLink === true
      ? ' · <a href="/admin">Operator</a>'
      : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${brandHead(branding)}
  <title>${productName} — ${tagline}</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Manrope:wght@400;500;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: dark;
      --ink: #08080a;
      --ink-2: #0e0e12;
      --panel: rgba(255,255,255,0.025);
      --line: rgba(214,178,94,0.22);
      --text: #f4efe2;
      --muted: #9c968a;
      --g1: #f8e7ac; --g2: #e9c46a; --g3: #c79a3c; --g4: #8a6a26;
      --serif: "Cormorant Garamond", Georgia, serif;
      --sans: "Manrope", ui-sans-serif, system-ui, sans-serif;
      --gold-grad: linear-gradient(135deg, var(--g1) 0%, var(--g2) 38%, var(--g3) 70%, var(--g1) 100%);
    }
    * { box-sizing: border-box; margin: 0; }
    /* Lenis: never let native smooth-scroll fight the JS scroll (that's the jank). */
    html.lenis, html.lenis body { height: auto; }
    .lenis.lenis-smooth { scroll-behavior: auto !important; }
    .lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
    .lenis.lenis-stopped { overflow: hidden; }
    body {
      background: var(--ink);
      color: var(--text);
      font-family: var(--sans);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    /* canvas sits behind everything */
    #dust { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
    .vignette { position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background: radial-gradient(120% 80% at 50% -10%, rgba(233,196,106,0.16), transparent 55%),
                  radial-gradient(80% 60% at 50% 120%, rgba(138,106,38,0.10), transparent 60%); }
    .wrap { position: relative; z-index: 1; inline-size: min(1080px, 90%); margin-inline: auto; }

    /* gold text + hairlines */
    .gold { background: var(--gold-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .rule { block-size: 1px; background: linear-gradient(90deg, transparent, var(--line), transparent); margin-block: 0; }
    .kicker { font-size: 12px; letter-spacing: 0.42em; text-transform: uppercase; color: var(--g2); font-weight: 500; }

    /* nav */
    nav { display: flex; align-items: baseline; justify-content: space-between; padding-block: 28px 0; }
    .mark { font-family: var(--serif); font-size: 26px; letter-spacing: 0.32em; font-weight: 600; }
    nav .links { font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); }
    nav .links a { color: var(--muted); text-decoration: none; }
    nav .links a:hover { color: var(--g2); }

    /* hero */
    .hero { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 48px; align-items: center; min-block-size: 84dvh; padding-block: 40px 64px; }
    @media (max-width: 820px) { .hero { grid-template-columns: 1fr; text-align: center; gap: 28px; padding-block: 28px 48px; } }
    .hero h1 { font-family: var(--serif); font-weight: 500; font-size: clamp(48px, 9.5vw, 116px); line-height: 0.94; letter-spacing: -0.01em; }
    .hero h1 em { font-style: italic; font-weight: 400; }
    .deck { font-family: var(--serif); font-size: clamp(19px, 2.4vw, 25px); color: var(--text); opacity: 0.9; font-weight: 400; margin-block: 22px 8px; max-inline-size: 30ch; }
    @media (max-width: 820px) { .deck { margin-inline: auto; } }
    .sub { color: var(--muted); font-size: 15.5px; max-inline-size: 42ch; margin-block: 12px 30px; }
    @media (max-width: 820px) { .sub { margin-inline: auto; } }

    .cta-row { display: flex; align-items: center; gap: 22px; }
    @media (max-width: 820px) { .cta-row { justify-content: center; } }
    .btn { position: relative; display: inline-flex; align-items: center; gap: 9px; font-family: var(--sans);
      font-weight: 700; font-size: 15px; letter-spacing: 0.01em; text-decoration: none; color: #1a1205;
      padding: 15px 26px; border-radius: 2px; background: var(--gold-grad); background-size: 200% 200%;
      box-shadow: 0 10px 40px rgba(201,154,60,0.28); transition: transform .25s ease, box-shadow .25s ease, background-position .6s ease; }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 16px 52px rgba(201,154,60,0.42); background-position: 100% 0; }
    .btn-ghost { color: var(--g2); text-decoration: none; font-size: 13.5px; letter-spacing: 0.06em; border-block-end: 1px solid var(--line); padding-block-end: 3px; }
    .btn-ghost:hover { color: var(--g1); border-color: var(--g2); }

    /* portrait with deco frame */
    .portrait-wrap { position: relative; justify-self: center; inline-size: min(360px, 78%); }
    .portrait-wrap::before { content: ""; position: absolute; inset: -14px; border: 1px solid var(--line); border-radius: 4px; }
    .portrait-wrap::after { content: ""; position: absolute; inset: -24px; border-block: 1px solid rgba(214,178,94,0.12); }
    .portrait { inline-size: 100%; display: block; border-radius: 3px; filter: saturate(1.05) contrast(1.02);
      mask-image: linear-gradient(180deg, #000 86%, transparent 100%); }
    .portrait-glow { position: absolute; inset: -40px -40px 0; z-index: -1; background: radial-gradient(60% 55% at 50% 42%, rgba(233,196,106,0.30), transparent 70%); filter: blur(8px); }

    /* sections */
    section { padding-block: 92px; }
    .sec-head { display: flex; align-items: baseline; gap: 18px; margin-block-end: 40px; }
    .sec-head h2 { font-family: var(--serif); font-weight: 500; font-size: clamp(30px, 5vw, 52px); line-height: 1; }
    .sec-head .num { font-family: var(--serif); font-size: 16px; color: var(--g3); letter-spacing: 0.1em; }

    .features { display: grid; gap: 0; }
    .feat { display: grid; grid-template-columns: 64px 1fr; gap: 26px; align-items: start; padding-block: 26px; border-block-start: 1px solid var(--line); }
    .feat:last-child { border-block-end: 1px solid var(--line); }
    .feat .idx { font-family: var(--serif); font-size: 40px; line-height: 1; }
    .feat h3 { font-family: var(--serif); font-weight: 600; font-size: 25px; margin-block-end: 4px; }
    .feat p { color: var(--muted); font-size: 15px; max-inline-size: 60ch; }

    .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
    @media (max-width: 760px) { .steps { grid-template-columns: 1fr; } }
    .step { padding: 26px 24px; border: 1px solid var(--line); border-radius: 3px; background: var(--panel); }
    .step .s { font-family: var(--serif); font-size: 15px; color: var(--g2); letter-spacing: 0.2em; text-transform: uppercase; }
    .step h4 { font-family: var(--serif); font-weight: 600; font-size: 22px; margin-block: 8px 6px; }
    .step p { color: var(--muted); font-size: 14.5px; }

    .closer { text-align: center; padding-block: 110px 70px; }
    .closer h2 { font-family: var(--serif); font-weight: 500; font-size: clamp(34px, 6.5vw, 76px); line-height: 1.0; margin-block-end: 28px; }
    footer { padding-block: 30px 56px; color: var(--muted); font-size: 12.5px; display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: space-between; align-items: center; }
    footer a { color: var(--muted); text-decoration: none; }
    footer a:hover { color: var(--g2); }

    /* scroll reveals */
    .reveal { opacity: 0; transform: translateY(26px); transition: opacity .9s cubic-bezier(.16,.7,.3,1), transform .9s cubic-bezier(.16,.7,.3,1); }
    .reveal.in { opacity: 1; transform: none; }
    @media (prefers-reduced-motion: reduce) { .reveal { opacity: 1; transform: none; transition: none; } #dust { display: none; } }
    ${brandCssVars(branding)}
  </style>
</head>
<body>
  <canvas id="dust"></canvas>
  <div class="vignette"></div>

  <div class="wrap">
    <nav class="reveal">
      <span class="mark gold">${productName.toUpperCase()}</span>
      <span class="links"><a href="${telegramUrl}">Open in Telegram ↗</a></span>
    </nav>

    <header class="hero">
      <div>
        <p class="kicker reveal">BSC · Safe Multisig · Non-Custodial</p>
        <h1 class="reveal" style="margin-top:18px">The <em class="gold">Golden</em><br/>Girl of <span class="gold">Binance</span></h1>
        <p class="deck reveal">A shared trading desk for your Telegram group — poured in gold, run on a Safe you control.</p>
        <p class="sub reveal">Pool BNB into share-based accounting, prepare token buys and Flap launches as Safe transactions your owners sign, and watch every share and PnL live. BNancy never holds your keys.</p>
        <div class="cta-row reveal">
          <a class="btn" id="cta" href="${telegramUrl}">💛 Open ${productName} in Telegram</a>
          <a class="btn-ghost" href="${telegramUrl}">@${botUsername}</a>
        </div>
      </div>
      <div class="portrait-wrap reveal">
        <div class="portrait-glow"></div>
        <img class="portrait" src="/og-image.png" alt="B. Nancy profile art" />
      </div>
    </header>

    <section>
      <div class="sec-head reveal"><span class="num gold">01 —</span><h2>What she runs</h2></div>
      <div class="features">
        <div class="feat reveal"><span class="idx gold">I</span><div><h3>A Safe you control</h3><p>One Safe multisig per group, deployed from an owner's own wallet. BNancy prepares transactions and collects signatures — custody never leaves your Safe.</p></div></div>
        <div class="feat reveal"><span class="idx gold">II</span><div><h3>Pooled, to the wei</h3><p>Deposits mint deterministic shares with live NAV, ownership, and unrealized PnL per member. Verified on-chain before a single share is minted.</p></div></div>
        <div class="feat reveal"><span class="idx gold">III</span><div><h3>Trade &amp; launch</h3><p>Token buys via PancakeSwap and Flap token launches become Safe transactions your owners sign and execute from their own wallets.</p></div></div>
        <div class="feat reveal"><span class="idx gold">IV</span><div><h3>All inside Telegram</h3><p>Button-driven — no addresses to type — with a live analytics Mini App for the whole group's breakdown.</p></div></div>
      </div>
    </section>

    <div class="rule reveal"></div>

    <section>
      <div class="sec-head reveal"><span class="num gold">02 —</span><h2>Three taps in</h2></div>
      <div class="steps">
        <div class="step reveal"><span class="s gold">First</span><h4>Get a wallet</h4><p>Generate a non-custodial wallet (key shown once) or link your own with a signature.</p></div>
        <div class="step reveal"><span class="s gold">Then</span><h4>Raise the Safe</h4><p>Collect owners and deploy your group Safe from your own wallet — no bot key.</p></div>
        <div class="step reveal"><span class="s gold">Finally</span><h4>Pool &amp; grow</h4><p>Init the pool, deposit BNB, and watch your share move with the desk.</p></div>
      </div>
    </section>

    <section class="closer reveal">
      <h2>Step into the <span class="gold">gold</span>.</h2>
      <a class="btn" href="${telegramUrl}">💛 Open ${productName} in Telegram</a>
    </section>

    <div class="rule"></div>
    <footer>
      <span>${footerNote}</span>
      <span><a href="${telegramUrl}">@${botUsername}</a>${adminLink} · ${tagline}</span>
    </footer>
  </div>

  <script type="module">
    // Telegram Mini App awareness: if opened inside Telegram, expand + theme and
    // close the gap; otherwise this is the public site and the CTAs open the bot.
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg && tg.initData !== undefined) {
      try { tg.ready(); tg.expand(); } catch (e) {}
      const cta = document.getElementById("cta");
      if (cta) { cta.textContent = "💛 Open BNancy"; cta.addEventListener("click", (ev) => { ev.preventDefault(); try { tg.openTelegramLink("${telegramUrl}"); } catch (e) { location.href = "${telegramUrl}"; } }); }
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Staggered reveal on scroll.
    const items = [...document.querySelectorAll(".reveal")];
    if (reduce) { items.forEach((el) => el.classList.add("in")); }
    else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e, i) => { if (e.isIntersecting) { setTimeout(() => e.target.classList.add("in"), i * 70); io.unobserve(e.target); } });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
      items.forEach((el) => io.observe(el));
    }

    // Buttery smooth scroll (Lenis).
    if (!reduce) {
      try {
        const { default: Lenis } = await import("https://esm.sh/lenis@1.1.18");
        const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.4 });
        const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      } catch (e) { /* native scroll fallback */ }
    }

    // Gold-dust canvas: rising motes with a soft twinkle. The mote is pre-rendered
    // ONCE to an offscreen sprite and drawImage'd — far cheaper than a per-frame
    // radial gradient, so it never starves the scroll's frame budget.
    if (!reduce) {
      const canvas = document.getElementById("dust");
      const ctx = canvas.getContext("2d");
      let w, h, dpr, motes;
      const COUNT = 80;
      const rand = (a, b) => a + Math.random() * (b - a);
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 32;
      const sctx = sprite.getContext("2d");
      const sg = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      sg.addColorStop(0, "rgba(245,231,172,1)");
      sg.addColorStop(0.45, "rgba(233,196,106,0.55)");
      sg.addColorStop(1, "rgba(233,196,106,0)");
      sctx.fillStyle = sg; sctx.fillRect(0, 0, 32, 32);
      function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        w = canvas.width = innerWidth * dpr; h = canvas.height = innerHeight * dpr;
        canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
      }
      function seed() {
        motes = Array.from({ length: COUNT }, () => ({
          x: rand(0, w), y: rand(0, h), r: rand(1.4, 5.5) * dpr,
          vy: rand(0.06, 0.34) * dpr, vx: rand(-0.1, 0.1) * dpr,
          a: rand(0.15, 0.7), tw: rand(0.004, 0.014), p: rand(0, Math.PI * 2)
        }));
      }
      function frame() {
        ctx.clearRect(0, 0, w, h);
        for (const m of motes) {
          m.y -= m.vy; m.x += m.vx; m.p += m.tw;
          if (m.y < -8) { m.y = h + 8; m.x = rand(0, w); }
          if (m.x < -8) m.x = w + 8; if (m.x > w + 8) m.x = -8;
          ctx.globalAlpha = m.a * (0.5 + 0.5 * Math.sin(m.p));
          ctx.drawImage(sprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
        }
        ctx.globalAlpha = 1;
        requestAnimationFrame(frame);
      }
      resize(); seed(); frame();
      let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { resize(); seed(); }, 150); });
    }
  </script>
</body>
</html>`;
}
