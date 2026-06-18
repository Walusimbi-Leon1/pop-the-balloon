# 🎈 Pop the Balloon — Game Design Document

## Concept

A social matching game inspired by the viral "Pop the Balloon" trend. Players hold balloons and interact through prompts/questions. At any point, someone can pop your balloon — meaning they're not interested. If your balloon survives, you've found a match!

**Tagline:** *"Hold your balloon. Find your match. Don't get popped."*

## Core Gameplay

### Round Flow

1. **Join Phase** — Players enter a room (max 12). Each gets a balloon with a random color.
2. **Prompt Phase** — A prompt appears (e.g., "What's your dream vacation?"). Players submit anonymous answers.
3. **Reveal Phase** — Answers are shown one by one (shuffled, anonymous). After each reveal, other players vote: 💚 Keep or 🔴 Pop.
4. **Results** — Players with unpopped balloons are "matches." They see each other's profiles.

### The Balloon

- Each player has ONE balloon
- Color is assigned randomly (rainbow palette)
- Balloon has the player's chosen display name on it
- When popped: dramatic pop animation, balloon disappears, player is "out"
- When kept: balloon glows briefly, player survives another round

### Voting Mechanics

- After each answer reveal, all other players simultaneously vote
- **💚 Keep** = "I'm interested, don't pop"
- **🔴 Pop** = "Not for me" → balloon pops
- Votes are anonymous until the reveal
- If 50%+ vote Pop, the balloon pops
- If majority Keep, the balloon survives

### Matching

- After all prompts are answered, surviving players are matched
- They see each other's Discord username/avatar
- Can continue chatting in a private thread or DM

## Prompts (Examples)

- "What's your dream vacation?"
- "What's your most controversial food opinion?"
- "Describe your perfect Sunday"
- "What's the last thing you searched on Google?"
- "What's your hidden talent?"
- "If you could have dinner with anyone, who?"
- "What's your biggest red flag?"
- "What song is stuck in your head right now?"

## Game Modes

### 🔵 Chill Mode (Default)
- 4-8 prompts
- Casual, no timer pressure
- Perfect for voice chat hangouts

### 🔴 Rapid Fire
- 10+ quick prompts
- 10-second timer per answer
- Fast-paced, more pops

### 🟡 Blind Round
- No names shown on balloons
- Pure personality-based matching
- Names revealed only at the end

## Technical Architecture

### Stack
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Backend:** Firebase Realtime Database (same as Pop Party)
- **Auth:** Discord Embedded App SDK (in Discord) / anonymous (browser)
- **Hosting:** Cloudflare Pages

### Firebase Structure
```
rooms/
  {roomId}/
    players/
      {playerId}/
        name: string
        balloonColor: string
        avatar: string
        online: boolean
        popped: boolean
        score: number
    prompts/
      {promptId}/
        text: string
        answers/
          {playerId}/
            text: string
            revealed: boolean
    state/
      phase: "lobby" | "prompt" | "reveal" | "results"
      currentPrompt: number
      currentAnswer: number
      timer: number
    matches/
      {playerId1}_{playerId2}: true
```

### Discord Integration
- Uses Discord Embedded App SDK for identity
- Shows in Discord Activity panel
- Max 12 participants per room
- Voice chat integration (players talk while playing)

## UI Design

### Lobby Screen
- Animated balloons floating up
- "Waiting for players..." with player count
- Balloon color preview for each joined player
- "Start Game" button (host only)

### Game Screen
- Center: Large balloon with current answer
- Left: Your balloon (always visible)
- Right: Score/status panel
- Bottom: Keep/Pop voting buttons
- Top: Round counter, timer

### Pop Animation
- Balloon shrinks + shakes
- "POP!" text explosion
- Confetti particles
- Sound effect (pop sound)

### Results Screen
- Matched balloons float together
- Player profiles revealed
- "Play Again" button

## Assets Needed

- Balloon SVGs (multiple colors)
- Pop animation sprites
- Background gradient
- Sound effects (pop, match, whoosh)
- Confetti particle system
