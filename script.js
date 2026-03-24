// Core game logic (other systems are loaded from separate files)

// Constants
const GRID_ROWS = 6;
const GRID_COLS = 12;
const TILE_SIZE = 80;
const GRID_X = 40;
const GRID_Y = 40;
const SAVE_KEY = "tile_tactics_autosave_v1";
const ENEMY_TURN_START_DELAY_MS = 1000;
const ENEMY_MOVE_TO_ATTACK_DELAY_MS = 500;
const ENEMY_NEXT_ACTION_DELAY_MS = 1000;
const FLOATING_DAMAGE_FADE_MS = 650;
const TURN_BANNER_FADE_MS = 900;
const TURN_BANNER_DELAY_MS = 250;

const ABILITY_ORDER = ["special1", "special2", "ultimate"];

const dataValidationState = {
	hasValidated: false,
};

const attackAudioState = {
	ctx: null,
};

function ensureAttackAudioReady() {
	if (attackAudioState.ctx) {
		if (attackAudioState.ctx.state === "suspended") {
			attackAudioState.ctx.resume().catch(() => {});
		}
		return attackAudioState.ctx;
	}

	const AudioCtx = window.AudioContext || window.webkitAudioContext;
	if (!AudioCtx) {
		return null;
	}

	attackAudioState.ctx = new AudioCtx();
	if (attackAudioState.ctx.state === "suspended") {
		attackAudioState.ctx.resume().catch(() => {});
	}
	return attackAudioState.ctx;
}

function playAttackSfx(attacker = "player") {
	const ctx = ensureAttackAudioReady();
	if (!ctx || ctx.state !== "running") {
		return;
	}

	const now = ctx.currentTime;
	const isEnemy = attacker === "enemy";
	const baseFreq = isEnemy ? 160 : 210;
	const sweepTo = isEnemy ? 110 : 145;
	const sustain = 0.09;

	const osc = ctx.createOscillator();
	const osc2 = ctx.createOscillator();
	const gain = ctx.createGain();
	const filter = ctx.createBiquadFilter();

	osc.type = isEnemy ? "square" : "sawtooth";
	osc2.type = "triangle";
	osc.frequency.setValueAtTime(baseFreq, now);
	osc.frequency.exponentialRampToValueAtTime(sweepTo, now + sustain);
	osc2.frequency.setValueAtTime(baseFreq * 1.5, now);
	osc2.frequency.exponentialRampToValueAtTime(sweepTo * 1.8, now + sustain * 0.8);

	filter.type = "lowpass";
	filter.frequency.setValueAtTime(isEnemy ? 1200 : 1700, now);
	filter.frequency.exponentialRampToValueAtTime(isEnemy ? 700 : 900, now + sustain);

	gain.gain.setValueAtTime(0.0001, now);
	gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
	gain.gain.exponentialRampToValueAtTime(0.0001, now + sustain + 0.03);

	osc.connect(filter);
	osc2.connect(filter);
	filter.connect(gain);
	gain.connect(ctx.destination);

	osc.start(now);
	osc2.start(now);
	osc.stop(now + sustain + 0.04);
	osc2.stop(now + sustain + 0.04);
}

// Game State - initialized after data files loaded
const gameState = {
	player: null,
	playerCharacterId: "leon",
	enemies: [],
	currentLevelId: typeof defaultLevelId === "string" ? defaultLevelId : "level_1",
	selectedAbility: "basic",
	abilityPinned: false,
	hoveredAbility: null,
	openedPlayerAbilityInfo: null,
	selectedEnemyId: null,
	selectedEnemyAbility: null,
	enemyAbilityPinned: false,
	openedEnemyAbilityInfo: null,
	playerPos: { row: 4, col: 1 },
	turnStartPos: { row: 4, col: 1 },
	movedThisTurn: false,
	selectedUnit: null,
	hoveredEntity: { kind: null, id: null },
	canAct: true,
	pendingLevelUps: 0,
	pendingCombatXp: 0,
	playerStatus: {
		evadeTurns: 0,
		tauntTurns: 0,
	},
	enemyDebuffsById: {},
	fireZones: [],
	gameOver: false,
	victory: false,
	activeScene: null,
	highlightedTiles: new Map(),
};

// Utility Functions
function deepClone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

function getNextUnlock(player) {
	for (const key of ABILITY_ORDER) {
		if (!player.unlockedAbilities.includes(key)) {
			return key;
		}
	}
	return null;
}

function getConfiguredAbilityCooldownTurns(player, abilityKey) {
	const configured = player?.abilityCooldownTurns?.[abilityKey];
	if (typeof configured === "number" && Number.isFinite(configured)) {
		return Math.max(0, Math.floor(configured));
	}
	const defaultTurns = abilityDefs?.[abilityKey]?.cooldownTurns || 0;
	return Math.max(0, Math.floor(defaultTurns));
}

function getConfiguredAbilityPower(player, abilityKey) {
	const configured = player?.abilityBasePowers?.[abilityKey];
	if (typeof configured === "number" && Number.isFinite(configured)) {
		return Math.max(0, Math.floor(configured));
	}
	const defaultPower = abilityDefs?.[abilityKey]?.power || 0;
	return Math.max(0, Math.floor(defaultPower));
}

function getEnemyAbilityDefByType(typeKey, abilityKey) {
	const type = enemyTypes?.[typeKey];
	const def = type?.abilityDefs?.[abilityKey];
	if (def) {
		return def;
	}
	if (typeof enemyAbilityDefs !== "undefined" && enemyAbilityDefs?.[abilityKey]) {
		return enemyAbilityDefs[abilityKey];
	}
	return null;
}

function getEnemyAbilityDef(enemyOrType, abilityKey) {
	if (!enemyOrType) {
		return null;
	}
	if (typeof enemyOrType !== "string" && enemyOrType.abilityDefs?.[abilityKey]) {
		return enemyOrType.abilityDefs[abilityKey];
	}
	const typeKey = typeof enemyOrType === "string" ? enemyOrType : enemyOrType.type;
	return getEnemyAbilityDefByType(typeKey, abilityKey);
}

function warnData(message, payload) {
	if (typeof console === "undefined" || typeof console.warn !== "function") {
		return;
	}
	if (typeof payload === "undefined") {
		console.warn(`[Data Warning] ${message}`);
		return;
	}
	console.warn(`[Data Warning] ${message}`, payload);
}

