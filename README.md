<div align="center">

<img src="https://img.shields.io/badge/IIT-Chat-6c63ff?style=for-the-badge&logo=googlechat&logoColor=white" alt="IIT Chat"/>

# 💬 IIT Chat

### A blazing-fast, real-time web messaging platform — no app, no cost, no limits.

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-Visit_Now-6c63ff?style=for-the-badge)](https://angadseth.github.io/IITChat)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime_DB-FF6F00?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com/)
[![GitHub Pages](https://img.shields.io/badge/Hosted_on-GitHub_Pages-181717?style=for-the-badge&logo=github&logoColor=white)](https://pages.github.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

</div>

---

## 🧠 Overview

**IIT Chat** is a lightweight, serverless real-time chat application built with pure HTML, CSS, and JavaScript — powered by Firebase Realtime Database and hosted entirely for free on GitHub Pages.

No backend servers. No monthly bills. No app installation. Just open the link and chat.

> Built for IITians, by an IITian. Minimalist. Fast. Always on.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **Secure Auth** | Email + Password login via Firebase Authentication |
| ⚡ **Real-time Messaging** | Messages delivered instantly using Firebase Realtime DB |
| 😊 **Emoji Picker** | 6 categories — Smileys, Love, Hands, Nature, Food, Symbols |
| ❤️ **Reactions** | Tap any message to react with 10 different emojis |
| 🟢 **Presence System** | Live online / offline status for every contact |
| 🎨 **4 Themes** | Dark · Light · Romantic · Neon — switchable anytime |
| 🕐 **Auto Cleanup** | Messages automatically deleted after **3 days** |
| 👤 **Custom Avatars** | Pick from 8 emoji avatars during signup |
| 🔍 **Contact Search** | Instantly filter your friends list |
| 📱 **Responsive** | Works on desktop and mobile browsers |

---

## 🚀 Live Demo

> 🔗 **[https://angadseth.github.io/IITChat](https://angadseth.github.io/IITChat)**

---

## 🛠️ Tech Stack

```
Frontend   →  HTML5 · CSS3 · Vanilla JavaScript (ES Modules)
Backend    →  Firebase Realtime Database (NoSQL)
Auth       →  Firebase Authentication
Hosting    →  GitHub Pages
Fonts      →  Sora (Google Fonts)
Icons      →  Font Awesome 6
```

---

## 📁 Project Structure

```
IITChat/
├── index.html      ── Main UI (Auth screen + Chat layout)
├── style.css       ── All themes, animations & component styles
├── app.js          ── Firebase logic, real-time listeners, chat engine
└── README.md       ── You are here
```

---

## ⚙️ How It Works

```
User opens app
      │
      ▼
Firebase Auth (Email/Password login or signup)
      │
      ▼
Add friends by email → stored in Firebase DB
      │
      ▼
Select contact → Real-time message listener activates
      │
      ▼
Send message → Saved to /chats/{chatId}/messages in Firebase
      │
      ▼
Auto-cleanup runs on login → Deletes messages older than 3 days
```


## 💡 Usage

1. Open the live link
2. **Sign Up** — enter your name, email, password and pick an avatar
3. Click **➕** to add a friend using their email *(they must sign up first)*
4. Select them from the sidebar and start chatting
5. Tap any message to react · Switch themes from ⚙️ Settings

---

## 🔒 Security Notes

- All messages are protected behind Firebase Authentication
- Only authenticated users can read or write data
- Messages are automatically purged after 3 days to minimize data exposure
- No media files are stored — text only

---

## 📊 Firebase Free Tier Limits (Spark Plan)

| Resource | Free Limit |
|---|---|
| Realtime DB Storage | 1 GB |
| Realtime DB Downloads | 10 GB / month |
| Auth Users | Unlimited |
| Hosting | Via GitHub Pages (not Firebase) |

> For a small group of friends, the free tier will last essentially forever.

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

```bash
git checkout -b feature/your-feature
git commit -m "Add your feature"
git push origin feature/your-feature
```

---

## 📄 License

This project is licensed under the **MIT License** — free to use, modify and distribute.

---

<div align="center">

Made with ❤️ and lots of ☕

**[angadseth](https://github.com/angadseth)** · IIT Chat · 2025

</div>
