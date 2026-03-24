const ui = {
	playerStats: document.getElementById("player-stats"),
	playerAbilities: document.getElementById("player-abilities"),
	enemyStats: document.getElementById("enemy-stats"),
	enemyAbilities: document.getElementById("enemy-abilities"),
	message: document.getElementById("message"),
	levelupModal: document.getElementById("levelup-modal"),
	levelupText: document.getElementById("levelup-text"),
	hpUpgrade: document.getElementById("hp-upgrade"),
	abilityUpgrade: document.getElementById("ability-upgrade"),
	resultModal: document.getElementById("result-modal"),
	resultTitle: document.getElementById("result-title"),
	resultText: document.getElementById("result-text"),
	resultClose: document.getElementById("result-close-btn"),
	endTurn: document.getElementById("end-turn-btn"),
	undoMove: document.getElementById("undo-move-btn"),
	restart: document.getElementById("restart-btn"),
	clearSave: document.getElementById("clear-save-btn"),
};

let lastHudSignature = null;
const hpBarStateByKey = {};

function buildHudSignature() {
	const p = gameState.player;
	if (!p) {
		return "no-player";
	}

	const inspection = getInspectionTarget();
	const inspectionEnemy = inspection?.kind === "enemy" ? inspection.enemy : null;

	return JSON.stringify({
		inspectionKind: inspection?.kind || null,
		inspectionEnemy: inspectionEnemy
			? {
				id: inspectionEnemy.id,
				hp: Math.floor(inspectionEnemy.hp),
				maxHp: Math.floor(inspectionEnemy.maxHp),
				defense: inspectionEnemy.defense,
				abilities: inspectionEnemy.abilities || [],
			}
			: null,
		player: {
			name: p.name,
			level: p.level,
			hp: Math.floor(p.hp),
			maxHp: Math.floor(p.maxHp),
			xpCurrent: p.xpCurrent,
			thresholdIndex: p.thresholdIndex,
			unlockedAbilities: p.unlockedAbilities || [],
			cooldowns: p.cooldowns || {},
		},
		selectedUnit: gameState.selectedUnit,
		selectedAbility: gameState.selectedAbility,
		abilityPinned: gameState.abilityPinned,
		openedPlayerAbilityInfo: gameState.openedPlayerAbilityInfo,
		selectedEnemyId: gameState.selectedEnemyId,
		selectedEnemyAbility: gameState.selectedEnemyAbility,
		enemyAbilityPinned: gameState.enemyAbilityPinned,
		openedEnemyAbilityInfo: gameState.openedEnemyAbilityInfo,
		controls: {
			canAct: gameState.canAct,
			gameOver: gameState.gameOver,
			victory: gameState.victory,
			movedThisTurn: gameState.movedThisTurn,
		},
	});
}

function getEnemySummary(enemy) {
	if (!enemy) {
		return null;
	}
	const template = enemyTypes[enemy.type];
	if (!template) {
		return null;
	}
	const abilityNames = (enemy.abilities || [])
		.map((key) => {
			const def = typeof getEnemyAbilityDef === "function" ? getEnemyAbilityDef(enemy, key) : null;
			return def?.name;
		})
		.filter(Boolean);
	return {
		name: enemy.name || template.name,
		hp: enemy.hp,
		maxHp: enemy.maxHp,
		defense: enemy.defense,
		abilities: abilityNames,
	};
}

function getInspectionTarget() {
	if (gameState.hoveredEntity.kind === "player") {
		return { kind: "player" };
	}
	if (gameState.hoveredEntity.kind === "enemy") {
		const enemy = gameState.enemies.find((e) => e.id === gameState.hoveredEntity.id && e.alive);
		if (enemy) {
			return { kind: "enemy", enemy };
		}
	}
	if (gameState.selectedEnemyId) {
		const enemy = gameState.enemies.find((e) => e.id === gameState.selectedEnemyId && e.alive);
		if (enemy) {
			return { kind: "enemy", enemy };
		}
	}
	if (gameState.selectedUnit === "player") {
		return { kind: "player" };
	}
	return null;
}

