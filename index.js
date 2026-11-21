const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// SAFER: Set these ONLY in Render > Environment, never in code
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "";
const PAIRING_ADMIN_TOKEN = process.env.PAIRING_ADMIN_TOKEN || "";

let pairingNumber = "";
let currentPairCode = "";
let botStatus = "Disconnected";
let sock = null;
let startTime = Date.now();
let lastCmd = {};
let totalUsers = new Set();

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
.card{background:linear-gradient(180deg,#1a241a 0%,#0f1510 100%);width:100%;max-width:430px;border-radius:22px;padding:28px 24px;text-align:center;border:2px solid #FFD700;box-shadow:0 10px 40px rgba(255,215,0,0.25)}
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
  <div class="box"><label>✨ YOUR PAIR CODE ✨</label><div class="code">${currentPairCode}</div><div class="number">For: +${pairingNumber}</div><div style="color:#FFD700;font-size:12px;margin-top:8px">⏳ Expires in 20s</div></div>
  <div class="steps"><h3>📱 How To Link:</h3><p><b>1.</b> Copy code<br><b>2.</b> WhatsApp → Settings → Linked Devices<br><b>3.</b> Link a Device → Link with phone number<br><b>4.</b> Paste code 👑</p></div>
  <form method="POST" action="/pair?token=${token}"><input type="hidden" name="number" value="${pairingNumber}"><button type="submit">🔄 Generate New Code</button></form>
  ` : `
  <div class="box"><label>👑 ADMIN ONLY - ENTER NUMBER</label><p style="color:#aaa;font-size:12px;margin:8px 0">Only ADMIN_NUMBER can pair</p><form method="POST" action="/pair?token=${token}"><input name="number" placeholder="2547..." required><button type="submit">GENERATE CODE 👑 →</button></form></div>
  <div class="steps"><h3>✨ BRIAN XMD FEATURES:</h3><p>🎨 Sticker Maker • 😂 Jokes • 📖 Quotes<br>👥 Group Tools • ⚡ Super Fast • 👑 King Menu<br><b>Users:</b> Send <b>.menu</b> on WhatsApp</p></div>
  `}
  <p class="footer">👑 <b>BRIAN XMD</b> © 2026 • Private Pairing • Made by Brian 🇰🇪</p>
</div>
${currentPairCode ? `<script>setTimeout(()=>location.reload(),20000)</script>` : ''}
</body>
</html>
`;

function checkToken(req, res, next) {
  if (!PAIRING_ADMIN_TOKEN) return res.send("Set PAIRING_ADMIN_TOKEN in Render Env");
  if (req.query.token !== PAIRING_ADMIN_TOKEN) return res.status(403).send("<h2 style='text-align:center;font-family:sans-serif'>❌ Access Denied - Wrong Token</h2>");
  next();
}

app.get('/', checkToken, (req, res) => res.send(getHTML(req.query.token)));
app.get('/pair', checkToken, (req, res) => res.send(getHTML(req.query.token)));
app.get('/status', checkToken, (req, res) => res.json({ bot: "BRIAN XMD", status: botStatus, users: totalUsers.size, uptime: Math.floor((Date.now()-startTime)/1000) }));

app.post('/pair', checkToken, async (req, res) => {
  let num = (req.body.number || "").replace(/[^0-9]/g, "");
  if (num.startsWith("0")) num = "254" + num.slice(1);
  // SAFER: Only admin can pair
  if (!ADMIN_NUMBER || num !== ADMIN_NUMBER) return res.status(403).send("<h2 style='text-align:center'>❌ Only ADMIN_NUMBER allowed</h2>");
  pairingNumber = num;
  currentPairCode = "";
  // Do NOT delete session if already connected - prevents hijack
  if (sock && sock.authState.creds.registered) {
    return res.send("<h2 style='text-align:center'>✅ Already Connected</h2><a href='/pair?token=" + req.query.token + "'>Back</a>");
  }
  if (sock && !sock.authState.creds.registered) {
    try { currentPairCode = await sock.requestPairingCode(pairingNumber); } catch (e) { console.log("Pair Error:", e.message); }
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
    version, logger: pino({ level: 'silent' }), printQRInTerminal: false,
    auth: state, browser: ['BRIAN XMD', 'Chrome', '2.0.0'],
    syncFullHistory: false, markOnlineOnConnect: true,
  });
  sock.ev.on('creds.update', saveCreds);
  if (!sock.authState.creds.registered && pairingNumber) {
    setTimeout(async () => {
      try { currentPairCode = await sock.requestPairingCode(pairingNumber); } catch (e) { console.log("Pair Error:", e.message); }
    }, 3000);
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const loggedOut = lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut;
      botStatus = "Disconnected"; currentPairCode = "";
      if (loggedOut) {
        try { fs.rmSync('session', { recursive: true, force: true }); } catch {}
        pairingNumber = ""; setTimeout(() => startBot(), 2000);
      } else setTimeout(() => startBot(), 3000);
    } else if (connection === 'open') {
      botStatus = "Connected - ONLINE"; currentPairCode = ""; startTime = Date.now();
      console.log('👑 BRIAN XMD CONNECTED');
      await sock.sendPresenceUpdate('available');
      setInterval(async () => { try { await sock.sendPresenceUpdate('available'); } catch {} }, 15000);
      try { await sock.updateProfileStatus("👑 BRIAN XMD ONLINE 🔥 | Send .menu"); } catch {}
    }
  });

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      if (action === 'add') {
        for (let p of participants) {
          await sock.sendMessage(id, { text: `👑 *WELCOME TO THE KINGDOM!* 👑\n\nWelcome @${p.split('@')[0]} 🔥\n\nThis group is protected by *BRIAN XMD*\nType *.menu* to see commands`, mentions: [p] });
        }
      }
    } catch {}
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    totalUsers.add(sender);
    try { await sock.readMessages([msg.key]); } catch {}

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "";
    const cmd = text.trim().toLowerCase();

    if (cmd.startsWith(".")) {
      const now = Date.now();
      if (lastCmd[sender] && now - lastCmd[sender] < 3000) {
        return await sock.sendMessage(jid, { text: `⏳ *Slow down!* Wait 3 seconds 👑` }, { quoted: msg });
      }
      lastCmd[sender] = now;
    }

    const reply = async (t) => await sock.sendMessage(jid, { text: t }, { quoted: msg });
    const isGroup = jid.endsWith('@g.us');

    if (cmd === ".menu" || cmd === "menu" || cmd === "hi" || cmd === "hello" || cmd === ".help") {
      const uptime = Math.floor((Date.now()-startTime)/3600);
      await sock.sendMessage(jid, {
        text: `👑 *BRIAN XMD* 👑\n━━━━━━━━━━━━━━\n👑 *Owner:* Brian\n⚡ *Uptime:* ${uptime}h\n👥 *Users:* ${totalUsers.size}\n🔥 *Version:* 2.0 SAFE\n━━━━━━━━━━━━━━\n\n*🎨 FUN*\n😂 .joke - Random joke\n📖 .quote - Motivation\n🎲 .dice - Roll dice\n🪙 .coin - Flip coin\n❤️ .ship - Love %\n\n*🛠️ TOOLS*\n🎨 .sticker - Image to sticker\n🏷️ .tagall - Tag all (Group)\n📊 .info - Bot info\n👑 .owner - Owner info\n\n*⚡ GENERAL*\n🔥 .ping - Speed test\n📋 .menu - This menu\n\n_Green + Gold Edition 🇰🇪_`,
        footer: "BRIAN XMD © 2026",
        buttons: [
          { buttonId: ".ping", buttonText: { displayText: "⚡ PING" }, type: 1 },
          { buttonId: ".owner", buttonText: { displayText: "👑 OWNER" }, type: 1 },
          { buttonId: ".sticker", buttonText: { displayText: "🎨 STICKER" }, type: 1 }
        ],
        headerType: 1
      }, { quoted: msg });
    }
    else if (cmd === ".ping") await reply(`👑 *BRIAN XMD* PONG! 🔥\n✅ Online`);
    else if (cmd === ".owner") await reply(`👑 *OWNER - BRIAN XMD*\n\n👑 Name: Brian\n🇰🇪 From: Kenya\n🤖 Bot: BRIAN XMD`);
    else if (cmd === ".info") await reply(`👑 *BRIAN XMD INFO*\n\nVersion: 2.0 SAFE\nStatus: Online ✅\nUsers: ${totalUsers.size}\nMade by Brian 🇰🇪`);
    else if (cmd === ".joke") {
      const jokes = ["Why did the phone go to therapy? Too many missed calls 😂","Why do programmers prefer dark mode? Because light attracts bugs 😂","What do you call a fish without eyes? A fsh 😂","Why did the chicken cross the road? To get to BRIAN XMD 😂"];
      await reply(`😂 *BRIAN XMD JOKE*\n\n${jokes[Math.floor(Math.random()*jokes.length)]}`);
    }
    else if (cmd === ".quote") {
      const quotes = ["Don't give up. Your time is coming. 🔥","Be a King, not a follower. 👑","Hard work beats talent. 💪","Your only limit is you. 🚀"];
      await reply(`📖 *BRIAN XMD QUOTE*\n\n"${quotes[Math.floor(Math.random()*quotes.length)]}"`);
    }
    else if (cmd === ".dice") await reply(`🎲 *You rolled:* ${Math.floor(Math.random()*6)+1} 🎲`);
    else if (cmd === ".coin") await reply(`🪙 *Coin:* ${Math.random() > 0.5 ? "HEADS 👑" : "TAILS"}`);
    else if (cmd === ".ship") await reply(`❤️ *LOVE METER* ❤️\n\nLove: ${Math.floor(Math.random()*101)}%`);
    else if (cmd === ".sticker" || cmd === ".s") {
      try {
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const imgMsg = quoted?.imageMessage || msg.message.imageMessage;
        if (!imgMsg) return await reply(`🎨 *How to make sticker:*\n\nSend an image + caption *.sticker*\nOr reply to an image with *.sticker*`);
        const stream = await downloadContentFromMessage(imgMsg, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        await sock.sendMessage(jid, { sticker: buffer }, { quoted: msg });
      } catch { await reply(`❌ Sticker failed. Try again.`); }
    }
    else if (cmd === ".tagall") {
      if (!isGroup) return await reply(`❌ Use .tagall in a group only`);
      try {
        const meta = await sock.groupMetadata(jid);
        const mentions = meta.participants.map(p => p.id);
        await sock.sendMessage(jid, { text: `👑 *BRIAN XMD TAG ALL* 👑\n\n${mentions.map(m => `@${m.split('@')[0]}`).join('\n')}`, mentions });
      } catch { await reply(`❌ Can't tag all`); }
    }
  });
}
startBot();
