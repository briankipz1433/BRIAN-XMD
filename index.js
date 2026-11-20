const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure these as environment variables (never commit their values).
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "";
const PAIRING_ADMIN_TOKEN = process.env.PAIRING_ADMIN_TOKEN || "";

let pairingNumber = "";
let currentPairCode = "";
let botStatus = "Disconnected";
let sock = null;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const getHTML = (token) => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 BRIAN XMD - Pair</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',sans-serif}
body{background:#0a0f0a;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:15px}
.card{background:linear-gradient(180deg,#1a241a 0%,#0f1510 100%);width:100%;max-width:420px;border-radius:22px;padding:28px 24px;text-align:center;border:2px solid #FFD700;box-shadow:0 10px 40px rgba(255,215,0,0.25)}
.crown{font-size:55px}
h1{color:#fff;font-size:28px;letter-spacing:2px;margin-top:6px}
h1 span{color:#FFD700}
.sub{color:#25D366;font-size:12px;font-weight:700;letter-spacing:2px;margin:6px 0 16px}
.status{display:inline-block;padding:7px 16px;border-radius:20px;font-size:12px;font-weight:800;background:${botStatus.includes('ONLINE') ? '#25D366' : '#ff3b30'};color:#000;margin-bottom:18px;border:1px solid #FFD700}
.box{background:#111a11;padding:18px;border-radius:14px;margin-bottom:16px;border:1px solid #FFD700}
.box label{color:#FFD700;font-size:11px;letter-spacing:2px;font-weight:700}
.code{font-size:42px;letter-spacing:8px;color:#fff;font-weight:900;margin:10px 0}
.number{color:#25D366;font-size:15px;font-weight:700}
.steps{text-align:left;background:#111a11;padding:16px;border-radius:14px;margin-bottom:16px;border:1px solid #333}
.steps h3{color:#FFD700;font-size:14px;margin-bottom:10px}
.steps p{color:#ccc;font-size:13px;line-height:1.9}
input{width:100%;padding:13px;border-radius:10px;border:1px solid #FFD700;background:#000;color:#fff;font-size:15px;text-align:center;outline:none;margin-bottom:10px}
button{width:100%;padding:14px;border:none;border-radius:12px;background:linear-gradient(90deg,#25D366,#FFD700);color:#000;font-weight:900;font-size:15px;cursor:pointer}
.footer{color:#888;font-size:11px;margin-top:16px}
.footer b{color:#FFD700}
</style>
</head>
<body>
<div class="card">
  <div class="crown">👑</div>
  <h1>BRIAN <span>XMD</span></h1>
  <p class="sub">👑 KING OF BOTS • GREEN + GOLD 👑</p>
  <div class="status">${botStatus.toUpperCase()}</div>
  ${currentPairCode ? `
  <div class="box">
    <label>✨ YOUR PAIR CODE ✨</label>
    <div class="code">${currentPairCode}</div>
    <div class="number">For: +${pairingNumber}</div>
    <div style="color:#FFD700;font-size:12px;margin-top:8px">⏳ Expires in 20s</div>
  </div>
  <div class="steps">
    <h3>📱 How To Link:</h3>
    <p><b>1.</b> Copy code above<br><b>2.</b> Open WhatsApp<br><b>3.</b> Settings → Linked Devices<br><b>4.</b> Link a Device<br><b>5.</b> Tap "Link with phone number instead"<br><b>6.</b> Paste code & Connect 👑</p>
  </div>
  <form method="POST" action="/pair?token=${token}"><input type="hidden" name="number" value="${pairingNumber}"><button type="submit">🔄 Generate New Code</button></form>
  ` : `
  <div class="box">
    <label>👑 ENTER ADMIN NUMBER TO GENERATE CODE</label>
    <p style="color:#aaa;font-size:12px;margin:8px 0">Only ADMIN_NUMBER can generate code</p>
    <form method="POST" action="/pair?token=${token}">
      <input name="number" placeholder="2547..." required>
      <button type="submit">GENERATE CODE 👑 →</button>
    </form>
  </div>
  `}
  <p class="footer">👑 <b>BRIAN XMD</b> © 2026 • Public Bot</p>
</div>
${currentPairCode ? `<script>setTimeout(()=>location.reload(),20000)</script>` : ''}
</body>
</html>
`;

function checkToken(req, res, next) {
  if (!PAIRING_ADMIN_TOKEN) return res.send("Set PAIRING_ADMIN_TOKEN in Render Env");
  if (req.query.token !== PAIRING_ADMIN_TOKEN) return res.send("<h2 style='text-align:center;font-family:sans-serif'>❌ Access Denied - Wrong Token</h2>");
  next();
}

app.get('/', checkToken, (req, res) => res.send(getHTML(req.query.token)));
app.get('/pair', checkToken, (req, res) => res.send(getHTML(req.query.token)));

app.post('/pair', checkToken, async (req, res) => {
  let num = (req.body.number || "").replace(/[^0-9]/g, "");
  if (num.startsWith("0")) num = "254" + num.slice(1);
  if (num !== ADMIN_NUMBER) return res.send("<h2 style='text-align:center'>❌ Only ADMIN_NUMBER allowed</h2>");
  pairingNumber = num;
  currentPairCode = "";
  if (sock && !sock.authState.creds.registered) {
    try {
      currentPairCode = await sock.requestPairingCode(pairingNumber);
      console.log(`👑 BRIAN XMD CODE FOR ${pairingNumber}: ${currentPairCode}`);
    } catch (e) { console.log("Pair Error:", e.message); }
  } else {
    if (sock) { try { sock.end(); } catch {} }
    setTimeout(() => startBot(), 1000);
  }
  res.redirect('/pair?token=' + req.query.token);
});

app.listen(PORT, () => console.log(`BRIAN XMD on ${PORT}`));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('session');
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['BRIAN XMD', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });
  sock.ev.on('creds.update', saveCreds);
  if (!sock.authState.creds.registered && pairingNumber) {
    setTimeout(async () => {
      try {
        currentPairCode = await sock.requestPairingCode(pairingNumber);
        console.log(`👑 CODE: ${currentPairCode}`);
      } catch (e) { console.log("Pair Error:", e.message); }
    }, 3000);
  }
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      botStatus = "Disconnected"; currentPairCode = "";
      if (loggedOut) {
        try { fs.rmSync('session', { recursive: true, force: true }); } catch {}
        pairingNumber = "";
        setTimeout(() => startBot(), 2000);
      } else { setTimeout(() => startBot(), 3000); }
    } else if (connection === 'open') {
      botStatus = "Connected - ONLINE"; currentPairCode = "";
      console.log('👑 BRIAN XMD CONNECTED');
      await sock.sendPresenceUpdate('available');
      setInterval(async () => { try { await sock.sendPresenceUpdate('available'); } catch {} }, 15000);
      try { await sock.updateProfileStatus("👑 BRIAN XMD ONLINE 🔥"); } catch {}
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const cmd = text.trim().toLowerCase();
    const reply = async (t) => await sock.sendMessage(jid, { text: t });

    if (cmd === ".menu" || cmd === "menu" || cmd === "hi" || cmd === "hello") {
      await reply(`👑 *BRIAN XMD* 👑\n\n*PUBLIC BOT MENU*\n\n🔥 *.ping* - Check bot speed\n👑 *.owner* - Owner info\nℹ️ *.info* - Bot info\n😂 *.joke* - Random joke\n📖 *.quote* - Motivation\n\n_Green + Gold Edition_\n_Type .menu anytime_`);
    }
    else if (cmd === ".ping") await reply(`👑 *BRIAN XMD* PONG! 🔥\nSpeed: Fast ⚡`);
    else if (cmd === ".owner") await reply(`👑 *OWNER - BRIAN XMD*\n\nOwner: Brian\nWhatsApp: wa.me/${ADMIN_NUMBER}\nBot: BRIAN XMD`);
    else if (cmd === ".info") await reply(`👑 *BRIAN XMD*\n\nVersion: 1.0 Public\nStatus: Online ✅\nMade by Brian 🇰🇪`);
    else if (cmd === ".joke") {
      const jokes = ["Why did the phone go to therapy? Too many missed calls 😂", "Why do programmers prefer dark mode? Because light attracts bugs 😂", "What do you call a fish without eyes? A fsh 😂"];
      await reply(jokes[Math.floor(Math.random()*jokes.length)]);
    }
    else if (cmd === ".quote") await reply(`👑 *BRIAN XMD QUOTE*\n\n"Don't give up. Your time is coming." 🔥`);
  });
}

startBot();