function getEnemyPanelTarget() {
	if (gameState.hoveredEntity.kind === "enemy") {
		const hoveredEnemy = gameState.enemies.find((e) => e.id === gameState.hoveredEntity.id && e.alive);
		if (hoveredEnemy) {
			return hoveredEnemy;
		}
	}
	if (gameState.selectedEnemyId) {
		const selectedEnemy = gameState.enemies.find((e) => e.id === gameState.selectedEnemyId && e.alive);
		if (selectedEnemy) {
			return selectedEnemy;
		}
	}
	return null;
}

function setMessage(text, tone = "neutral") {
	ui.message.textContent = text;
	if (tone === "danger") {
		ui.message.style.color = "#ff9ca7";
	} else if (tone === "ok") {
		ui.message.style.color = "#9cffbf";
	} else {
		ui.message.style.color = "var(--muted)";
	}
}

function getAbilityRangeLabel(def) {
	if (!def) {
		return "Unknown";
	}
	if (def.rangeType === "self") {
		return "Self";
	}
	if (def.rangeType === "melee") {
		return "Melee (adjacent)";
	}
	const minRange = def.minRange || 2;
	const maxRange = def.maxRange || def.range || minRange;
	return `Ranged (${minRange}-${maxRange} tiles)`;
}

function getDisplayedPlayerAbilityDamage(abilityKey, fallbackPower) {
	const basePower = typeof getConfiguredAbilityPower === "function"
		? getConfiguredAbilityPower(gameState.player, abilityKey)
		: fallbackPower;
	const multiplier = typeof gameState.player?.damageMultiplier === "number" && !Number.isNaN(gameState.player.damageMultiplier)
		? gameState.player.damageMultiplier
		: 1;
	return Math.max(1, Math.round(basePower * multiplier));
}

function getHpBarMarkup(currentHp, maxHp, key) {
	const safeMax = Math.max(1, Math.floor(maxHp));
	const safeCurrent = Math.max(0, Math.min(safeMax, Math.floor(currentHp)));
	const targetPct = Math.max(0, Math.min(100, (safeCurrent / safeMax) * 100));
	if (!hpBarStateByKey[key]) {
		hpBarStateByKey[key] = { displayedPct: targetPct, targetPct };
	} else {
		hpBarStateByKey[key].targetPct = targetPct;
	}
	const displayedPct = hpBarStateByKey[key].displayedPct;
	return [
		'<div class="hp-bar-wrap" role="img" aria-label="HP bar">',
		`<div class="hp-bar-fill" data-hp-key="${key}" data-hp-target="${targetPct}" style="width: ${displayedPct}%;"></div>`,
		`<div class="hp-bar-label">${safeCurrent} / ${safeMax}</div>`,
		"</div>",
	].join("");
}

function animateHpBars(root) {
	if (!root) {
		return;
	}
	const fills = root.querySelectorAll(".hp-bar-fill[data-hp-target]");
	for (const fill of fills) {
		const key = fill.getAttribute("data-hp-key");
		const target = Number(fill.getAttribute("data-hp-target"));
		if (!key || Number.isNaN(target)) {
			continue;
		}
		const state = hpBarStateByKey[key] || { displayedPct: target, targetPct: target };
		hpBarStateByKey[key] = state;

		const settleState = () => {
			state.displayedPct = target;
			state.targetPct = target;
			fill.removeAttribute("data-hp-target");
		};

		if (Math.abs(state.displayedPct - target) < 0.01) {
			settleState();
			continue;
		}

		// Paint the previous width first, then apply the target width on the next frame.
		// This prevents occasional instant jumps when the DOM was just re-rendered.
		fill.style.width = `${state.displayedPct}%`;
		void fill.offsetWidth;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				fill.style.width = `${target}%`;
				fill.addEventListener("transitionend", settleState, { once: true });
				setTimeout(settleState, 320);
			});
		});
	}
}

function applyTurnLockedControlVisuals() {
	ui.endTurn.classList.remove("turn-locked");
	ui.undoMove.classList.remove("turn-locked");
}

