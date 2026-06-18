/**
 * Pop the Balloon — Main Game Logic
 */

import { initDiscord, playerName, playerId, playerAvatar, isDiscord, channelId } from "./discord.js";
import { initFirebase, joinRoom, setGameState, onGameStateChange, setPrompt, submitAnswer, onAnswersUpdate, submitVote, onVotesUpdate, popPlayer, leaveRoom } from "./firebase.js";

// ── Prompts ──────────────────────────────────────────────────────────────────
const PROMPTS = [
  "What's your dream vacation? 🌴",
  "What's your most controversial food opinion? 🍕",
  "Describe your perfect Sunday ☀️",
  "What's the last thing you Googled? 🔍",
  "What's your hidden talent? 🎭",
  "If you could have dinner with anyone, who? 🍽️",
  "What's your biggest red flag? 🚩",
  "What song is stuck in your head? 🎵",
  "What's a hill you'll die on? ⛰️",
  "What's the best advice you've ever received? 💡",
];

// ── State ────────────────────────────────────────────────────────────────────
let gamePhase = "splash"; // splash | lobby | prompt | voting | results
let players = [];
let myData = null;
let currentMode = "chill";
let currentPromptIndex = 0;
let currentAnswerIndex = 0;
let answersForCurrentPrompt = [];
let myVote = null;
let timerInterval = null;
let timeLeft = 30;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const screens = {
  splash: $("#splash"),
  lobby: $("#lobby"),
  game: $("#gameScreen"),
  results: $("#results"),
};
const els = {
  splashStatus: $("#splashStatus"),
  playBtn: $("#playBtn"),
  balloonRack: $("#balloonRack"),
  lobbyCount: $("#lobbyCount"),
  startBtn: $("#startBtn"),
  lobbyStatus: $("#lobbyStatus"),
  roundDisplay: $("#roundDisplay"),
  promptText: $("#promptText"),
  timerDisplay: $("#timerDisplay"),
  answerCard: $("#answerCard"),
  answerText: $("#answerText"),
  answerReactions: $("#answerReactions"),
  keepBtn: $("#keepBtn"),
  popBtn: $("#popBtn"),
  answerInput: $("#answerInput"),
  answerField: $("#answerField"),
  submitAnswer: $("#submitAnswer"),
  playersBar: $("#playersBar"),
  myBalloonShape: $("#myBalloonShape"),
  myBalloonName: $("#myBalloonName"),
  popOverlay: $("#popOverlay"),
  matchedBalloons: $("#matchedBalloons"),
  resultText: $("#resultText"),
  playAgainBtn: $("#playAgainBtn"),
};

// ── Screen Management ────────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
  gamePhase = name;
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function startApp() {
  els.splashStatus.textContent = "Connecting to Discord...";
  const info = await initDiscord();
  console.log("[App]", info);

  els.splashStatus.textContent = info.isDiscord ? "Connected! 🎉" : "Browser mode — join the fun!";

  await initFirebase(info.channelId);

  els.splashStatus.textContent = "Ready!";
}

// ── Join Game ────────────────────────────────────────────────────────────────
async function joinGame() {
  showScreen("lobby");

  myData = joinRoom(playerId, playerName, playerAvatar, (updatedPlayers) => {
    players = updatedPlayers;
    updateLobby();
  });

  updateLobby();
}

function updateLobby() {
  els.lobbyCount.textContent = players.length;

  // Render balloon rack
  els.balloonRack.innerHTML = players.map(p => `
    <div class="balloon-slot">
      <div class="mini-balloon" style="background: ${p.balloonColor}"></div>
      <span class="mini-balloon-name">${escapeHtml(p.name)}</span>
    </div>
  `).join("");

  // Show start button if host (first player)
  if (players.length > 0 && players[0].id === playerId) {
    els.startBtn.classList.remove("hidden");
  }
}

// ── Start Game ───────────────────────────────────────────────────────────────
async function startGame() {
  const promptsForMode = currentMode === "rapid" ? PROMPTS.slice(0, 10) : PROMPTS.slice(0, 5);

  setGameState({
    phase: "prompt",
    currentPrompt: 0,
    prompts: promptsForMode,
    currentAnswer: 0,
    totalAnswers: players.length,
  });

  showScreen("game");
  showPrompt(0, promptsForMode);
}

function showPrompt(index, prompts) {
  if (index >= prompts.length) {
    showResults();
    return;
  }

  currentPromptIndex = index;
  currentAnswerIndex = 0;
  myVote = null;

  const prompt = prompts[index];
  els.promptText.textContent = prompt;
  els.roundDisplay.textContent = `${index + 1}/${prompts.length}`;

  // Show answer input
  els.answerInput.classList.remove("hidden");
  els.answerCard.classList.add("hidden");
  els.answerReactions.classList.add("hidden");
  els.answerField.value = "";
  els.answerField.focus();

  // Update players bar
  updatePlayersBar();
}

// ── Submit Answer ────────────────────────────────────────────────────────────
async function submitMyAnswer() {
  const text = els.answerField.value.trim();
  if (!text) return;

  submitAnswer(currentPromptIndex, playerId, text);
  els.answerInput.classList.add("hidden");

  // Wait for all answers, then start reveal
  onAnswersUpdate(currentPromptIndex, (answers) => {
    answersForCurrentPrompt = answers;
    if (answers.length >= players.length) {
      startReveal();
    }
  });
}