function isKnownEnemyColor(colorValue) {
	if (typeof colorValue === "number" && Number.isFinite(colorValue)) {
		return true;
	}
	if (typeof colorValue !== "string") {
		return false;
	}
	if (typeof namedEnemyColors === "undefined") {
		return false;
	}
	return Boolean(namedEnemyColors[colorValue.trim().toLowerCase()]);
}

function validateCharacterData() {
	if (typeof characterTemplates === "undefined") {
		return;
	}

	for (const [characterId, template] of Object.entries(characterTemplates)) {
		if (!template || typeof template !== "object") {
			warnData(`Character template '${characterId}' is not a valid object.`);
			continue;
		}

		for (const abilityKey of template.unlockedAbilities || []) {
			if (!abilityDefs[abilityKey]) {
				warnData(`Character '${characterId}' has unknown unlocked ability '${abilityKey}'.`);
			}
		}

		for (const abilityKey of Object.keys(template.abilityBasePowers || {})) {
			if (!abilityDefs[abilityKey]) {
				warnData(`Character '${characterId}' has abilityBasePowers entry for unknown ability '${abilityKey}'.`);
			}
		}

		for (const abilityKey of Object.keys(template.abilityCooldownTurns || {})) {
			if (!abilityDefs[abilityKey]) {
				warnData(`Character '${characterId}' has abilityCooldownTurns entry for unknown ability '${abilityKey}'.`);
			}
		}
	}
}

function validateEnemyData() {
	for (const [typeKey, typeDef] of Object.entries(enemyTypes || {})) {
		if (!typeDef || typeof typeDef !== "object") {
			warnData(`Enemy type '${typeKey}' is not a valid object.`);
			continue;
		}

		if (!isKnownEnemyColor(typeDef.color)) {
			warnData(`Enemy type '${typeKey}' uses unknown color '${String(typeDef.color)}'.`);
		}

		for (const abilityKey of typeDef.abilities || []) {
			const def = getEnemyAbilityDefByType(typeKey, abilityKey);
			if (!def) {
				warnData(`Enemy type '${typeKey}' references missing ability '${abilityKey}'.`);
			}
		}
	}
}

function validateLevelData() {
	const levels = typeof levelsById !== "undefined" ? levelsById : { level_1: level1 };
	for (const [levelId, levelDef] of Object.entries(levels || {})) {
		if (!levelDef || typeof levelDef !== "object") {
			warnData(`Level '${levelId}' is not a valid object.`);
			continue;
		}

		if (Array.isArray(levelDef.playerCharacterIds) && !levelDef.playerCharacterIds.includes("all")) {
			for (const characterId of levelDef.playerCharacterIds) {
				if (!playableCharacterIds.includes(characterId)) {
					warnData(`Level '${levelId}' includes unknown player character id '${characterId}'.`);
				}
			}
		}

		for (const enemy of levelDef.enemies || []) {
			if (!enemyTypes?.[enemy.type]) {
				warnData(`Level '${levelId}' has enemy with unknown type '${enemy.type}'.`, enemy);
				continue;
			}

			const typeDef = enemyTypes[enemy.type];
			const abilityKeys = Array.isArray(enemy.abilities) && enemy.abilities.length > 0
				? enemy.abilities
				: (typeDef.abilities || []);

			for (const abilityKey of abilityKeys) {
				const def = enemy.abilityDefs?.[abilityKey] || getEnemyAbilityDefByType(enemy.type, abilityKey);
				if (!def) {
					warnData(`Level '${levelId}' enemy '${enemy.type}' references missing ability '${abilityKey}'.`, enemy);
				}
			}

			const colorValue = enemy.color ?? typeDef.color;
			if (!isKnownEnemyColor(colorValue)) {
				warnData(`Level '${levelId}' enemy '${enemy.type}' uses unknown color '${String(colorValue)}'.`, enemy);
			}
		}
	}
}

function validateGameDataOnce() {
	if (dataValidationState.hasValidated) {
		return;
	}
	dataValidationState.hasValidated = true;
	validateCharacterData();
	validateEnemyData();
	validateLevelData();
}

function getStartingCooldownsForUnlockedAbilities(player) {
	const cooldowns = { special1: 0, special2: 0, ultimate: 0 };
	for (const abilityKey of player.unlockedAbilities || []) {
		if (abilityKey === "basic") {
			continue;
		}
		if (!abilityDefs[abilityKey]) {
			continue;
		}
		cooldowns[abilityKey] = getConfiguredAbilityCooldownTurns(player, abilityKey);
	}
	return cooldowns;
}

function maybeHandleLevelUp() {
	const player = gameState.player;
	while (player.thresholdIndex < player.xpThresholds.length) {
		const threshold = player.xpThresholds[player.thresholdIndex];
		if (player.xpCurrent < threshold) {
			break;
		}

		player.xpCurrent -= threshold;
		player.thresholdIndex += 1;
		player.level += 1;
		gameState.pendingLevelUps += 1;
	}
}

function maybeShowPostMatchLevelUps() {
	if (gameState.pendingLevelUps <= 0) {
		return;
	}
	if (!gameState.gameOver && !gameState.victory) {
		return;
	}
	if (ui.resultModal && !ui.resultModal.classList.contains("hidden")) {
		return;
	}
	if (!ui.levelupModal.classList.contains("hidden")) {
		return;
	}
	showLevelUpModal();
}

function gainXp(amount) {
	gameState.pendingCombatXp += Math.max(0, Math.floor(amount));
}

function commitPendingCombatXp() {
	if (gameState.pendingCombatXp <= 0) {
		return;
	}
	gameState.player.xpCurrent += gameState.pendingCombatXp;
	gameState.pendingCombatXp = 0;
	maybeHandleLevelUp();
}

function discardPendingCombatXp() {
	gameState.pendingCombatXp = 0;
}

function xpForDamage(damage) {
	return Math.max(1, Math.floor(damage));
}

function showFloatingDamageAt(row, col, amount) {
	const scene = gameState.activeScene;
	if (!scene || !scene.add || !scene.tweens) {
		return;
	}
	const value = Math.max(0, Math.floor(amount));
	const x = GRID_X + col * TILE_SIZE + TILE_SIZE / 2 + Phaser.Math.Between(-6, 6);
	const y = GRID_Y + row * TILE_SIZE + TILE_SIZE * 0.22;
	const damageText = scene.add.text(x, y, `-${value}`, {
		fontFamily: "Trebuchet MS, Tahoma, sans-serif",
		fontSize: "24px",
		fontStyle: "bold",
		color: "#ff8e99",
		stroke: "#2a0000",
		strokeThickness: 3,
	});
	damageText.setData("persistFx", true);
	if (scene.fxGroup) {
		scene.fxGroup.add(damageText);
	}
	damageText.setOrigin(0.5);
	damageText.setDepth(30);

	scene.tweens.add({
		targets: damageText,
		y: y - 24,
		alpha: 0,
		duration: FLOATING_DAMAGE_FADE_MS,
		ease: "Cubic.easeOut",
		onComplete: () => damageText.destroy(),
	});
}

