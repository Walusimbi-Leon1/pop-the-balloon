/**
 * Pop the Balloon — Main Game Logic (v3 — full Firebase state sync)
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
let players = [];
let myData = null;
let currentMode = "chill";
let gamePrompts = [];
let timerInterval = null;
let timeLeft = 30;

// Firebase-synced game state
let firebaseState = null;

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
  if (screens[name]) {
    screens[name].classList.add("active");
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function startApp() {
  els.splashStatus.textContent = "Connecting to Discord...";
  const info = await initDiscord();
  console.log("[App]", info);

  els.splashStatus.textContent = info.isDiscord ? "Connected! 🎉" : "Browser mode — join the fun!";

  await initFirebase(info.channelId);

  els.splashStatus.textContent = "Ready!";

  // Listen for game state changes (ALL tabs)
  listenForGameState();
}

// ── Listen for Game State (master sync) ──────────────────────────────────────
function listenForGameState() {
  onGameStateChange((state) => {
    if (!state) return;
    const prev = firebaseState;
    firebaseState = state;
    console.log("[Sync] State:", state.phase, "| revealIndex:", state.revealIndex, "| voted:", state.votedPlayers ? Object.keys(state.votedPlayers).length : 0);

    handleStateChange(prev, state);
  });
}

function handleStateChange(prev, state) {
  const prevPhase = prev ? prev.phase : null;

  // Phase transitions
  if (state.phase === "lobby" && prevPhase !== "lobby") {
    showScreen("lobby");
    updateLobby();
  } else if (state.phase === "prompt") {
    if (prevPhase !== "prompt") {
      // Entering prompt phase — show game screen
      gamePrompts = state.prompts || PROMPTS.slice(0, 5);
      showScreen("game");
    }
    // Update prompt display
    showPromptFromState(state);
  } else if (state.phase === "results") {
    if (prevPhase !== "results") {
      showResults();
    }
  }

  // Reveal index changed — show next answer card
  if (state.phase === "prompt" && state.revealIndex !== undefined) {
    if (!prev || state.revealIndex !== prev.revealIndex) {
      showAnswerCard(state);
    }
  }

  // Voting complete for current reveal — host advances
  if (state.phase === "prompt" && state.revealIndex !== undefined && isHost()) {
    const votesForCurrent = getVotesForReveal(state, state.revealIndex);
    if (votesForCurrent >= getVotablePlayerCount(state) && !state.advancing) {
      advanceReveal(state);
    }
  }
}

// ── Host check ───────────────────────────────────────────────────────────────
function isHost() {
  return players.length > 0 && players[0].id === playerId;
}

function getVotablePlayerCount(state) {
  // Number of players who can vote (everyone except the revealed player)
  return Math.max(0, players.length - 1);
}

function getVotesForReveal(state, revealIndex) {
  if (!state.votedPlayers) return 0;
  return Object.keys(state.votedPlayers).length;
}

// ── Show Prompt from State ───────────────────────────────────────────────────
function showPromptFromState(state) {
  const idx = state.currentPrompt || 0;
  if (idx >= gamePrompts.length) {
    if (isHost()) setGameState({ ...firebaseState, phase: "results" });
    return;
  }

  const prompt = gamePrompts[idx];
  els.promptText.textContent = prompt;
  els.roundDisplay.textContent = `${idx + 1}/${gamePrompts.length}`;

  // Show answer input
  els.answerInput.classList.remove("hidden");
  els.answerCard.classList.add("hidden");
  els.answerReactions.classList.add("hidden");
  els.answerField.value = "";
  els.answerField.focus();

  updatePlayersBar();

  // Listen for answers
  listenForAnswers(idx);
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
  } else {
    els.startBtn.classList.add("hidden");
  }
}

// ── Start Game (host only) ───────────────────────────────────────────────────
async function startGame() {
  if (!isHost()) return;

  gamePrompts = currentMode === "rapid" ? PROMPTS.slice(0, 10) : PROMPTS.slice(0, 5);

  // Write prompts to Firebase
  for (let i = 0; i < gamePrompts.length; i++) {
    setPrompt(i, gamePrompts[i]);
  }

  // Set initial game state
  setGameState({
    phase: "prompt",
    currentPrompt: 0,
    prompts: gamePrompts,
    revealIndex: -1,
    votedPlayers: {},
  });
}

// ── Listen for Answers ───────────────────────────────────────────────────────
let answersUnsub = null;
function listenForAnswers(promptIndex) {
  if (answersUnsub) answersUnsub();
  answersUnsub = onAnswersUpdate(promptIndex, (answers) => {
    const totalPlayers = players.length;
    console.log(`[Answers] ${answers.length}/${totalPlayers} for prompt ${promptIndex}`);

    // All answers in and host hasn't started reveal yet → start reveal
    if (answers.length >= totalPlayers && isHost() && firebaseState && firebaseState.revealIndex === -1) {
      console.log("[Host] All answers in! Starting reveal...");
      // Shuffle answers for anonymous reveal and store them
      const shuffled = shuffleArray([...answers]);
      setGameState({
        ...firebaseState,
        revealIndex: 0,
        shuffledAnswers: shuffled,
      });
    }
  });
}

// ── Show Answer Card ─────────────────────────────────────────────────────────
function showAnswerCard(state) {
  const revealIdx = state.revealIndex;
  const answers = state.shuffledAnswers || [];

  if (revealIdx < 0 || revealIdx >= answers.length) {
    // All answers revealed — move to next prompt
    if (isHost()) {
      const nextPrompt = (state.currentPrompt || 0) + 1;
      if (nextPrompt >= gamePrompts.length) {
        setGameState({ ...state, phase: "results" });
      } else {
        setGameState({
          ...state,
          currentPrompt: nextPrompt,
          revealIndex: -1,
          votedPlayers: {},
        });
      }
    }
    return;
  }

  const answer = answers[revealIdx];
  const isMyAnswer = answer.playerId === playerId;

  // Hide input, show card
  els.answerInput.classList.add("hidden");
  els.answerCard.classList.remove("hidden");
  els.answerText.textContent = answer.text;

  // Show voting buttons (unless it's your own answer)
  if (isMyAnswer) {
    els.answerReactions.classList.add("hidden");
  } else {
    els.answerReactions.classList.remove("hidden");
    els.keepBtn.classList.remove("voted");
    els.popBtn.classList.remove("voted");
  }

  // Start timer
  startTimer(currentMode === "rapid" ? 10 : 30);
}

// ── Voting ───────────────────────────────────────────────────────────────────
function castVote(vote) {
  if (!firebaseState || firebaseState.phase !== "prompt") return;

  const revealIdx = firebaseState.revealIndex;
  const answers = firebaseState.shuffledAnswers || [];
  if (revealIdx < 0 || revealIdx >= answers.length) return;

  const answer = answers[revealIdx];
  const isMyAnswer = answer.playerId === playerId;
  if (isMyAnswer) return; // Can't vote on own answer

  // Check if already voted
  if (firebaseState.votedPlayers && firebaseState.votedPlayers[playerId]) return;

  // Record vote
  const newVotedPlayers = { ...(firebaseState.votedPlayers || {}), [playerId]: vote };
  submitVote(firebaseState.currentPrompt, answer.playerId, playerId, vote);

  if (vote === "pop") {
    els.popBtn.classList.add("voted");
    els.keepBtn.classList.add("voted");
    showPopAnimation(answer.playerId);
  } else {
    els.keepBtn.classList.add("voted");
    els.popBtn.classList.add("voted");
  }

  // Update state with vote (host will detect and advance)
  if (isHost()) {
    setGameState({
      ...firebaseState,
      votedPlayers: newVotedPlayers,
    });
  }

  // Auto-advance after delay (fallback if host detection is slow)
  setTimeout(() => {
    if (isHost() && firebaseState && firebaseState.phase === "prompt") {
      const nextIdx = (firebaseState.revealIndex || 0) + 1;
      const answers = firebaseState.shuffledAnswers || [];
      if (nextIdx >= answers.length) {
        // All answers revealed for this prompt
        const nextPrompt = (firebaseState.currentPrompt || 0) + 1;
        if (nextPrompt >= gamePrompts.length) {
          setGameState({ ...firebaseState, phase: "results" });
        } else {
          setGameState({
            ...firebaseState,
            currentPrompt: nextPrompt,
            revealIndex: -1,
            votedPlayers: {},
          });
        }
      } else {
        setGameState({
          ...firebaseState,
          revealIndex: nextIdx,
          votedPlayers: {},
        });
      }
    }
  }, 2000);
}

function advanceReveal(state) {
  const nextIdx = (state.revealIndex || 0) + 1;
  const answers = state.shuffledAnswers || [];

  if (nextIdx >= answers.length) {
    // All answers revealed for this prompt
    const nextPrompt = (state.currentPrompt || 0) + 1;
    if (nextPrompt >= gamePrompts.length) {
      setGameState({ ...state, phase: "results", advancing: false });
    } else {
      setGameState({
        ...state,
        currentPrompt: nextPrompt,
        revealIndex: -1,
        votedPlayers: {},
        advancing: false,
      });
    }
  } else {
    setGameState({
      ...state,
      revealIndex: nextIdx,
      votedPlayers: {},
      advancing: false,
    });
  }
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
      // Auto-advance (host advances, others follow via Firebase)
      if (isHost() && firebaseState && firebaseState.phase === "prompt") {
        const nextIdx = (firebaseState.revealIndex || 0) + 1;
        const answers = firebaseState.shuffledAnswers || [];
        if (nextIdx >= answers.length) {
          const nextPrompt = (firebaseState.currentPrompt || 0) + 1;
          if (nextPrompt >= gamePrompts.length) {
            setGameState({ ...firebaseState, phase: "results" });
          } else {
            setGameState({
              ...firebaseState,
              currentPrompt: nextPrompt,
              revealIndex: -1,
              votedPlayers: {},
            });
          }
        } else {
          setGameState({
            ...firebaseState,
            revealIndex: nextIdx,
            votedPlayers: {},
          });
        }
      }
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
  clearInterval(timerInterval);
  if (answersUnsub) { answersUnsub(); answersUnsub = null; }
  showScreen("results");

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

async function submitMyAnswer() {
  const text = els.answerField.value.trim();
  if (!text) return;

  submitAnswer(firebaseState.currentPrompt, playerId, text);
  els.answerInput.classList.add("hidden");
}

// Voting
els.keepBtn.addEventListener("click", () => castVote("keep"));
els.popBtn.addEventListener("click", () => castVote("pop"));

// Play again
els.playAgainBtn.addEventListener("click", () => {
  if (isHost()) {
    setGameState({ phase: "lobby" });
  }
  clearInterval(timerInterval);
  if (answersUnsub) { answersUnsub(); answersUnsub = null; }
  showScreen("lobby");
  updateLobby();
});

// Cleanup
window.addEventListener("beforeunload", () => {
  leaveRoom(playerId);
});

// ── Start ────────────────────────────────────────────────────────────────────
startApp();