function startReveal() {
  // Shuffle answers
  answersForCurrentPrompt = shuffleArray([...answersForCurrentPrompt]);
  currentAnswerIndex = 0;
  revealNextAnswer();
}

function revealNextAnswer() {
  if (currentAnswerIndex >= answersForCurrentPrompt.length) {
    // All answers revealed, move to next prompt
    showPrompt(currentPromptIndex + 1, PROMPTS);
    return;
  }

  const answer = answersForCurrentPrompt[currentAnswerIndex];
  const isMyAnswer = answer.playerId === playerId;

  // Show the answer card
  els.answerCard.classList.remove("hidden");
  els.answerText.textContent = answer.text;

  // Show voting buttons (unless it's your own answer)
  if (isMyAnswer) {
    els.answerReactions.classList.add("hidden");
  } else {
    els.answerReactions.classList.remove("hidden");
    els.keepBtn.classList.remove("voted");
    els.popBtn.classList.remove("voted");
    myVote = null;
  }

  // Start timer for voting
  startTimer(currentMode === "rapid" ? 10 : 30);
}

// ── Voting ───────────────────────────────────────────────────────────────────
function castVote(vote) {
  if (myVote) return;
  myVote = vote;

  const answer = answersForCurrentPrompt[currentAnswerIndex];
  submitVote(currentPromptIndex, answer.playerId, playerId, vote);

  if (vote === "pop") {
    els.popBtn.classList.add("voted");
    els.keepBtn.classList.add("voted");
    showPopAnimation(answer.playerId);
  } else {
    els.keepBtn.classList.add("voted");
    els.popBtn.classList.add("voted");
  }

  // Wait a moment then show next answer
  setTimeout(() => {
    currentAnswerIndex++;
    revealNextAnswer();
  }, 1500);
}

function showPopAnimation(targetPlayerId) {
  popPlayer(targetPlayerId);

  els.popOverlay.classList.remove("hidden");
  setTimeout(() => {
    els.popOverlay.classList.add("hidden");
  }, 800);

  // Update player dot
  const dot = document.querySelector(`[data-player="${targetPlayerId}"]`);
  if (dot) dot.classList.add("popped");
}

// ── Timer ────────────────────────────────────────────────────────────────────
function startTimer(seconds) {
  clearInterval(timerInterval);
  timeLeft = seconds;
  els.timerDisplay.textContent = timeLeft + "s";
  els.timerDisplay.classList.remove("urgent");

  timerInterval = setInterval(() => {
    timeLeft--;
    els.timerDisplay.textContent = timeLeft + "s";

    if (timeLeft <= 5) {
      els.timerDisplay.classList.add("urgent");
    }

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      // Auto-advance
      currentAnswerIndex++;
      revealNextAnswer();
    }
  }, 1000);
}

// ── Players Bar ──────────────────────────────────────────────────────────────
function updatePlayersBar() {
  els.playersBar.innerHTML = players.map(p => `
    <div class="player-dot ${p.popped ? 'popped' : ''} ${p.id === playerId ? 'current' : ''}"
         data-player="${p.id}"
         style="background: ${p.balloonColor}">
      ${p.name.charAt(0).toUpperCase()}
    </div>
  `).join("");
}

// ── Results ──────────────────────────────────────────────────────────────────
function showResults() {
  showScreen("results");
  clearInterval(timerInterval);

  const survivors = players.filter(p => !p.popped);
  const popped = players.filter(p => p.popped);

  els.resultText.textContent = survivors.length > 0
    ? `${survivors.length} balloon${survivors.length > 1 ? 's' : ''} survived! 🎈`
    : "All balloons popped! Better luck next time! 💥";

  els.matchedBalloons.innerHTML = survivors.map(p => `
    <div class="matched-player">
      ${p.avatar
        ? `<img class="match-avatar" src="${p.avatar}" alt="${escapeHtml(p.name)}">`
        : `<div class="match-avatar" style="background: ${p.balloonColor}; display: flex; align-items: center; justify-content: center; font-size: 24px;">🎈</div>`
      }
      <span class="match-name">${escapeHtml(p.name)}</span>
    </div>
  `).join("");

  if (survivors.length > 0) {
    launchConfetti();
  }
}

// ── Confetti ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const canvas = $("#confettiCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = [];
  const colors = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4ecdc4", "#a855f7", "#f472b6"];

  for (let i = 0; i < 80; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 100,
      w: 8 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 3,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.2,
    });
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      p.vy += 0.05;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Event Listeners ──────────────────────────────────────────────────────────
// Mode selection
document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentMode = btn.dataset.mode;
  });
});

// Play button
els.playBtn.addEventListener("click", joinGame);

// Start game (host)
els.startBtn.addEventListener("click", startGame);

// Submit answer
els.submitAnswer.addEventListener("click", submitMyAnswer);
els.answerField.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitMyAnswer();
});

// Voting
els.keepBtn.addEventListener("click", () => castVote("keep"));
els.popBtn.addEventListener("click", () => castVote("pop"));

// Play again
els.playAgainBtn.addEventListener("click", () => {
  showScreen("lobby");
  updateLobby();
});

// Cleanup
window.addEventListener("beforeunload", () => {
  leaveRoom(playerId);
});

// ── Start ────────────────────────────────────────────────────────────────────
startApp();