function showTurnBanner(text, color = "#f2f6ff", delayMs = TURN_BANNER_DELAY_MS) {
	const scene = gameState.activeScene;
	if (!scene || !scene.add || !scene.tweens || gameState.gameOver || gameState.victory) {
		return;
	}

	const drawBanner = () => {
		if (gameState.activeScene !== scene || gameState.gameOver || gameState.victory) {
			return;
		}

		const centerX = scene.scale.width / 2;
		const centerY = scene.scale.height / 2;
		const banner = scene.add.text(centerX, centerY, text, {
			fontFamily: "Trebuchet MS, Tahoma, sans-serif",
			fontSize: "62px",
			fontStyle: "bold",
			color,
			stroke: "#0d1428",
			strokeThickness: 8,
			align: "center",
		});
		banner.setOrigin(0.5);
		banner.setDepth(60);
		banner.setAlpha(0);
		banner.setData("persistFx", true);
		if (scene.fxGroup) {
			scene.fxGroup.add(banner);
		}

		scene.tweens.add({
			targets: banner,
			alpha: 1,
			scale: 1.02,
			duration: 170,
			ease: "Sine.easeOut",
			yoyo: true,
			hold: TURN_BANNER_FADE_MS,
			onComplete: () => {
				scene.tweens.add({
					targets: banner,
					alpha: 0,
					duration: 240,
					ease: "Sine.easeIn",
					onComplete: () => banner.destroy(),
				});
			},
		});
	};

	if (delayMs > 0) {
		setTimeout(drawBanner, delayMs);
		return;
	}

	drawBanner();
}

function loadSave() {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw);
		if (!parsed || parsed.version !== 1) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function saveGame() {
	if (!gameState.player) {
		return;
	}

	const payload = {
		version: 1,
		playerCharacterId: gameState.playerCharacterId,
		player: {
			...gameState.player,
			hp: Math.max(1, Math.floor(gameState.player.hp)),
		},
	};
	localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

function decrementCooldowns(excludeKey = null) {
	for (const key of ["special1", "special2", "ultimate"]) {
		if (key === excludeKey) {
			continue;
		}
		gameState.player.cooldowns[key] = Math.max(0, gameState.player.cooldowns[key] - 1);
	}
}

function applyAbilityCooldown(abilityKey) {
	if (abilityKey === "basic") {
		return;
	}
	const turns = getConfiguredAbilityCooldownTurns(gameState.player, abilityKey);
	gameState.player.cooldowns[abilityKey] = turns;
}

function resolvePlayerMove(toRow, toCol) {
	if (!gameState.canAct || gameState.gameOver || gameState.victory) {
		return;
	}
	if (gameState.selectedUnit !== "player") {
		setMessage("Select your character first, then choose a tile.");
		return;
	}
	if (gameState.movedThisTurn) {
		setMessage("You already moved this turn. Undo move, attack, or end turn.");
		return;
	}

	const reachable = getReachableTiles(gameState.playerPos.row, gameState.playerPos.col, gameState.player.moveBudget);
	const key = tileKey(toRow, toCol);
	if (!reachable.has(key) || (toRow === gameState.playerPos.row && toCol === gameState.playerPos.col)) {
		if (!gameState.movedThisTurn) {
			gameState.selectedUnit = null;
			setMessage("Invalid move tile. Character deselected.");
		}
		return;
	}

	gameState.playerPos.row = toRow;
	gameState.playerPos.col = toCol;
	gameState.movedThisTurn = true;
	setMessage(`Moved to (${toRow}, ${toCol}). Attack, move again, undo, or end turn.`);
}

function undoMove() {
	if (!gameState.canAct || gameState.gameOver || gameState.victory) {
		return;
	}
	if (!gameState.movedThisTurn) {
		setMessage("No move to undo.");
		return;
	}
	gameState.playerPos = { ...gameState.turnStartPos };
	gameState.movedThisTurn = false;
	setMessage("Move undone. Choose a new tile or end turn.");
}

function beginEnemyPhase(messageText, cooldownExclude = null) {
	decrementCooldowns(cooldownExclude);
	gameState.canAct = false;
	gameState.selectedUnit = null;
	gameState.hoveredEntity = { kind: null, id: null };
	gameState.hoveredAbility = null;
	gameState.abilityPinned = false;
	gameState.openedPlayerAbilityInfo = null;
	gameState.movedThisTurn = false;
	if (messageText) {
		setMessage(messageText);
	}
	showTurnBanner("ENEMY'S TURN", "#ffb3be");
	setTimeout(() => {
		runEnemyTurn();
	}, ENEMY_TURN_START_DELAY_MS);
}

function endTurn() {
	if (!gameState.canAct || gameState.gameOver || gameState.victory) {
		return;
	}
	beginEnemyPhase("Turn ended. Enemy turn starts.", null);
}

function getPlayerMaxAttackRange() {
	let maxRange = 1;
	for (const abilityKey of gameState.player.unlockedAbilities) {
		const def = abilityDefs[abilityKey];
		const range = def.rangeType === "melee" ? 1 : (def.range || 4);
		if (range > maxRange) {
			maxRange = range;
		}
	}
	return maxRange;
}

function shouldShowPlayerHints() {
	if (!gameState.canAct || gameState.gameOver || gameState.victory) {
		return false;
	}
	return gameState.selectedUnit === "player" || gameState.hoveredEntity.kind === "player";
}

function getActivePlayerAbilityPreviewKey() {
	if (gameState.hoveredAbility) {
		return gameState.hoveredAbility;
	}
	if (gameState.abilityPinned) {
		return gameState.selectedAbility;
	}
	return null;
}

function getPlayerAbilityRangeBand(abilityKey) {
	const def = abilityDefs[abilityKey];
	if (!def) {
		return null;
	}
	if (def.rangeType === "self") {
		return null;
	}
	if (def.rangeType === "melee") {
		return { minRange: 1, maxRange: 1 };
	}
	return {
		minRange: def.minRange || 2,
		maxRange: def.maxRange || def.range || 4,
	};
}

function getLongestReadyRangedBand() {
	let best = null;
	// First, look for the longest-range ready ranged ability
	for (const abilityKey of gameState.player.unlockedAbilities) {
		const def = abilityDefs[abilityKey];
		if (!def || def.rangeType !== "ranged") {
			continue;
		}
		if ((gameState.player.cooldowns[abilityKey] || 0) > 0) {
			continue;
		}
		const band = getPlayerAbilityRangeBand(abilityKey);
		if (!band) {
			continue;
		}
		if (!best || band.maxRange > best.maxRange) {
			best = band;
		}
	}
	
	// Fallback to basic ability if no ranged ability is ready
	if (!best && (gameState.player.cooldowns["basic"] || 0) <= 0) {
		best = getPlayerAbilityRangeBand("basic");
	}
	
	return best;
}

function getHoveredEnemy() {
	if (gameState.hoveredEntity.kind !== "enemy") {
		return null;
	}
	return gameState.enemies.find((e) => e.alive && e.id === gameState.hoveredEntity.id) || null;
}

function getEnemyMoveTiles(enemy) {
	const budget = Math.max(1, enemy.moveBudget || 1);
	const queue = [{ row: enemy.row, col: enemy.col, cost: 0 }];
	const visited = new Set([tileKey(enemy.row, enemy.col)]);
	const reachable = [];

	while (queue.length > 0) {
		const current = queue.shift();
		for (const n of orthogonalNeighbors(current.row, current.col)) {
			if (n.cost !== 1) {
				continue;
			}
			const nextCost = current.cost + 1;
			if (nextCost > budget) {
				continue;
			}

			const key = tileKey(n.row, n.col);
			if (visited.has(key)) {
				continue;
			}

			if (n.row === gameState.playerPos.row && n.col === gameState.playerPos.col) {
				continue;
			}
			const blockedByOtherEnemy = gameState.enemies.some(
				(e) => e.alive && e.id !== enemy.id && e.row === n.row && e.col === n.col,
			);
			if (blockedByOtherEnemy) {
				continue;
			}

			visited.add(key);
			reachable.push({ row: n.row, col: n.col });
			queue.push({ row: n.row, col: n.col, cost: nextCost });
		}
	}

	return reachable;
}

function collectAttackTiles(origins, range) {
	const tiles = new Set();
	const minRange = typeof range === "object" ? (range.minRange || 1) : 1;
	const maxRange = typeof range === "object" ? (range.maxRange || 1) : range;
	for (const origin of origins) {
		for (let row = 0; row < GRID_ROWS; row += 1) {
			for (let col = 0; col < GRID_COLS; col += 1) {
				if (row === origin.row && col === origin.col) {
					continue;
				}
				const dist = weightedDistance(origin.row, origin.col, row, col);
				if (dist >= minRange && dist <= maxRange) {
					tiles.add(tileKey(row, col));
				}
			}
		}
	}
	return [...tiles].map((key) => {
		const [row, col] = key.split(",").map(Number);
		return { row, col };
	});
}

function resolveEnemyColor(value) {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value !== "string") {
		return 0xff7777;
	}

	const key = value.trim().toLowerCase();
	if (typeof namedEnemyColors !== "undefined" && namedEnemyColors?.[key]) {
		return namedEnemyColors[key];
	}
	return 0xff7777;
}