function getCurrentXpLabel() {
	const p = gameState.player;
	const nextThreshold = p.thresholdIndex < p.xpThresholds.length ? p.xpThresholds[p.thresholdIndex] : "MAX";
	return `${p.xpCurrent} / ${nextThreshold}`;
}

function getXpBarMarkup(currentXp, nextThreshold) {
	const isMax = nextThreshold === "MAX";
	const maxValue = isMax ? Math.max(1, currentXp) : Math.max(1, Math.floor(nextThreshold));
	const safeCurrent = Math.max(0, Math.min(maxValue, Math.floor(currentXp)));
	const pct = isMax ? 100 : Math.max(0, Math.min(100, (safeCurrent / maxValue) * 100));
	const label = isMax ? `${Math.floor(currentXp)} / MAX` : `${safeCurrent} / ${maxValue}`;
	return [
		'<div class="xp-bar-wrap" role="img" aria-label="XP bar">',
		`<div class="xp-bar-fill" style="width: ${pct}%;"></div>`,
		`<div class="xp-bar-label">${label}</div>`,
		"</div>",
	].join("");
}

function getDefenseShieldsMarkup(defensePct) {
	const numericDefense = Number(defensePct);
	const clamped = Math.max(0, Math.min(100, Number.isFinite(numericDefense) ? numericDefense : 0));
	const label = Number.isInteger(clamped) ? `${clamped}% DEF` : `${clamped.toFixed(1)}% DEF`;
	const shields = [];
	for (let index = 0; index < 10; index += 1) {
		const valueInShield = Math.max(0, Math.min(10, clamped - index * 10));
		const fillPct = valueInShield * 10;
		shields.push(
			[
				'<svg class="def-shield" viewBox="0 0 100 100" aria-hidden="true" focusable="false">',
				'<polygon class="def-shield-base" points="50,0 93,17 93,62 50,100 7,62 7,17"></polygon>',
				`<polygon class="def-shield-fill" points="50,0 93,17 93,62 50,100 7,62 7,17" style="clip-path: inset(0 ${100 - fillPct}% 0 0);"></polygon>`,
				'<polygon class="def-shield-outline" points="50,0 93,17 93,62 50,100 7,62 7,17"></polygon>',
				'</svg>',
			].join(""),
		);
	}
	return [
		'<div class="def-meter" role="img" aria-label="Defense shield meter">',
		`<div class="def-shields">${shields.join("")}</div>`,
		`<div class="def-meter-label">${label}</div>`,
		"</div>",
	].join("");
}

function showMatchResultModal(outcome) {
	if (!ui.resultModal) {
		return;
	}
	if (outcome === "defeat") {
		ui.resultTitle.textContent = "DEFEATED";
		ui.resultTitle.style.color = "#ffb4a5";
		const p = gameState.player;
		const nextThreshold = p.thresholdIndex < p.xpThresholds.length ? p.xpThresholds[p.thresholdIndex] : "MAX";
		ui.resultText.innerHTML = [
			"<div>XP so far:</div>",
			getXpBarMarkup(p.xpCurrent, nextThreshold),
		].join("");
		ui.resultClose.textContent = "Restart";
	} else {
		ui.resultTitle.textContent = "VICTORY";
		ui.resultTitle.style.color = "#b7d98f";
		const p = gameState.player;
		const nextThreshold = p.thresholdIndex < p.xpThresholds.length ? p.xpThresholds[p.thresholdIndex] : "MAX";
		ui.resultText.innerHTML = [
			"<div>XP so far:</div>",
			getXpBarMarkup(p.xpCurrent, nextThreshold),
		].join("");
		ui.resultClose.textContent = "Continue";
	}
	ui.resultModal.classList.remove("hidden");
}

function restartLevelFromHudAction() {
	if (ui.resultModal) {
		ui.resultModal.classList.add("hidden");
	}
	if (gameState.activeScene) {
		gameState.activeScene.cleanupBeforeRestart();
	}
	restartCurrentLevel();
	if (gameState.activeScene) {
		gameState.activeScene.scene.restart();
	}
	setMessage("Level restarted with full HP.", "ok");
}

function closeMatchResultModal() {
	if (!ui.resultModal) {
		return;
	}
	ui.resultModal.classList.add("hidden");
	if (gameState.victory && gameState.pendingLevelUps > 0) {
		maybeShowPostMatchLevelUps();
	}
}

