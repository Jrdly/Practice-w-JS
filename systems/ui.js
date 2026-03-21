const ui = {
	stats: document.getElementById("stats"),
	abilities: document.getElementById("abilities"),
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
				attack: inspectionEnemy.attack,
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
		.map((key) => enemyAbilityDefs[key]?.name)
		.filter(Boolean);
	return {
		name: template.name,
		hp: enemy.hp,
		maxHp: enemy.maxHp,
		attack: enemy.attack,
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
	if (def.rangeType === "melee") {
		return "Melee (adjacent)";
	}
	const minRange = def.minRange || 2;
	const maxRange = def.maxRange || def.range || minRange;
	return `Ranged (${minRange}-${maxRange} tiles)`;
}

function getDisplayedPlayerAbilityDamage(basePower) {
	const multiplier = typeof gameState.player?.damageMultiplier === "number" && !Number.isNaN(gameState.player.damageMultiplier)
		? gameState.player.damageMultiplier
		: 1;
	return Math.max(1, Math.round(basePower * multiplier));
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

function showMatchResultModal(outcome) {
	if (!ui.resultModal) {
		return;
	}
	if (outcome === "defeat") {
		ui.resultTitle.textContent = "DEFEATED";
		ui.resultTitle.style.color = "#ffb4a5";
		ui.resultText.textContent = `XP so far: ${getCurrentXpLabel()}`;
		ui.resultClose.textContent = "Restart";
	} else {
		ui.resultTitle.textContent = "VICTORY";
		ui.resultTitle.style.color = "#b7d98f";
		ui.resultText.textContent = `XP so far: ${getCurrentXpLabel()}`;
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
	const isPlayerSelected = gameState.selectedUnit === "player";

	if (inspection?.kind === "player") {
		ui.stats.innerHTML = [
			`<div><strong>${p.name}</strong> Lv ${p.level}</div>`,
			`<div>HP: ${Math.floor(p.hp)} / ${Math.floor(p.maxHp)}</div>`,
			`<div>DEF: ${p.defense}%</div>`,
			`<div>XP: ${p.xpCurrent} / ${nextThreshold}</div>`,
		].join("");
	} else if (inspection?.kind === "enemy") {
		const enemy = getEnemySummary(inspection.enemy);
		ui.stats.innerHTML = [
			`<div><strong>${enemy.name} Enemy</strong></div>`,
			`<div>HP: ${Math.floor(enemy.hp)} / ${Math.floor(enemy.maxHp)}</div>`,
			`<div>DEF: ${enemy.defense}%</div>`,
		].join("");
	} else {
		ui.stats.innerHTML = [
			"<div><strong>No Unit Selected</strong></div>",
			"<div>Click your character to select them.</div>",
			"<div>Hover any unit to inspect stats and abilities.</div>",
		].join("");
	}

	ui.abilities.innerHTML = "";
	if (inspection?.kind === "enemy") {
		const enemy = inspection.enemy;
		const enemyAbilities = enemy.abilities || [];
		for (const abilityKey of enemyAbilities) {
			const def = enemyAbilityDefs[abilityKey];
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

			ui.abilities.appendChild(wrapper);
		}
		if (enemyAbilities.length === 0) {
			const btn = document.createElement("button");
			btn.textContent = "No enemy abilities";
			btn.disabled = true;
			ui.abilities.appendChild(btn);
		}
		ui.endTurn.disabled = !gameState.canAct || gameState.gameOver || gameState.victory;
		ui.undoMove.disabled = !gameState.canAct || gameState.gameOver || gameState.victory || !gameState.movedThisTurn;
		applyTurnLockedControlVisuals();
		return;
	}

	for (const abilityKey of ["basic", "special1", "special2", "ultimate"]) {
		const def = abilityDefs[abilityKey];
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
		btn.textContent = `${def.name}${onCd ? ` (${cd})` : ""}`;
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
			const shownDamage = getDisplayedPlayerAbilityDamage(def.power);
			details.innerHTML = [
				`<div><strong>Description:</strong> ${def.description || "No description yet."}</div>`,
				`<div><strong>Damage:</strong> ${shownDamage}</div>`,
				`<div><strong>Range:</strong> ${getAbilityRangeLabel(def)}</div>`,
				`<div><strong>Cooldown:</strong> ${def.cooldownTurns} turn${def.cooldownTurns === 1 ? "" : "s"}</div>`,
			].join("");
			wrapper.appendChild(details);
		}

		ui.abilities.appendChild(wrapper);
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
	ui.abilityUpgrade.textContent = nextUnlock ? `Unlock ${abilityDefs[nextUnlock].name}` : "No ability unlock available";
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
	p.unlockedAbilities.push(next);
	p.cooldowns[next] = abilityDefs[next].cooldownTurns;
	renderHud();
	setMessage(`${abilityDefs[next].name} unlocked.`, "ok");
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