function getCurrentLevelDefinition() {
	if (typeof levelsById !== "undefined" && levelsById?.[gameState.currentLevelId]) {
		return levelsById[gameState.currentLevelId];
	}
	if (typeof level1 !== "undefined") {
		return level1;
	}
	return { id: "level_1", name: "Level 1", enemies: [] };
}

function getPlayableCharacterIdsForLevel(levelDef) {
	const ids = levelDef?.playerCharacterIds;
	if (!Array.isArray(ids) || ids.length === 0) {
		return [...playableCharacterIds];
	}
	if (ids.includes("all")) {
		return [...playableCharacterIds];
	}
	const validIds = ids.filter((id) => playableCharacterIds.includes(id));
	return validIds.length > 0 ? validIds : [...playableCharacterIds];
}

function getDefaultCharacterIdForCurrentLevel() {
	const levelDef = getCurrentLevelDefinition();
	const ids = getPlayableCharacterIdsForLevel(levelDef);
	return ids[0] || "leon";
}

function buildLevelEnemies() {
	const levelDef = getCurrentLevelDefinition();
	return (levelDef.enemies || []).map((e, index) => {
		const type = enemyTypes[e.type];
		if (!type) {
			return null;
		}
		const enemyAbilityOverrides = e.abilityDefs && typeof e.abilityDefs === "object"
			? e.abilityDefs
			: null;
		const abilities = Array.isArray(e.abilities) && e.abilities.length > 0
			? [...e.abilities]
			: [...(type.abilities || [])];
		const primaryAbility = enemyAbilityOverrides?.[abilities[0]] || getEnemyAbilityDefByType(e.type, abilities[0]);
		const maxHp = e.maxHp ?? type.maxHp;
		return {
			id: e.id || `enemy_${index}`,
			type: e.type,
			name: e.name || type.name,
			row: e.row,
			col: e.col,
			hp: e.hp ?? maxHp,
			maxHp,
			defense: e.defense ?? type.defense,
			moveBudget: e.moveBudget ?? (type.moveBudget || 1),
			range: e.range ?? (primaryAbility ? (primaryAbility.maxRange || primaryAbility.range) : type.range),
			killXp: e.killXp ?? type.killXp,
			color: resolveEnemyColor(e.color ?? type.color),
			abilities,
			abilityDefs: enemyAbilityOverrides,
			alive: true,
		};
	}).filter(Boolean);
}

function resetLevelState({ healToFull }) {
	if (healToFull) {
		gameState.player.hp = gameState.player.maxHp;
	}
	gameState.player.cooldowns = getStartingCooldownsForUnlockedAbilities(gameState.player);
	gameState.enemies = buildLevelEnemies();
	gameState.playerPos = { row: 4, col: 1 };
	gameState.turnStartPos = { ...gameState.playerPos };
	gameState.movedThisTurn = false;
	gameState.selectedUnit = null;
	gameState.selectedEnemyId = null;
	gameState.selectedEnemyAbility = null;
	gameState.enemyAbilityPinned = false;
	gameState.openedEnemyAbilityInfo = null;
	gameState.hoveredEntity = { kind: null, id: null };
	gameState.selectedAbility = "basic";
	gameState.abilityPinned = false;
	gameState.hoveredAbility = null;
	gameState.openedPlayerAbilityInfo = null;
	gameState.canAct = true;
	gameState.pendingLevelUps = 0;
	gameState.pendingCombatXp = 0;
	gameState.playerStatus = { evadeTurns: 0, tauntTurns: 0 };
	gameState.enemyDebuffsById = {};
	gameState.fireZones = [];
	gameState.gameOver = false;
	gameState.victory = false;
}

