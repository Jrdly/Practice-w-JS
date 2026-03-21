# Tile-Tactics Game Development Context

**Project Name:** Tile-Tactics Game (inspired by Teen Titans Go: Titans Most Wanted)

**Tech Stack:** Phaser 3.80.1 (HTML5 game engine), Vanilla JavaScript, CSS3, localStorage

**Repository:** Practice-w-JS (main branch)

---

## 1. Game Overview & Design Goals

### Core Concept
A turn-based tile-tactics indie game where the player controls a single character navigating through a 10-level campaign against increasingly difficult enemies. The game features:
- Grid-based movement (5 rows × 10 columns)
- Weighted pathfinding (orthogonal moves cost 1, diagonal costs 2)
- Turn-based combat with cooldown-gated abilities
- Character progression through XP and level-ups
- Persistent character stats saved between levels
- Ability unlocks and stat upgrades through level-up choices

### Design Philosophy
- Turn-based (not real-time) for tactical decision-making
- Manageable complexity at start (single character, 2 enemy types) that expands through levels
- Clean, beginner-friendly code avoiding over-engineering
- Data-driven architecture (characters, enemies, levels as JSON-like structures)

---

## 2. Gameplay Mechanics

### Grid & Movement
- **Grid Size:** 5 rows × 10 columns
- **Tile Size:** 64 pixels
- **Movement Cost Model:**
  - Orthogonal (up/down/left/right): 1 tile cost
  - Diagonal: 2 tile cost
- **Pathfinding:** Dijkstra-based weighted algorithm ensuring optimal paths within character's movement budget
- **Character Movement Budgets:**
  - Balanced archetype: 3 tiles per turn
  - Tank archetype: 3 tiles per turn
  - Area Control archetype: 2 tiles per turn

### Turn Structure
1. Player chooses action: **Move** or **Use Ability**
2. Action resolves (damage applied if attack, position updates if move)
3. Cooldown counters decrement for all abilities (except the one just used)
4. All enemy turns execute in sequence:
   - Melee enemies: Pathfind toward player, attack if adjacent
   - Ranged enemies: Attack if in range (up to 4 tiles), otherwise pathfind closer
5. HUD updates with new stats/cooldowns

### Combat System

#### Attack Types
- **Basic Attack:** 0 cooldown (always available), orthogonal adjacency only
- **Special1:** 1 turn cooldown, varies by character
- **Special2:** 2 turn cooldown, varies by character
- **Ultimate:** 3 turn cooldown, powerful effect

#### Range Validation
- **Melee abilities (Basic):** Require exact orthogonal adjacency (distance = 1)
  - Diagonal neighbors (distance = 2 in tile space) do NOT qualify
- **Ranged abilities:** Work up to specified tile distance (e.g., Special1 = 4 tiles)

#### Damage Formula
- Base Damage = (attacker_attack - defender_defense) + randomness
- XP Gain = damage_dealt_this_turn
- Kill Bonus: Enemy type dependent (Melee = 20 XP, Ranged = 25 XP)

### Win/Loss Conditions
- **Victory:** All enemies defeated (HP ≤ 0)
- **Defeat:** Player HP ≤ 0
- **Terminal States:** After victory or defeat, level-up modal appears (if player leveled during combat)

---

## 3. Progression & Character Systems

### XP & Leveling
- **Scaling Thresholds:** [100, 150, 225, 340] XP required for levels 1→2, 2→3, 3→4, 4→5
- **Level-Up Choices:** Player must choose each level-up:
  1. **+10% Max HP:** Increases max HP by 10%, heals to new max
  2. **Unlock Next Ability:** If locked abilities remain, unlock the next one in sequence

### Ability Unlock Sequence
All characters learn abilities in this order: **Basic → Special1 → Special2 → Ultimate**
- Basic is always unlocked at start
- Subsequent abilities unlock through level-ups (one per level-up if available)
- Once all 4 are unlocked, level-up choices are HP-only

### Character Archetypes

