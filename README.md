# 🎈 Pop the Balloon

A social matching game for Discord & browser. Hold your balloon, answer prompts, and find your match — but don't get popped!

**Tagline:** *"Hold your balloon. Find your match. Don't get popped."*

## 🎮 How It Works

1. **Join a room** — Up to 12 players connect via Discord or browser
2. **Answer prompts** — Anonymous answers to fun questions
3. **Vote** — After each reveal, vote 💚 Keep or 🔴 Pop
4. **Find matches** — Surviving balloons = your matches!

## 🎯 Game Modes

- **🔵 Chill** — 5 prompts, relaxed pace, perfect for voice chat hangouts
- **🔴 Rapid Fire** — 10 quick prompts with 10-second timers
- **🟡 Blind** — No names shown, pure personality matching

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Backend:** Firebase Realtime Database
- **Auth:** Discord Embedded App SDK
- **Hosting:** Cloudflare Pages

## 🚀 Development

```bash
# Clone the repo
git clone https://github.com/Walusimbi-Leon1/pop-the-balloon.git
cd pop-the-balloon

# Serve locally
npx serve .
# or
python3 -m http.server 8000
```

## 📁 Structure

```
pop-the-balloon/
├── index.html          # Main game page
├── css/
│   └── style.css       # All styling
├── js/
│   ├── app.js          # Main game logic
│   ├── discord.js      # Discord SDK integration
│   └── firebase.js     # Firebase Realtime DB sync
├── assets/             # Sound effects, images
└── docs/
    └── GAME_DESIGN.md  # Full game design document
```

## 📄 Legal

- [Terms of Service](TERMS.md)
- [Privacy Policy](PRIVACY.md)

## 🎈 Inspired By

The viral "Pop the Balloon" social game trend on YouTube and TikTok.