function restartCurrentLevel() {
	resetLevelState({ healToFull: true });
	saveGame();
	renderHud();
}

function setupNewRun(forceFresh) {
	const loaded = !forceFresh ? loadSave() : null;
	const defaultCharacterId = getDefaultCharacterIdForCurrentLevel();
	const levelPlayableIds = getPlayableCharacterIdsForLevel(getCurrentLevelDefinition());
	const loadedCharacterId = loaded?.playerCharacterId;
	const canUseLoadedCharacter =
		!forceFresh
		&& loaded?.player
		&& typeof loadedCharacterId === "string"
		&& levelPlayableIds.includes(loadedCharacterId);

	if (canUseLoadedCharacter) {
		gameState.player = loaded.player;
		gameState.playerCharacterId = loadedCharacterId;
	} else {
		gameState.playerCharacterId = defaultCharacterId;
		gameState.player = deepClone(getCharacterTemplateById(defaultCharacterId));
	}
	if (typeof gameState.player.damageMultiplier !== "number" || Number.isNaN(gameState.player.damageMultiplier)) {
		gameState.player.damageMultiplier = 1;
	}
	validateGameDataOnce();
	resetLevelState({ healToFull: false });
}

// Phaser Game Scene
class BattleScene extends Phaser.Scene {
	constructor() {
		super("BattleScene");
		this.tileRects = [];
		this.enemySprites = [];
		this.playerSprite = null;
		this.boardGroup = null;
		this.unitGroup = null;
		this.fxGroup = null;
		this.attackHintGroup = null;
		this.rangeHintGroup = null;
		this.abilityHoverPulseDot = null;
		this.abilityHoverPulseTween = null;
		this.abilityHoverPulseKey = null;
		this.isMovementAnimating = false;
		this.isDrawingBoard = false;
		this.pendingBoardRedraw = false;
	}

	getEnemySpriteById(enemyId) {
		const entry = this.enemySprites.find((item) => item.id === enemyId);
		return entry ? entry.sprite : null;
	}

	animateMovementSprite(sprite, toRow, toCol, duration, onComplete) {
		if (!sprite) {
			if (onComplete) {
				onComplete();
			}
			return;
		}
		const toX = GRID_X + toCol * TILE_SIZE + TILE_SIZE / 2;
		const toY = GRID_Y + toRow * TILE_SIZE + TILE_SIZE / 2;
		this.isMovementAnimating = true;
		this.tweens.add({
			targets: sprite,
			x: toX,
			y: toY,
			duration,
			ease: "Sine.easeInOut",
			onComplete: () => {
				this.isMovementAnimating = false;
				if (onComplete) {
					onComplete();
				}
			},
		});
	}

	animatePlayerMovement(fromRow, fromCol, toRow, toCol, onComplete) {
		if (!this.playerSprite || (fromRow === toRow && fromCol === toCol)) {
			if (onComplete) {
				onComplete();
			}
			return false;
		}
		const dist = Math.abs(fromRow - toRow) + Math.abs(fromCol - toCol);
		const duration = Math.max(120, dist * 140);
		this.animateMovementSprite(this.playerSprite, toRow, toCol, duration, onComplete);
		return true;
	}

	animateEnemyMovement(enemyId, fromRow, fromCol, toRow, toCol, onComplete) {
		if (fromRow === toRow && fromCol === toCol) {
			if (onComplete) {
				onComplete();
			}
			return false;
		}
		const sprite = this.getEnemySpriteById(enemyId);
		if (!sprite) {
			if (onComplete) {
				onComplete();
			}
			return false;
		}
		const dist = Math.abs(fromRow - toRow) + Math.abs(fromCol - toCol);
		const duration = Math.max(120, dist * 130);
		this.animateMovementSprite(sprite, toRow, toCol, duration, onComplete);
		return true;
	}

	setAbilityHoverPulse(row, col, shouldShow, damage) {
		if (!shouldShow) {
			this.abilityHoverPulseKey = null;
			if (!this.abilityHoverPulseDot) {
				return;
			}
			if (this.abilityHoverPulseTween) {
				this.abilityHoverPulseTween.stop();
				this.abilityHoverPulseTween = null;
			}
			const dot = this.abilityHoverPulseDot;
			this.abilityHoverPulseTween = this.tweens.add({
				targets: dot,
				scale: 1,
				alpha: 0,
				duration: 170,
				ease: "Sine.easeOut",
				onComplete: () => {
					dot.destroy();
					if (this.abilityHoverPulseDot === dot) {
						this.abilityHoverPulseDot = null;
					}
					this.abilityHoverPulseTween = null;
				},
			});
			return;
		}

		const key = `${row},${col}`;
		const cx = GRID_X + col * TILE_SIZE + TILE_SIZE / 2;
		const cy = GRID_Y + row * TILE_SIZE + TILE_SIZE / 2;

		if (!this.abilityHoverPulseDot) {
			const displayDamage = damage ? Math.floor(damage) : null;
			if (displayDamage) {
				this.abilityHoverPulseDot = this.add.text(cx, cy, `-${displayDamage}`, {
					fontFamily: "Trebuchet MS, Tahoma, sans-serif",
					fontSize: "24px",
					fontStyle: "bold",
					color: "#ffb34a",
					stroke: "#4a2200",
					strokeThickness: 2,
				});
			} else {
				this.abilityHoverPulseDot = this.add.circle(cx, cy, 5, 0xff6464, 1);
				this.abilityHoverPulseDot.setStrokeStyle(1, 0x350000, 0.9);
			}
			this.abilityHoverPulseDot.setData("persistFx", true);
			this.abilityHoverPulseDot.setOrigin(0.5);
			this.abilityHoverPulseDot.setDepth(26);
			this.abilityHoverPulseDot.setScale(1);
			if (this.fxGroup) {
				this.fxGroup.add(this.abilityHoverPulseDot);
			}
		}

		this.abilityHoverPulseDot.setPosition(cx, cy);
		this.abilityHoverPulseDot.setAlpha(1);

		if (this.abilityHoverPulseTween) {
			this.abilityHoverPulseTween.stop();
			this.abilityHoverPulseTween = null;
		}

		this.abilityHoverPulseKey = key;
	}

