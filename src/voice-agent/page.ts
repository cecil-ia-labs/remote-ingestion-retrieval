// The browser module is compiled alongside the server; no bundler or external assets are required.
export const voiceAgentPage = `<!doctype html>
<html lang="it-IT">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Increso · Assistente vocale</title>
  <style>
    :root{font:16px/1.55 system-ui,sans-serif;color:#e9e9e5;background:#141615;color-scheme:dark;--accent:#c4f178;--muted:#a6aca6}
    *{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1160px;margin:auto;padding:26px 40px}
    header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #333833}
    .brand{font-size:25px;font-weight:750;letter-spacing:-1px}.label{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
    main{display:grid;grid-template-columns:1fr 1fr;gap:70px;padding-top:64px;min-height:75vh}h1{font-size:clamp(32px,4vw,52px);line-height:1.1;letter-spacing:-.045em;margin:14px 0 22px}
    h2{font-size:16px;font-weight:600;margin:0 0 20px}p{color:var(--muted);max-width:38ch}button{font:inherit;cursor:pointer;border:1px solid #495049;background:transparent;color:inherit;padding:12px 22px;border-radius:6px;min-height:48px;transition:background .15s,transform .15s}
    button:hover:enabled{background:#2e352b;transform:translateY(-1px)}button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}button:disabled{opacity:.4;cursor:default}
    .primary{background:var(--accent);color:#17220e;border-color:var(--accent);font-weight:650}.primary:hover:enabled{background:#d5ff91}
    .controls{display:flex;flex-wrap:wrap;gap:10px;margin:28px 0 16px}.status{display:flex;align-items:center;gap:10px;margin-top:34px;color:var(--accent);min-height:24px}.dot{width:8px;height:8px;border-radius:50%;background:currentColor}
    body[data-active=true] .dot{animation:breathe 1.4s infinite}.error{color:#ffb7a5;white-space:pre-wrap;max-width:50ch}.workspace{border-left:1px solid #333833;padding-left:36px;min-width:0}
    #transcript{height:340px;overflow:auto;scroll-behavior:smooth;padding-right:12px}.empty{color:var(--muted);font-size:14px}.turn{margin-bottom:24px;animation:appear .2s ease-out}.turn small{display:block;color:var(--accent);margin-bottom:5px;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.turn div{white-space:pre-wrap;overflow-wrap:anywhere}
    .sources{margin-top:30px;padding-top:24px;border-top:1px solid #333833}#sources{padding:0;list-style:none}#sources li{margin-bottom:14px}a{color:var(--accent);text-underline-offset:4px}#sources small{display:block;color:var(--muted);overflow-wrap:anywhere}
    footer{font-size:12px;color:var(--muted);border-top:1px solid #333833}.hint{font-size:13px}.visual{display:flex;align-items:center;gap:5px;height:52px;margin:30px 0}.visual span{height:8px;width:4px;background:#526143;border-radius:4px;transition:height .2s}
    body[data-active=true] .visual span{background:var(--accent);animation:wave 1.2s ease-in-out infinite;animation-delay:calc(var(--i)*-.13s)}
    @keyframes breathe{50%{opacity:.35}}@keyframes wave{50%{height:calc(14px + var(--i)*3px)}}@keyframes appear{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
    @media(max-width:760px){header,main,footer{padding:22px}main{grid-template-columns:1fr;gap:38px;padding-top:36px}.workspace{border-left:0;border-top:1px solid #333833;padding:28px 0 0}#transcript{height:260px}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  </style>
</head>
<body data-active="false">
  <header><div class="brand">increso<span aria-hidden="true">.</span></div><span class="label">Assistente vocale · IA</span></header>
  <main>
    <section aria-labelledby="title">
      <div class="label">Parla con la nostra base di conoscenza</div>
      <h1 id="title">Cosa vuoi sapere<br>su Increso?</h1>
      <p>Fai la tua domanda a voce. L'assistente consulta la base di conoscenza prima di rispondere.</p>
      <div class="visual" aria-hidden="true"><span style="--i:1"></span><span style="--i:3"></span><span style="--i:5"></span><span style="--i:8"></span><span style="--i:10"></span><span style="--i:7"></span><span style="--i:4"></span><span style="--i:6"></span><span style="--i:3"></span><span style="--i:1"></span></div>
      <div class="controls"><button id="start" class="primary">Avvia conversazione</button><button id="mute" disabled>Disattiva microfono</button><button id="stop" disabled>Termina</button></div>
      <div class="status" role="status"><span class="dot" aria-hidden="true"></span><span id="status">Pronta a conversare</span></div>
      <p class="hint">Consenti l'accesso al microfono per iniziare. Puoi interrompere la risposta parlando. L'audio viene elaborato da OpenAI.</p>
      <p id="error" class="error" role="alert"></p>
    </section>
    <section class="workspace" aria-label="Conversazione e fonti">
      <h2>Conversazione</h2><div id="transcript" role="log" aria-live="polite"><p class="empty">La conversazione apparirà qui.</p></div>
      <div class="sources"><h2>Fonti consultate</h2><p id="search-status" class="empty">Le fonti appariranno dopo la prima ricerca.</p><ul id="sources"></ul></div>
    </section>
  </main>
  <footer>Voce generata dall'intelligenza artificiale. Verifica le informazioni importanti nelle fonti indicate.</footer>
  <audio id="remote-audio" autoplay></audio>
  <script type="module" src="/client.js"></script>
</body>
</html>`;