#### Balanced (Currently Implemented)
- Max HP: 120
- Attack: 20
- Defense: 7
- Movement Budget: 3
- Starter Abilities: Basic (0 CD)
- Special1-4: Defined in abilityDefs object (ranges vary)

#### Tank (Config Ready, Not Wired)
- Max HP: ~150 (higher survivability)
- Attack: ~15 (lower damage)
- Defense: ~10 (higher mitigation)
- Movement Budget: 3 (normal speed)
- Purpose: Soak damage, tank encounters

#### Area Control (Config Ready, Not Wired)
- Max HP: ~100 (lighter)
- Attack: ~22 (high damage)
- Defense: ~5 (fragile)
- Movement Budget: 2 (restricted mobility)
- Purpose: High damage, area effects, tactical positioning

### Save System
- **Save Location:** localStorage with key `tile_tactics_autosave_v1`
- **Saved Data:** Player character object (level, XP, HP, abilities, ability cooldowns, stats)
- **Not Saved:** Current level/match state (always start fresh when loading)
- **Trigger:** Auto-save after level victory, or manual "Clear Save" button

---

## 4. Codebase Structure

### File Layout
```
/workspaces/Practice-w-JS/
├── index.html          (50 lines) - UI structure, Phaser canvas, modals
├── style..css          (100+ lines) - Dark theme, layout, button states
├── script.js           (~950 lines) - Core game engine
└── GAME_DEVELOPMENT_CONTEXT.md (this file)
```

### script.js Core Functions

#### Game Loop & State
- `setupNewRun()` - Initialize new run from saved data or fresh character
- `resetLevelState({ healToFull })` - Reset enemies, cooldowns, position for restart/new level
- `restartCurrentLevel()` - Full level restart with HP restoration

#### Movement & Pathfinding
- `getReachableTiles(startRow, startCol, budget)` - Dijkstra weighted pathfinding; returns map of reachable tile keys
- `resolvePlayerMove(toRow, toCol)` - Validate reachable tile, update position, decrement cooldowns, trigger enemy turn

#### Combat
- `resolvePlayerAttack(enemy)` - Validate ability unlock/cooldown/range; apply damage; gain XP; check victory
- `runEnemyTurn()` - Execute all alive enemy turns (melee pathfinding+attack, ranged attack-if-in-range); check defeat

#### Progression
- `maybeHandleLevelUp()` - Accumulate XP; increment level counter; queue pending level-ups (does NOT show modal)
- `maybeShowPostMatchLevelUps()` - **Gated modal display** - Only shows level-up modal after victory/defeat
- `closeLevelUpModal()` - Process upgrade choice; loop if `pendingLevelUps > 1`

#### UI
- `renderHud()` - Display stats, abilities, cooldowns; disable buttons based on state
- `showLevelUpModal()` - Display level-up choice modal
- Message logging via `addMessage(text)`

### Data Structures

#### Global Game State
```javascript
const gameState = {
  player: {           // Current character stats
    level, xp, maxHp, hp, attack, defense,
    abilities: {basic, special1, special2, ultimate},
    cooldowns: {basic, special1, special2, ultimate},
    row, col           // Grid position
  },
  enemies: [],        // Array of {type, hp, maxHp, row, col, ...}
  canAct: true,       // Input acceptance gate
  gameOver: false,    // Terminal state
  victory: false,     // Terminal state
  pendingLevelUps: 0  // Queue for deferred modals
};
```

#### Ability Definitions
```javascript
const abilityDefs = {
  basic: { rangeType: 'melee', cooldown: 0, power: 1.0 },
  special1: { rangeType: 'ranged', range: 4, cooldown: 1, power: 1.2 },
  special2: { rangeType: 'ranged', range: 3, cooldown: 2, power: 1.4 },
  ultimate: { rangeType: 'ranged', range: 5, cooldown: 3, power: 2.0 }
};
```

#### Enemy Types
```javascript
const enemyTypes = {
  Melee: { maxHp: 70, attack: 14, defense: 4, range: 1, killXp: 20 },
  Ranged: { maxHp: 55, attack: 16, defense: 3, range: 3, killXp: 25 }
};
```