	requestBoardRedraw() {
		if (this.isDrawingBoard) {
			this.pendingBoardRedraw = true;
			return;
		}
		this.drawBoard();
	}

	cleanupTaggedVisuals() {
		const children = this.children.getAll();
		for (const child of children) {
			if (!child || typeof child.getData !== "function") {
				continue;
			}
			const layerTag = child.getData("layerTag");
			if (layerTag === "board" || layerTag === "unit" || layerTag === "hint") {
				child.destroy();
			}
		}
	}

	cleanupBeforeRestart() {
		this.isMovementAnimating = false;
		this.isDrawingBoard = false;
		this.pendingBoardRedraw = false;
		if (this.abilityHoverPulseTween) {
			this.abilityHoverPulseTween.stop();
			this.abilityHoverPulseTween = null;
		}
		if (this.abilityHoverPulseDot) {
			this.abilityHoverPulseDot.destroy();
			this.abilityHoverPulseDot = null;
		}
		this.tweens.killAll();
	}

	create() {
		gameState.activeScene = this;
		ensureAttackAudioReady();
		this.boardGroup = this.add.group();
		this.unitGroup = this.add.group();
		this.fxGroup = this.add.group();
		this.attackHintGroup = this.add.group();
		this.rangeHintGroup = this.add.group();
		this.isMovementAnimating = false;
		this.isDrawingBoard = false;
		this.pendingBoardRedraw = false;
		this.abilityHoverPulseTween = null;
		this.abilityHoverPulseDot = null;
		this.abilityHoverPulseKey = null;

		this.drawBoard();
		this.bindInput();
		renderHud();
		setMessage("Click a blue tile to move, or choose an ability and click an enemy.");
		showTurnBanner("YOUR TURN", "#b8ffd0", 0);
	}