function renderHud() {
	const p = gameState.player;
	const signature = buildHudSignature();
	if (signature === lastHudSignature) {
		return;
	}
	lastHudSignature = signature;

	const nextThreshold = p.thresholdIndex < p.xpThresholds.length ? p.xpThresholds[p.thresholdIndex] : "MAX";
	const inspection = getInspectionTarget();
	const inspectedEnemy = getEnemyPanelTarget();
	const isPlayerSelected = gameState.selectedUnit === "player";

	ui.playerStats.innerHTML = [
		`<div><strong>${p.name}</strong> Lv ${p.level}</div>`,
		`<div>${getHpBarMarkup(p.hp, p.maxHp, "player")}</div>`,
		`<div>${getDefenseShieldsMarkup(p.defense)}</div>`,
		`<div>${getXpBarMarkup(p.xpCurrent, nextThreshold)}</div>`,
	].join("");

	ui.enemyStats.innerHTML = inspectedEnemy
		? (() => {
			const enemy = getEnemySummary(inspectedEnemy);
			return [
				`<div><strong>${enemy.name}</strong></div>`,
				`<div>${getHpBarMarkup(enemy.hp, enemy.maxHp, `enemy-${inspectedEnemy.id}`)}</div>`,
				`<div>${getDefenseShieldsMarkup(enemy.defense)}</div>`,
			].join("");
		})()
		: [
			"<div><strong>No Enemy Selected</strong></div>",
			"<div>Hover or click an enemy to inspect.</div>",
		].join("");

	animateHpBars(ui.playerStats);
	animateHpBars(ui.enemyStats);

	ui.enemyAbilities.innerHTML = "";
	if (inspectedEnemy) {
		const enemy = inspectedEnemy;
		const enemyAbilities = enemy.abilities || [];
		for (const abilityKey of enemyAbilities) {
			const def = typeof getEnemyAbilityDef === "function" ? getEnemyAbilityDef(enemy, abilityKey) : null;
			if (!def) {
				continue;
			}
			const wrapper = document.createElement("div");
			wrapper.className = "ability-item";
			const row = document.createElement("div");
			row.className = "ability-row";
			const btn = document.createElement("button");
			btn.className = "ability-main";
			btn.textContent = def.name;
			const toggle = document.createElement("button");
			toggle.className = "ability-toggle";
			toggle.type = "button";
			toggle.textContent = gameState.openedEnemyAbilityInfo === abilityKey ? "v" : ">";
			toggle.setAttribute("aria-label", `Toggle ${def.name} details`);

			if (gameState.enemyAbilityPinned && gameState.selectedEnemyId === enemy.id && gameState.selectedEnemyAbility === abilityKey) {
				btn.classList.add("active");
			}

			btn.addEventListener("click", () => {
				if (gameState.selectedEnemyId !== enemy.id) {
					gameState.selectedEnemyId = enemy.id;
					gameState.selectedEnemyAbility = null;
					gameState.enemyAbilityPinned = false;
				}
				if (gameState.enemyAbilityPinned) {
					if (gameState.selectedEnemyAbility === abilityKey) {
						gameState.enemyAbilityPinned = false;
					} else {
						gameState.selectedEnemyAbility = abilityKey;
						gameState.enemyAbilityPinned = true;
					}
				} else {
					gameState.selectedEnemyAbility = abilityKey;
					gameState.enemyAbilityPinned = true;
				}
				renderHud();
			});

			toggle.addEventListener("click", () => {
				gameState.openedEnemyAbilityInfo = gameState.openedEnemyAbilityInfo === abilityKey ? null : abilityKey;
				renderHud();
			});

			row.appendChild(btn);
			row.appendChild(toggle);
			wrapper.appendChild(row);

			const showEnemyDetails = gameState.openedEnemyAbilityInfo === abilityKey;
			if (showEnemyDetails) {
				const details = document.createElement("div");
				details.className = "ability-dropdown";
				details.innerHTML = [
					`<div><strong>Description:</strong> ${def.description || "No description yet."}</div>`,
					`<div><strong>Damage:</strong> ${def.power}</div>`,
					`<div><strong>Range:</strong> ${getAbilityRangeLabel(def)}</div>`,
				].join("");
				wrapper.appendChild(details);
			}

			ui.enemyAbilities.appendChild(wrapper);
		}
		if (enemyAbilities.length === 0) {
			const btn = document.createElement("button");
			btn.textContent = "No enemy abilities";
			btn.disabled = true;
			ui.enemyAbilities.appendChild(btn);
		}
	} else {
		const btn = document.createElement("button");
		btn.textContent = "No enemy abilities";
		btn.disabled = true;
		ui.enemyAbilities.appendChild(btn);
	}

	ui.playerAbilities.innerHTML = "";
	for (const abilityKey of ["basic", "special1", "special2", "ultimate"]) {
		const def = typeof getPlayerAbilityDef === "function" ? getPlayerAbilityDef(abilityKey, p) : null;
		if (!def) {
			continue;
		}
		const wrapper = document.createElement("div");
		wrapper.className = "ability-item";
		const row = document.createElement("div");
		row.className = "ability-row";
		const btn = document.createElement("button");
		btn.className = "ability-main";
		const toggle = document.createElement("button");
		toggle.className = "ability-toggle";
		toggle.type = "button";
		toggle.textContent = gameState.openedPlayerAbilityInfo === abilityKey ? "v" : ">";
		toggle.setAttribute("aria-label", `Toggle ${def.name} details`);
		const unlocked = p.unlockedAbilities.includes(abilityKey);
		const cd = p.cooldowns[abilityKey] || 0;
		const onCd = cd > 0;
		if (onCd) {
			btn.textContent = def.name;
			const cdBadge = document.createElement("span");
			cdBadge.className = "ability-cooldown";
			cdBadge.textContent = cd;
			btn.appendChild(cdBadge);
		} else {
			btn.textContent = def.name;
		}
		btn.disabled = !unlocked || onCd || !gameState.canAct || gameState.gameOver || gameState.victory || !isPlayerSelected;
		toggle.disabled = !unlocked;

		if (abilityKey === gameState.selectedAbility && gameState.abilityPinned) {
			btn.classList.add("active");
		}

		btn.addEventListener("mouseenter", () => {
			gameState.hoveredAbility = abilityKey;
			if (gameState.activeScene) {
				gameState.activeScene.drawBoard();
			}
		});

		btn.addEventListener("mouseleave", () => {
			gameState.hoveredAbility = null;
			if (gameState.activeScene) {
				gameState.activeScene.drawBoard();
			}
		});

		btn.addEventListener("click", () => {
			if (gameState.abilityPinned) {
				if (gameState.selectedAbility === abilityKey) {
					gameState.abilityPinned = false;
				} else {
					gameState.selectedAbility = abilityKey;
					gameState.abilityPinned = true;
				}
			} else {
				gameState.selectedAbility = abilityKey;
				gameState.abilityPinned = true;
			}
			renderHud();
			if (gameState.activeScene) {
				gameState.activeScene.drawBoard();
			}
		});

		toggle.addEventListener("click", () => {
			gameState.openedPlayerAbilityInfo = gameState.openedPlayerAbilityInfo === abilityKey ? null : abilityKey;
			renderHud();
		});

		row.appendChild(btn);
		row.appendChild(toggle);
		wrapper.appendChild(row);

		const shouldShowDetails = gameState.openedPlayerAbilityInfo === abilityKey;
		if (shouldShowDetails) {
			const details = document.createElement("div");
			details.className = "ability-dropdown";
			const shownDamage = getDisplayedPlayerAbilityDamage(abilityKey, def.power);
			const damageLabel = shownDamage > 0 ? String(shownDamage) : "Utility";
			const configuredCooldown = typeof getConfiguredAbilityCooldownTurns === "function"
				? getConfiguredAbilityCooldownTurns(p, abilityKey)
				: (def.cooldownTurns || 0);
			details.innerHTML = [
				`<div><strong>Description:</strong> ${def.description || "No description yet."}</div>`,
				`<div><strong>Damage:</strong> ${damageLabel}</div>`,
				`<div><strong>Range:</strong> ${getAbilityRangeLabel(def)}</div>`,
				`<div><strong>Cooldown:</strong> ${configuredCooldown} turn${configuredCooldown === 1 ? "" : "s"}</div>`,
			].join("");
			wrapper.appendChild(details);
		}

		ui.playerAbilities.appendChild(wrapper);
	}

	ui.endTurn.disabled = !gameState.canAct || gameState.gameOver || gameState.victory;
	ui.undoMove.disabled = !gameState.canAct || gameState.gameOver || gameState.victory || !gameState.movedThisTurn;
	applyTurnLockedControlVisuals();
}