#### Level Definition (Current: Level 1 Only)
```javascript
const level1 = [
  { type: 'Melee', row: 1, col: 6 },
  { type: 'Ranged', row: 3, col: 8 }
];
```

#### Base Character
```javascript
const baseCharacter = {
  level: 0, xp: 0, maxHp: 120, hp: 120, attack: 20, defense: 7,
  abilities: { basic: true, special1: false, special2: false, ultimate: false },
  cooldowns: { basic: 0, special1: 0, special2: 0, ultimate: 0 },
  row: 2, col: 1
};
```

### Key Recent Fixes (Applied in Last Session)

#### Bug #1: Level-Up Modal During Combat
- **Problem:** Modal appeared when XP threshold crossed mid-combat, allowing upgrades mid-match
- **Root Cause:** `maybeHandleLevelUp()` directly called `showLevelUpModal()`
- **Solution:** Separated logic into two functions:
  - `maybeHandleLevelUp()` now only accumulates XP and queues pending level-ups
  - `maybeShowPostMatchLevelUps()` gates modal display until `gameState.gameOver || gameState.victory`
  - Victory/defeat paths now call `maybeShowPostMatchLevelUps()` to unblock modal after terminal state

#### Bug #2: Restart Button Didn't Restore Full HP
- **Problem:** Restarting level kept player damaged from previous attempt
- **Root Cause:** `setupNewRun()` loaded character state but didn't reset HP to max
- **Solution:** Created new `resetLevelState({ healToFull })` function:
  - If `healToFull: true`, restores player HP to maxHp
  - Restart button now calls `restartCurrentLevel()` which calls `resetLevelState({ healToFull: true })`
  - New level loads call `resetLevelState({ healToFull: false })` to preserve HP across levels

---

## 5. Current Status

### Completed ✅
- Full Phaser 3 engine setup with 5×10 tile grid rendering (64px tiles)
- Weighted Dijkstra pathfinding with correct orthogonal (cost 1) and diagonal (cost 2) distance model
- Turn-based action system with cooldown decrement logic
- Character base stats and ability unlock sequencing (basic → special1 → special2 → ultimate)
- Melee/ranged attack type validation with range checking
- XP gain formula: damage dealt + kill bonuses with scaling level thresholds
- Ability unlock choices: +10% HP vs. unlock next ability
- Single autosave system to localStorage
- Enemy AI with pathfinding and combat logic
- Victory/defeat conditions with game-over state management
- Level-up modal deferred until match end (BUG FIX)
- Restart button fully heals player (BUG FIX)

### Partially Complete 🟨
- **Character Roster:** Only Balanced archetype fully implemented; Tank and Area Control configs prepared but not wired into story or character selection
- **Level Design:** Only Level 1 exists (2 enemies); Levels 2-10 scaffolded in plan but not built
- **Data Architecture:** All definitions inline in script.js; not yet extracted to JSON files

### Not Started ❌
- Levels 2-10 with progressive difficulty scaling
- Enemy composition curves (more enemies, harder types, mini-bosses)
- Mini-boss encounters on Levels 3, 6, 9
- Final Level 10 gauntlet + final boss fight
- Tank and Area Control character implementations + story-based character assignment
- External JSON config files (characters.json, enemies.json, levels.json) for extensibility
- GitHub Pages deployment pipeline
- Pixel art assets (currently using placeholder circles)

---

## 6. Technical Decisions & Architecture

### Movement Cost Model Rationale
- Orthogonal = 1 tile: Cardinal directions are primary movement paths
- Diagonal = 2 tiles: Diagonal movement is a "shortcut" but uses 2x resource
- This creates tactical decision points: do you move twice orthogonally or once diagonally?

### Cooldown System Design
- Cooldowns decrement AFTER action, except for the ability just used
- Example: Turn 1 use Special1 (CD=1) → cooldown set to 1, not decremented yet
  - Turn 2: Special1 CD decrements to 0, becomes available again
  - Turn 3: Available immediately (CD was already 0)
- This ensures 1 turn minimum between ability uses