	drawBoard() {
		if (this.isDrawingBoard) {
			this.pendingBoardRedraw = true;
			return;
		}
		this.isDrawingBoard = true;
		this.pendingBoardRedraw = false;

		for (const child of this.children.getAll()) {
			if (!child || typeof child.getData !== "function") {
				continue;
			}
			if (child.getData("persistFx")) {
				continue;
			}
			child.destroy();
		}

		this.cleanupTaggedVisuals();

		if (this.boardGroup) {
			this.boardGroup.clear(true, true);
		}
		if (this.unitGroup) {
			this.unitGroup.clear(true, true);
		}
		if (this.attackHintGroup) {
			this.attackHintGroup.clear(true, true);
		}
		if (this.rangeHintGroup) {
			this.rangeHintGroup.clear(true, true);
		}
		if (!this.attackHintGroup) {
			this.attackHintGroup = this.add.group();
		}
		if (!this.rangeHintGroup) {
			this.rangeHintGroup = this.add.group();
		}
		this.tileRects = [];
		this.enemySprites = [];
		const selectedEnemy = gameState.selectedEnemyId
			? gameState.enemies.find((e) => e.alive && e.id === gameState.selectedEnemyId)
			: null;
		const hoveredEnemyActive = gameState.hoveredEntity.kind === "enemy";

		const playerContextActive = shouldShowPlayerHints();
		const abilityPreviewKey = getActivePlayerAbilityPreviewKey();
			const showMoveHints = playerContextActive && !hoveredEnemyActive && !gameState.movedThisTurn && !abilityPreviewKey;
		const reachable = showMoveHints
			? getReachableTiles(gameState.playerPos.row, gameState.playerPos.col, gameState.player.moveBudget)
			: new Map();

		gameState.highlightedTiles = reachable;

		const gridLines = this.add.graphics();
		gridLines.setData("layerTag", "board");
		if (this.boardGroup) {
			this.boardGroup.add(gridLines);
		}

		for (let row = 0; row < GRID_ROWS; row += 1) {
			for (let col = 0; col < GRID_COLS; col += 1) {
				const x = GRID_X + col * TILE_SIZE;
				const y = GRID_Y + row * TILE_SIZE;
				const key = tileKey(row, col);
				const isReachable = reachable.has(key);
				const isSelectedEnemyTile = selectedEnemy && selectedEnemy.row === row && selectedEnemy.col === col;
				const reachableStrokeColor = gameState.movedThisTurn ? 0xb49a82 : 0xe7ad65;

				const color = (row + col) % 2 === 0 ? 0x4b3324 : 0x3f2b1f;
				const tile = this.add.rectangle(x, y, TILE_SIZE, TILE_SIZE, color).setOrigin(0);
				tile.setData("layerTag", "board");
				if (this.boardGroup) {
					this.boardGroup.add(tile);
				}

				if (isReachable || isSelectedEnemyTile) {
					const strokeColor = isSelectedEnemyTile ? 0xff6464 : reachableStrokeColor;
					const strokeAlpha = isSelectedEnemyTile ? 0.95 : 1;
					const highlight = this.add.rectangle(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8, 0x000000, 0).setOrigin(0);
					highlight.setData("layerTag", "board");
					highlight.setStrokeStyle(1, strokeColor, strokeAlpha);
					if (this.boardGroup) {
						this.boardGroup.add(highlight);
					}
				}
				tile.setInteractive();
				tile.on("pointerover", () => {
					if (!gameState.canAct) {
						return;
					}
					if (!gameState.selectedUnit && gameState.hoveredEntity.kind !== null) {
						gameState.hoveredEntity = { kind: null, id: null };
						renderHud();
					}
				});
				tile.on("pointerdown", () => {
					if (!gameState.canAct || this.isMovementAnimating) {
						return;
					}
					const fromRow = gameState.playerPos.row;
					const fromCol = gameState.playerPos.col;
					resolvePlayerMove(row, col);
					renderHud();
					const toRow = gameState.playerPos.row;
					const toCol = gameState.playerPos.col;
					const animated = this.animatePlayerMovement(fromRow, fromCol, toRow, toCol, () => {
						this.requestBoardRedraw();
					});
					if (!animated) {
						this.requestBoardRedraw();
					}
				});
				this.tileRects.push(tile);
			}
		}

		gridLines.lineStyle(1, 0x8b6445, 0.6);
		for (let row = 0; row <= GRID_ROWS; row += 1) {
			const y = GRID_Y + row * TILE_SIZE + 0.5;
			gridLines.lineBetween(GRID_X + 0.5, y, GRID_X + GRID_COLS * TILE_SIZE + 0.5, y);
		}
		for (let col = 0; col <= GRID_COLS; col += 1) {
			const x = GRID_X + col * TILE_SIZE + 0.5;
			gridLines.lineBetween(x, GRID_Y + 0.5, x, GRID_Y + GRID_ROWS * TILE_SIZE + 0.5);
		}

		for (const enemy of gameState.enemies) {
			if (!enemy.alive) {
				continue;
			}
			const cx = GRID_X + enemy.col * TILE_SIZE + TILE_SIZE / 2;
			const cy = GRID_Y + enemy.row * TILE_SIZE + TILE_SIZE / 2;
			const sprite = this.add.circle(cx, cy, TILE_SIZE * 0.28, enemy.color);
			sprite.setData("layerTag", "unit");
			if (this.unitGroup) {
				this.unitGroup.add(sprite);
			}
			sprite.setStrokeStyle(2, 0x1a1a1a, 0.9);
			sprite.setInteractive();
			sprite.on("pointerover", () => {
				if (!gameState.canAct) {
					return;
				}
				gameState.hoveredEntity = { kind: "enemy", id: enemy.id };
				renderHud();
				this.drawAttackHints();
			});
			sprite.on("pointerout", () => {
				if (!gameState.canAct) {
					return;
				}
				gameState.hoveredEntity = { kind: null, id: null };
				renderHud();
				this.drawAttackHints();
			});
			sprite.on("pointerdown", () => {
				if (this.isMovementAnimating) {
					return;
				}
				if (gameState.canAct && gameState.selectedUnit === "player" && gameState.abilityPinned) {
					gameState.selectedEnemyId = enemy.id;
					gameState.selectedEnemyAbility = null;
					gameState.enemyAbilityPinned = false;
					gameState.openedEnemyAbilityInfo = null;
					gameState.hoveredEntity = { kind: null, id: null };
					this.setAbilityHoverPulse(0, 0, false);
					if (this.attackHintGroup) {
						this.attackHintGroup.clear(true, true);
					}
					if (this.rangeHintGroup) {
						this.rangeHintGroup.clear(true, true);
					}
					resolvePlayerAttack(enemy);
					renderHud();
					this.requestBoardRedraw();
					return;
				}
				if (!enemy.alive) {
					return;
				}
				if (gameState.selectedEnemyId === enemy.id) {
					gameState.selectedEnemyId = null;
					gameState.selectedEnemyAbility = null;
					gameState.enemyAbilityPinned = false;
					gameState.openedEnemyAbilityInfo = null;
				} else {
					gameState.selectedEnemyId = enemy.id;
					gameState.selectedEnemyAbility = null;
					gameState.enemyAbilityPinned = false;
					gameState.openedEnemyAbilityInfo = null;
				}
				gameState.selectedUnit = null;
				renderHud();
				this.requestBoardRedraw();
			});

			this.enemySprites.push({ id: enemy.id, sprite });
		}

		if (gameState.player.hp > 0) {
			const px = GRID_X + gameState.playerPos.col * TILE_SIZE + TILE_SIZE / 2;
			const py = GRID_Y + gameState.playerPos.row * TILE_SIZE + TILE_SIZE / 2;
			this.playerSprite = this.add.circle(px, py, TILE_SIZE * 0.30, 0x5de4a7);
			this.playerSprite.setData("layerTag", "unit");
			if (this.unitGroup && this.playerSprite) {
				this.unitGroup.add(this.playerSprite);
			}
			this.playerSprite.setStrokeStyle(2, 0x0f1020, 1);
			this.playerSprite.setInteractive();
			this.playerSprite.on("pointerover", () => {
				if (!gameState.canAct) {
					return;
				}
				if (gameState.hoveredEntity.kind === "player" && gameState.hoveredEntity.id === "player") {
					return;
				}
				gameState.hoveredEntity = { kind: "player", id: "player" };
				renderHud();
				this.drawAttackHints();
			});
			this.playerSprite.on("pointerout", () => {
				if (!gameState.canAct) {
					return;
				}
				if (gameState.hoveredEntity.kind !== "player") {
					return;
				}
				gameState.hoveredEntity = { kind: null, id: null };
				renderHud();
				this.drawAttackHints();
			});
			this.playerSprite.on("pointerdown", () => {
				if (!gameState.canAct || gameState.gameOver || gameState.victory || this.isMovementAnimating) {
					return;
				}
				if (
					gameState.selectedUnit === "player"
					&& gameState.abilityPinned
					&& gameState.selectedAbility === "special1"
					&& typeof resolvePlayerSelfCastAbility === "function"
				) {
					this.setAbilityHoverPulse(0, 0, false);
					if (this.attackHintGroup) {
						this.attackHintGroup.clear(true, true);
					}
					if (this.rangeHintGroup) {
						this.rangeHintGroup.clear(true, true);
					}
					resolvePlayerSelfCastAbility();
					renderHud();
					this.requestBoardRedraw();
					return;
				}
				gameState.selectedUnit = gameState.selectedUnit === "player" ? null : "player";
				renderHud();
				this.requestBoardRedraw();
			});
		} else {
			this.playerSprite = null;
		}

		this.drawAttackHints();

		this.isDrawingBoard = false;
		if (this.pendingBoardRedraw) {
			this.pendingBoardRedraw = false;
			setTimeout(() => this.requestBoardRedraw(), 0);
		}
	}