function showLevelUpModal() {
	gameState.canAct = false;
	const nextUnlock = getNextUnlock(gameState.player);
	ui.levelupText.textContent = `Choose one upgrade for level ${gameState.player.level}.`;
	ui.hpUpgrade.textContent = "+10% HP | +10% DMG";
	ui.abilityUpgrade.disabled = !nextUnlock;
	const nextDef = nextUnlock && typeof getPlayerAbilityDef === "function"
		? getPlayerAbilityDef(nextUnlock, gameState.player)
		: null;
	ui.abilityUpgrade.textContent = nextUnlock && nextDef ? `Unlock ${nextDef.name}` : "No ability unlock available";
	ui.levelupModal.classList.remove("hidden");
}

function closeLevelUpModal() {
	ui.levelupModal.classList.add("hidden");
	gameState.pendingLevelUps -= 1;
	if (gameState.pendingLevelUps > 0) {
		showLevelUpModal();
		return;
	}

	if (!gameState.gameOver && !gameState.victory) {
		gameState.canAct = true;
	}
	saveGame();
	renderHud();
}

ui.hpUpgrade.addEventListener("click", () => {
	const p = gameState.player;
	p.maxHp = Math.floor(p.maxHp * 1.1);
	p.hp = Math.min(p.maxHp, Math.floor(p.hp * 1.1));
	p.damageMultiplier = (typeof p.damageMultiplier === "number" && !Number.isNaN(p.damageMultiplier) ? p.damageMultiplier : 1) * 1.1;
	setMessage("Picked +10% HP and +10% DMG.", "ok");
	closeLevelUpModal();
});