### Single-Character Focus
- Only one player character on grid at a time
- Simplifies AI, pathfinding, and UI
- Supports future "squad mode" if needed, but keeps v1 scope focused

### Save Granularity
- Saves character state only (not match state)
- Allows resuming campaign after browser close
- Player always starts fresh on each level (no mid-combat saves)

---

## 7. How to Continue Development

### Immediate Next Steps (Recommended Order)

#### Phase 1: Expand Level Roster
1. Duplicate `level1` definition for levels 2-10
2. Progressively add more enemies and harder types:
   - Level 2: 3 enemies (1 Melee, 2 Ranged)
   - Level 3: 4 enemies (2 Melee, 2 Ranged) + mini-boss intro
   - Continue scaling up
3. Test each level for balance and difficulty curve
4. Create `buildLevelEnemies()` to dynamically populate based on levelNumber

#### Phase 2: Implement Character Variants
1. Wire character selection into `setupNewRun()` (add UI to choose Balanced/Tank/Area Control)
2. Implement Tank stats and special abilities
3. Implement Area Control stats and special abilities
4. Test balance across character types

#### Phase 3: Boss Encounters
1. Define mini-boss enemy type (higher HP, scaled attack/defense)
2. Create boss encounter on Levels 3, 6, 9
3. Define final boss for Level 10 with special mechanics
4. Test difficulty tuning

#### Phase 4: Extract to JSON
1. Create `characters.json` with archetype definitions
2. Create `enemies.json` with enemy type templates
3. Create `levels.json` with per-level enemy rosters
4. Update loader functions to parse JSON instead of inline objects

#### Phase 5: Deployment
1. Set up GitHub Pages or similar hosting
2. Test on multiple browsers
3. Gather balance feedback and iterate

### Important Code Patterns

#### To Add a New Level
```javascript
const levelN = [
  { type: 'Melee', row: 1, col: 2 },
  { type: 'Ranged', row: 3, col: 8 },
  // ... more enemies
];

// In setupNewRun or level loader:
const currentLevel = getCurrentLevel(gameState.currentLevelNumber);
gameState.enemies = currentLevel.map(enemyConfig => ({
  ...enemyTypes[enemyConfig.type],
  row: enemyConfig.row,
  col: enemyConfig.col,
  hp: enemyTypes[enemyConfig.type].maxHp
}));
```

#### To Add a New Character Archetype
```javascript
const tankCharacter = {
  level: 0, xp: 0, maxHp: 150, hp: 150, attack: 15, defense: 10,
  abilities: { basic: true, special1: false, special2: false, ultimate: false },
  cooldowns: { basic: 0, special1: 0, special2: 0, ultimate: 0 },
  row: 2, col: 1,
  moveBudget: 3,
  archetype: 'Tank'
};

// Pass as parameter: setupNewRun(false, tankCharacter)
```

#### To Modify Difficulty
- **Easier:** Reduce enemy count, lower enemy stats (attack/defense), increase player stats
- **Harder:** Add more enemies, increase enemy stats, add mini-boss types, reduce player movement budget

---

## 8. Testing & Validation Checklist

### Core Mechanics
- [ ] Movement pathfinding finds shortest path within budget
- [ ] Diagonal moves cost 2x orthogonal
- [ ] Can't move to unreachable tiles
- [ ] Melee attack only works on orthogonal neighbors (not diagonal)
- [ ] Cooldowns decrement after action (except used ability)
- [ ] XP gain = damage dealt + kill bonus
- [ ] Ability unlock happens in order: basic → special1 → special2 → ultimate

### Game Flow
- [ ] Level-up modal appears ONLY after victory/defeat
- [ ] Level-up choices: HP upgrade increases maxHp by 10%, heals to new max
- [ ] Ability unlock allows use of next ability on next turn
- [ ] Restart button resets position, cooldowns, and heals to full HP
- [ ] Victory: All enemies defeated
- [ ] Defeat: Player HP ≤ 0
- [ ] Autosave saves after victory
- [ ] Load resume works (character stats preserved)