	drawAttackHints() {
		if (!this.attackHintGroup) {
			return;
		}

		this.attackHintGroup.clear(true, true);
		if (this.rangeHintGroup) {
			this.rangeHintGroup.clear(true, true);
		}

		if (gameState.gameOver || gameState.victory) {
			this.setAbilityHoverPulse(0, 0, false);
			return;
		}

		const abilityPreviewKey = getActivePlayerAbilityPreviewKey();
		const hoveredEnemy = getHoveredEnemy();
		if (hoveredEnemy && gameState.canAct && !abilityPreviewKey) {
			this.setAbilityHoverPulse(0, 0, false);
			const moveTiles = getEnemyMoveTiles(hoveredEnemy);
			for (const tile of moveTiles) {
				const x = GRID_X + tile.col * TILE_SIZE;
				const y = GRID_Y + tile.row * TILE_SIZE;
				const marker = this.add.rectangle(x, y, TILE_SIZE - 12, TILE_SIZE - 12, 0xd39a56, 0.14).setOrigin(0);
				marker.setData("layerTag", "hint");
				marker.setStrokeStyle(1, 0xd39a56, 0.85);
				this.rangeHintGroup.add(marker);
			}

			const origins = [{ row: hoveredEnemy.row, col: hoveredEnemy.col }, ...moveTiles];
			for (const abilityKey of hoveredEnemy.abilities || []) {
				const def = getEnemyAbilityDef(hoveredEnemy, abilityKey);
				if (!def) {
					continue;
				}
				const attackTiles = collectAttackTiles(origins, {
					minRange: def.minRange || (def.rangeType === "ranged" ? 2 : 1),
					maxRange: def.maxRange || def.range || 1,
				});
				for (const tile of attackTiles) {
					const cx = GRID_X + tile.col * TILE_SIZE + TILE_SIZE / 2;
					const cy = GRID_Y + tile.row * TILE_SIZE + TILE_SIZE / 2;
					const dot = this.add.circle(cx, cy, 5, 0xff6464, 0.95);
					dot.setData("layerTag", "hint");
					dot.setStrokeStyle(1, 0x350000, 0.85);
					this.attackHintGroup.add(dot);
				}
			}
			return;
		}

		const playerContextActive = shouldShowPlayerHints();
		if (!playerContextActive) {
			this.setAbilityHoverPulse(0, 0, false);
			return;
		}
		if (!gameState.canAct) {
			this.setAbilityHoverPulse(0, 0, false);
			return;
		}

		if (abilityPreviewKey) {
			const band = getPlayerAbilityRangeBand(abilityPreviewKey);
			if (!band) {
				this.setAbilityHoverPulse(0, 0, false);
				return;
			}
			const hoveredEnemyIsCurrentlyAttackable = hoveredEnemy
				? canHitTargetWithAbility(abilityPreviewKey, hoveredEnemy)
				: false;
			// Show attack tiles only from current position
			const playerAttackTiles = collectAttackTiles([{ row: gameState.playerPos.row, col: gameState.playerPos.col }], band);
			for (const tile of playerAttackTiles) {
				// Skip drawing red dot on the hovered enemy tile - damage number will replace it
				if (hoveredEnemyIsCurrentlyAttackable && tile.row === hoveredEnemy.row && tile.col === hoveredEnemy.col) {
					continue;
				}
				const cx = GRID_X + tile.col * TILE_SIZE + TILE_SIZE / 2;
				const cy = GRID_Y + tile.row * TILE_SIZE + TILE_SIZE / 2;
				const dot = this.add.circle(cx, cy, 5, 0xff6464, 0.95);
				dot.setData("layerTag", "hint");
				dot.setStrokeStyle(1, 0x350000, 0.85);
				this.attackHintGroup.add(dot);
			}

			if (hoveredEnemy && hoveredEnemyIsCurrentlyAttackable) {
				const basePower = getConfiguredAbilityPower(gameState.player, abilityPreviewKey);
				const scaledPower = getPlayerScaledPower(basePower);
				const damage = computeDamage(hoveredEnemy.defense, scaledPower);
				this.setAbilityHoverPulse(hoveredEnemy.row, hoveredEnemy.col, true, damage);
			} else {
				this.setAbilityHoverPulse(0, 0, false);
			}
			return;
		}

		this.setAbilityHoverPulse(0, 0, false);

		const showPlayerHoverMoveHints =
			gameState.hoveredEntity.kind === "player"
			&& gameState.selectedUnit !== "player"
			&& !gameState.movedThisTurn
			&& !abilityPreviewKey;
		if (showPlayerHoverMoveHints) {
			const reachableMap = getReachableTiles(gameState.playerPos.row, gameState.playerPos.col, gameState.player.moveBudget);
			for (const key of reachableMap.keys()) {
				const [row, col] = key.split(",").map(Number);
				const x = GRID_X + col * TILE_SIZE;
				const y = GRID_Y + row * TILE_SIZE;
				const marker = this.add.rectangle(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8, 0x000000, 0).setOrigin(0);
				marker.setData("layerTag", "hint");
				marker.setStrokeStyle(1, 0xe7ad65, 1);
				this.rangeHintGroup.add(marker);
			}
		}

		if (gameState.movedThisTurn) {
			return;
		}

		if (gameState.hoveredEntity.kind === "player" && gameState.selectedUnit !== "player") {
			const band = getLongestReadyRangedBand();
			if (!band) {
				return;
			}
			// Include current position and all reachable tiles as attack origins
			const reachableMap = getReachableTiles(gameState.playerPos.row, gameState.playerPos.col, gameState.player.moveBudget);
			const origins = [{ row: gameState.playerPos.row, col: gameState.playerPos.col }];
			for (const key of reachableMap.keys()) {
				const [row, col] = key.split(",").map(Number);
				if (!(row === gameState.playerPos.row && col === gameState.playerPos.col)) {
					origins.push({ row, col });
				}
			}
			const playerAttackTiles = collectAttackTiles(origins, band);
			for (const tile of playerAttackTiles) {
				const cx = GRID_X + tile.col * TILE_SIZE + TILE_SIZE / 2;
				const cy = GRID_Y + tile.row * TILE_SIZE + TILE_SIZE / 2;
				const dot = this.add.circle(cx, cy, 5, 0xff6464, 0.95);
				dot.setData("layerTag", "hint");
				dot.setStrokeStyle(1, 0x350000, 0.85);
				this.attackHintGroup.add(dot);
			}
		}
	}

	bindInput() {
		this.input.keyboard.on("keydown-R", () => {
			restartCurrentLevel();
			this.scene.restart();
			setMessage("Level restarted with full HP.", "ok");
		});
		this.input.keyboard.on("keydown-E", () => {
			endTurn();
			renderHud();
			this.requestBoardRedraw();
		});
		this.input.keyboard.on("keydown-U", () => {
			if (this.isMovementAnimating) {
				return;
			}
			undoMove();
			renderHud();
			this.requestBoardRedraw();
		});
	}
}

// Initialize game
setupNewRun(false);

const config = {
	type: Phaser.AUTO,
	parent: "game-root",
	width: GRID_X * 2 + GRID_COLS * TILE_SIZE,
	height: GRID_Y * 2 + GRID_ROWS * TILE_SIZE,
	backgroundColor: "#2a1f18",
	scene: [BattleScene],
};

new Phaser.Game(config);
