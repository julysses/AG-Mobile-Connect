# How to Connect Your Phone to Antigravity AI

Follow these steps once. After setup, connecting takes **under 10 seconds**.

---

## Before You Start

You need two things installed on your Mac:

- **Node.js** — download from [nodejs.org](https://nodejs.org) (click the green LTS button, install like any app)
- **AG Mobile Connect** — the folder you already have

---

## Step 1 — Start the Bridge

Open the `ag-mobile-connect` folder and **double-click** `ag_mobile_connect.command`.

> **macOS security warning?** Right-click the file → **Open** → click **Open** in the popup. You only have to do this once.

A terminal window opens. The first time takes about 30 seconds to download one small tool automatically. You'll see progress in the terminal.

---

## Step 2 — Wait for the QR Codes

When setup is complete you'll see something like this in the terminal:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  AG MOBILE CONNECT  ·  Ready
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  SCAN FROM ANYWHERE         SCAN ON HOME WI-FI ONLY
  (works on mobile data)     (faster, no tunnel)

  [QR CODE]                  [QR CODE]

  https://abc123.trycloudflare.com    https://192.168.1.42:3000

  Password: a1b2c3d4e5f6g7h8
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Two QR codes appear:

| Left QR | Right QR |
|---|---|
| Works **anywhere** — mobile data, coffee shop, anywhere | Works on your **home Wi-Fi only** (faster) |

---

## Step 3 — Connect Your Phone

1. **Open your phone camera** and point it at one of the QR codes
2. Tap the link that appears at the top of your screen
3. Your browser opens — enter the **password** shown in the terminal
4. Tap **Log In**

---

## Step 4 — Install the App Icon (Recommended)

Installing puts a proper app icon on your home screen — it opens full-screen with no browser address bar.

**iPhone (Safari):**
1. Tap the **Share** button (the box with an arrow pointing up)
2. Scroll down and tap **Add to Home Screen**
3. Tap **Add**

**Android (Chrome):**
1. Tap the **three-dot menu** (⋮) in the top-right
2. Tap **Add to Home Screen** or **Install App**
3. Tap **Add**

---

## Step 5 — Enable Notifications (Highly Recommended)

This lets your phone buzz when Antigravity finishes a task or needs your approval — even when your screen is locked.

1. Tap the **⚙️ Settings** tab at the bottom of the app
2. Tap **Enable** next to Push Notifications
3. Tap **Allow** when your phone asks for permission

---

## You're Done

Your phone now shows all of Antigravity's panels in real time.

| Tab | What you can do |
|---|---|
| 💬 **Chat** | Send messages, stop generation, approve tool requests |
| 🤖 **Agents** | See all running sessions, tap Allow/Deny on approvals |
| ⚙️ **Settings** | Switch AI model, change Fast/Planning mode |
| 🖥️ **Terminal** | View live terminal output |
| 📁 **Files** | Browse project files |

---

## Every Time After That

Just double-click `ag_mobile_connect.command` on your Mac.
Your phone app reconnects automatically.

---

## Troubleshooting

**"Can't connect" or browser shows a security warning**
This happens with the local Wi-Fi QR. Tap **Advanced** → **Proceed anyway** (or **Visit this website**). This is expected — the local connection uses a self-signed certificate. The Cloudflare QR (left QR) never shows this warning.

**App shows "Reconnecting…"**
Your Mac went to sleep or the server restarted. Double-click the launcher again. The app reconnects in a few seconds.

**Push notifications not working on iPhone**
Notifications require the app to be installed to your Home Screen (Step 4 above). iOS only allows push notifications for installed PWAs, not browser tabs.

**Antigravity not detected**
Make sure Antigravity AI is open on your Mac. The launcher opens it automatically, but if it was already running before you started the launcher, you may need to quit and reopen it.

**Password changed between sessions**
The password is generated fresh each launch unless you set a fixed one. To set a fixed password, open `config/default.json` and set `"password": "your-password-here"`.
