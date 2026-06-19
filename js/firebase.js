/**
 * Pop the Balloon — Firebase Realtime Database
 * Real-time sync for players, prompts, votes, and matches.
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSy…tGcQ",
  authDomain: "pop-party-1.firebaseapp.com",
  databaseURL: "https://pop-party-1-default-rtdb.firebaseio.com",
  projectId: "pop-party-1",
  storageBucket: "pop-party-1.firebasestorage.app",
  messagingSenderId: "370649982813",
  appId: "1:370649982813:web:42aad8ff883ff0886c6ab4",
  measurementId: "G-8J0YDNLKP7"
};

let db = null;
let dbMod = null;
let currentRoomId = "lobby";
let unsubscribers = [];

function roomPath(suffix) {
  return "ptb/rooms/" + currentRoomId + "/" + suffix;
}

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initFirebase(channelId) {
  const appMod = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js");
  dbMod = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js");

  const app = appMod.initializeApp(FIREBASE_CONFIG, "pop-the-balloon");
  db = dbMod.getDatabase(app);
  currentRoomId = channelId.replace(/[^a-zA-Z0-9_-]/g, "") || "lobby";

  console.log("[Firebase] Connected. Room:", currentRoomId);
  return { db, currentRoomId };
}

// ── Players ──────────────────────────────────────────────────────────────────
export function joinRoom(playerId, playerName, playerAvatar, onPlayersUpdate) {
  if (!db || !dbMod) return;

  // Clean up stale players (offline for >5 min)
  const allRef = dbMod.ref(db, roomPath("players"));
  dbMod.get(allRef).then((snap) => {
    const raw = snap.val();
    if (!raw) return;
    const now = Date.now();
    Object.entries(raw).forEach(([key, p]) => {
      if (!p || key === "undefined" || (p.lastActive && now - p.lastActive > 300000)) {
        console.log("[Firebase] Cleaning stale player:", key);
        dbMod.remove(dbMod.ref(db, roomPath("players/" + key)));
      }
    });
  }).catch(() => {});

  const data = {
    id: playerId,
    name: playerName,
    avatar: playerAvatar || "",
    balloonColor: randomBalloonColor(),
    joinedAt: Date.now(),
    lastActive: Date.now(),
    online: true,
    popped: false,
    score: 0,
  };

  // Use update instead of set to avoid overwriting with undefined
  const pRef = dbMod.ref(db, roomPath("players/" + playerId));
  dbMod.update(pRef, data);

  const allRef2 = dbMod.ref(db, roomPath("players"));
  const unsub = dbMod.onValue(allRef2, (snap) => {
    const raw = snap.val();
    const list = raw ? Object.values(raw).filter(p => p && p.online && p.id) : [];
    onPlayersUpdate(list);
  });
  unsubscribers.push(unsub);

  // Heartbeat: update lastActive every 30s
  const heartbeatInterval = setInterval(() => {
    if (!db || !dbMod) { clearInterval(heartbeatInterval); return; }
    dbMod.update(pRef, { lastActive: Date.now() }).catch(() => {});
  }, 30000);
  unsubscribers.push(() => clearInterval(heartbeatInterval));

  return data;
}

// ── Game State ───────────────────────────────────────────────────────────────
export function setGameState(state) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("state"));
  dbMod.set(ref, state);
}

export function onGameStateChange(callback) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("state"));
  const unsub = dbMod.onValue(ref, (snap) => {
    callback(snap.val());
  });
  unsubscribers.push(unsub);
}

// ── Prompts ──────────────────────────────────────────────────────────────────
export function setPrompt(promptId, text) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("prompts/" + promptId));
  dbMod.set(ref, { text, answers: {} });
}

export function submitAnswer(promptId, playerId, answerText) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("prompts/" + promptId + "/answers/" + playerId));
  dbMod.set(ref, { text: answerText, revealed: false });
}

export function onAnswersUpdate(promptId, callback) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("prompts/" + promptId + "/answers"));
  const unsub = dbMod.onValue(ref, (snap) => {
    const raw = snap.val();
    const answers = raw ? Object.entries(raw).map(([playerId, data]) => ({
      playerId,
      text: data.text || "",
      revealed: data.revealed || false,
    })) : [];
    callback(answers);
  });
  unsubscribers.push(unsub);
}

// ── Votes ────────────────────────────────────────────────────────────────────
export function submitVote(promptId, answerOwnerId, voterId, vote) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("prompts/" + promptId + "/votes/" + answerOwnerId + "/" + voterId));
  dbMod.set(ref, vote); // "keep" or "pop"
}

export function onVotesUpdate(promptId, answerOwnerId, callback) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("prompts/" + promptId + "/votes/" + answerOwnerId));
  const unsub = dbMod.onValue(ref, (snap) => {
    const raw = snap.val();
    callback(raw || {});
  });
  unsubscribers.push(unsub);
}

// ── Pop a Player ─────────────────────────────────────────────────────────────
export function popPlayer(playerId) {
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("players/" + playerId + "/popped"));
  dbMod.set(ref, true);
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
export function leaveRoom(playerId) {
  unsubscribers.forEach(fn => fn());
  unsubscribers = [];
  if (!db || !dbMod) return;
  const ref = dbMod.ref(db, roomPath("players/" + playerId));
  dbMod.update(ref, { online: false, lastActive: Date.now() });
  setTimeout(() => dbMod.remove(ref), 30000);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const BALLOON_COLORS = [
  "#ff6b6b", "#ffd93d", "#6bcb77", "#4ecdc4",
  "#a855f7", "#f472b6", "#fb923c", "#38bdf8",
  "#fbbf24", "#34d399", "#f87171", "#818cf8",
];

function randomBalloonColor() {
  return BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)];
}