ui.abilityUpgrade.addEventListener("click", () => {
	const p = gameState.player;
	const next = getNextUnlock(p);
	if (!next) {
		return;
	}
	const nextDef = typeof getPlayerAbilityDef === "function" ? getPlayerAbilityDef(next, p) : null;
	if (!nextDef) {
		setMessage("Missing ability definition for this character.", "danger");
		return;
	}
	p.unlockedAbilities.push(next);
	p.cooldowns[next] = typeof getConfiguredAbilityCooldownTurns === "function"
		? getConfiguredAbilityCooldownTurns(p, next)
		: (nextDef.cooldownTurns || 0);
	renderHud();
	setMessage(`${nextDef.name} unlocked.`, "ok");
	closeLevelUpModal();
});

ui.restart.addEventListener("click", () => {
	restartLevelFromHudAction();
});

ui.clearSave.addEventListener("click", () => {
	const confirmed = window.confirm("Are you sure you want to clear your entire saved data?");
	if (!confirmed) {
		setMessage("Clear data canceled.");
		return;
	}

	localStorage.removeItem(SAVE_KEY);
	setupNewRun(true);
	if (gameState.activeScene) {
		gameState.activeScene.scene.restart();
	}
	setMessage("Save cleared and fresh run started.", "ok");
});

ui.resultClose.addEventListener("click", () => {
	if (gameState.gameOver) {
		restartLevelFromHudAction();
		return;
	}
	closeMatchResultModal();
});

ui.endTurn.addEventListener("click", () => {
	endTurn();
	renderHud();
	if (gameState.activeScene) {
		gameState.activeScene.drawBoard();
	}
});

ui.undoMove.addEventListener("click", () => {
	undoMove();
	renderHud();
	if (gameState.activeScene) {
		gameState.activeScene.drawBoard();
	}
});