### Combat
- [ ] Basic attack available anytime (CD 0)
- [ ] Special1 available after 1 turn cooldown period
- [ ] Special2 available after 2 turn cooldown period
- [ ] Ultimate available after 3 turn cooldown period
- [ ] Enemy AI pathfinds toward player
- [ ] Melee enemies attack when adjacent
- [ ] Ranged enemies attack if in range, approach if not
- [ ] Defeat resolves after player HP ≤ 0

### UI
- [ ] HUD shows current stats (HP, level, XP, cooldowns)
- [ ] Ability buttons show correct CD status (disabled if cooling, enabled if ready)
- [ ] Level-up modal buttons work correctly
- [ ] Restart button functional
- [ ] Message log updates with combat actions

---

## 9. Known Limitations & Future Considerations

### v1 Scope Constraints
- Single-character only (no squad)
- Single-level prototype (Levels 2-10 not yet built)
- 2 enemy types only (Melee, Ranged)
- No special mechanics (status effects, terrain, environmental hazards)
- No animations (instant damage application, instant movement)

### Performance Considerations
- Grid rendering is efficient (small 5×10 grid)
- Pathfinding is Dijkstra-based (fast for small grids)
- No asset loading (uses HTML canvas circles); pixel art would require image loading

### Future Enhancements
- Skill trees with branching ability choices
- Status effects (poison, stun, bleed, heal)
- Terrain types (high-ground, obstacles)
- Boss attacks with special patterns
- Difficulty modes (easy/normal/hard)
- Leaderboard/score tracking
- Mobile touch controls
- Soundtrack & sound effects

---

## 10. Quick Command Reference

### Start Development
```bash
cd /workspaces/Practice-w-JS
# Open index.html in browser (or use VS Code Live Server)
```

### Validate JavaScript
```bash
node --check script.js
```

### Test Quickly
1. Open index.html in browser
2. Play through Level 1 (defeat all 2 enemies)
3. Check autosave in localStorage via browser DevTools → Application → Storage → Local Storage

### Debug Tips
- Open browser DevTools (F12)
- Console tab shows any JavaScript errors
- Network tab shows fetched files
- Application/Storage tab shows localStorage data under key `tile_tactics_autosave_v1`
- Use `console.log()` in script.js to trace game state

---

## 11. File Locations & Quick Reference

- **Main Game Loop:** [script.js](script.js#L1) - All core logic (~950 lines)
- **UI Definitions:** [index.html](index.html#L1) - Canvas, modals, buttons (~50 lines)
- **Styling:** [style..css](style..css#L1) - Theme, layout (~100+ lines)
- **Game State Object:** [script.js](script.js#L50-L80) (approx) - Global state
- **Ability Definitions:** [script.js](script.js#L150-L170) (approx)
- **Enemy Types:** [script.js](script.js#L180-L200) (approx)
- **Level Definitions:** [script.js](script.js#L250-L280) (approx)
- **setupNewRun Function:** [script.js](script.js#L300-L350) (approx) - Level initialization
- **getReachableTiles Function:** [script.js](script.js#L400-L500) (approx) - Pathfinding core
- **resolvePlayerAttack Function:** [script.js](script.js#L600-L700) (approx) - Combat logic
- **renderHud Function:** [script.js](script.js#L750-L850) (approx) - UI rendering

---

## Summary for New Chat Context

**Copy this entire document into a new chat and ask:**

> "I'm continuing development on a tile-tactics game built in Phaser 3. Here's the full context from the previous session: [paste this document]. What should I work on next? (Or: I need to [specific task], can you help?)"

This document contains:
- Complete game design specification ✅
- Current codebase status ✅
- Technical decisions and rationale ✅
- Step-by-step continuation plan ✅
- Code patterns and examples ✅
- Testing checklist ✅
- File locations and references ✅

---

**Last Updated:** Session completing 2 critical bug fixes
- Level-up modal now deferred until match end
- Restart button now fully heals player

**Ready For:** Next phase development (Level 2-10 expansion, character variants, or boss encounters)

