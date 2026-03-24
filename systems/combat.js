function computeDamage(targetDefense, power) {
	const rawDamage = power;
	const defensePct = Math.max(0, Math.min(95, targetDefense)) / 100;
	const reducedDamage = rawDamage * (1 - defensePct);
	return Math.max(1, Math.round(reducedDamage));
}

function getPlayerScaledPower(basePower) {
	const multiplier = typeof gameState.player?.damageMultiplier === "number" && !Number.isNaN(gameState.player.damageMultiplier)
		? gameState.player.damageMultiplier
		: 1;
	return basePower * Math.max(0, multiplier);
}

function canHitTargetWithAbility(abilityKey, enemy) {
	const dist = weightedDistance(gameState.playerPos.row, gameState.playerPos.col, enemy.row, enemy.col);
	const isOrthAdjacent =
		(Math.abs(gameState.playerPos.row - enemy.row) === 1 && gameState.playerPos.col === enemy.col) ||
		(Math.abs(gameState.playerPos.col - enemy.col) === 1 && gameState.playerPos.row === enemy.row);

	const def = typeof getPlayerAbilityDef === "function" ? getPlayerAbilityDef(abilityKey) : null;
	if (!def) {
		return false;
	}

	if (def.rangeType === "melee") {
		return isOrthAdjacent && dist === 1;
	}

	if (def.rangeType === "self") {
		return false;
	}

	const minRange = def.minRange || 2;
	const maxRange = def.maxRange || def.range || 4;
	return dist >= minRange && dist <= maxRange;
}

function getEnemyBasicAbilityDef(enemy) {
	if (!enemy) {
		return null;
	}
	const basicKey = (enemy.abilities || []).find((key) => key.startsWith("basic"));
	if (basicKey) {
		const basicDef = typeof getEnemyAbilityDef === "function" ? getEnemyAbilityDef(enemy, basicKey) : null;
		if (basicDef) {
			return basicDef;
		}
	}

	const type = enemyTypes[enemy.type];
	const fallbackBasic = (type?.abilities || []).find((key) => key.startsWith("basic"));
	if (fallbackBasic) {
		const fallbackDef = typeof getEnemyAbilityDef === "function" ? getEnemyAbilityDef(enemy, fallbackBasic) : null;
		if (fallbackDef) {
			return fallbackDef;
		}
	}

	return null;
}

function canEnemyBasicHitPlayer(enemy) {
	const def = getEnemyBasicAbilityDef(enemy);
	if (!def) {
		return false;
	}

	const dist = weightedDistance(enemy.row, enemy.col, gameState.playerPos.row, gameState.playerPos.col);
	const isOrthAdjacent = enemyCanMelee(enemy);
	if (def.rangeType === "melee") {
		return isOrthAdjacent && dist === 1;
	}

	const minRange = def.minRange || 2;
	const maxRange = def.maxRange || def.range || 3;
	return dist >= minRange && dist <= maxRange;
}

function canPlayerBasicHitEnemy(enemy) {
	const def = typeof getPlayerAbilityDef === "function" ? getPlayerAbilityDef("basic") : null;
	if (!def || !enemy || !enemy.alive) {
		return false;
	}

	const dist = weightedDistance(gameState.playerPos.row, gameState.playerPos.col, enemy.row, enemy.col);
	const isOrthAdjacent =
		(Math.abs(gameState.playerPos.row - enemy.row) === 1 && gameState.playerPos.col === enemy.col) ||
		(Math.abs(gameState.playerPos.col - enemy.col) === 1 && gameState.playerPos.row === enemy.row);

	if (def.rangeType === "melee") {
		return isOrthAdjacent && dist === 1;
	}

	const minRange = def.minRange || 2;
	const maxRange = def.maxRange || def.range || 4;
	return dist >= minRange && dist <= maxRange;
}

function shakeOnHit(duration = 120, intensity = 0.0045) {
	const scene = gameState.activeScene;
	if (!scene || !scene.cameras || !scene.cameras.main) {
		return;
	}
	scene.cameras.main.shake(duration, intensity);
}

function playAttackHitSfx(attacker) {
	if (typeof playAttackSfx !== "function") {
		return;
	}
	playAttackSfx(attacker);
}

function getEnemiesInAoeRadius(centerRow, centerCol, radius) {
	const safeRadius = Math.max(0, Math.floor(radius || 0));
	return gameState.enemies.filter((enemy) => {
		if (!enemy.alive) {
			return false;
		}
		const rowDelta = Math.abs(enemy.row - centerRow);
		const colDelta = Math.abs(enemy.col - centerCol);
		return rowDelta <= safeRadius && colDelta <= safeRadius;
	});
}

function getEnemyDebuff(enemyId) {
	if (!gameState.enemyDebuffsById) {
		gameState.enemyDebuffsById = {};
	}
	if (!gameState.enemyDebuffsById[enemyId]) {
		gameState.enemyDebuffsById[enemyId] = { gravityTurns: 0 };
	}
	return gameState.enemyDebuffsById[enemyId];
}

function getEffectiveEnemyMoveBudget(enemy) {
	const base = Math.max(1, Math.floor(enemy.moveBudget || 1));
	const debuff = getEnemyDebuff(enemy.id);
	if ((debuff.gravityTurns || 0) > 0) {
		return 1;
	}
	return base;
}

function applyGravityField(centerRow, centerCol, radius, durationTurns) {
	const affectedEnemies = getEnemiesInAoeRadius(centerRow, centerCol, radius);
	const turns = Math.max(1, Math.floor(durationTurns || 1));
	for (const enemy of affectedEnemies) {
		const debuff = getEnemyDebuff(enemy.id);
		debuff.gravityTurns = Math.max(debuff.gravityTurns || 0, turns);
	}
	return affectedEnemies.length;
}

function addFireZone(centerRow, centerCol, radius, tickDamage, durationTurns) {
	if (!Array.isArray(gameState.fireZones)) {
		gameState.fireZones = [];
	}
	gameState.fireZones.push({
		centerRow,
		centerCol,
		radius: Math.max(0, Math.floor(radius || 0)),
		tickDamage: Math.max(1, Math.floor(tickDamage || 1)),
		turnsRemaining: Math.max(1, Math.floor(durationTurns || 1)),
	});
}

function tickFireZonesAtEnemyTurnStart() {
	if (!Array.isArray(gameState.fireZones) || gameState.fireZones.length === 0) {
		return { damage: 0, defeated: 0 };
	}

	let totalDamage = 0;
	let totalDefeated = 0;

	for (const zone of gameState.fireZones) {
		const targets = getEnemiesInAoeRadius(zone.centerRow, zone.centerCol, zone.radius);
		for (const enemy of targets) {
			enemy.hp -= zone.tickDamage;
			totalDamage += zone.tickDamage;
			showFloatingDamageAt(enemy.row, enemy.col, zone.tickDamage);
			if (enemy.hp <= 0) {
				enemy.alive = false;
				enemy.hp = 0;
				totalDefeated += 1;
				if (gameState.selectedEnemyId === enemy.id) {
					gameState.selectedEnemyId = null;
					gameState.selectedEnemyAbility = null;
					gameState.enemyAbilityPinned = false;
					gameState.openedEnemyAbilityInfo = null;
				}
				gainXp(enemy.killXp);
			}
		}
		zone.turnsRemaining -= 1;
	}

	gameState.fireZones = gameState.fireZones.filter((zone) => zone.turnsRemaining > 0);
	return { damage: totalDamage, defeated: totalDefeated };
}

function decrementStatusesAtEnemyTurnEnd() {
	if (gameState.playerStatus) {
		gameState.playerStatus.evadeTurns = Math.max(0, (gameState.playerStatus.evadeTurns || 0) - 1);
		gameState.playerStatus.tauntTurns = Math.max(0, (gameState.playerStatus.tauntTurns || 0) - 1);
	}

	for (const debuff of Object.values(gameState.enemyDebuffsById || {})) {
		debuff.gravityTurns = Math.max(0, (debuff.gravityTurns || 0) - 1);
	}
}

function resolvePlayerSelfCastAbility() {
	if (!gameState.canAct || gameState.gameOver || gameState.victory) {
		return;
	}
	if (gameState.selectedUnit !== "player") {
		setMessage("Select your character before using that ability.", "danger");
		return;
	}

	const abilityKey = gameState.selectedAbility;
	if (abilityKey !== "special1") {
		setMessage("That ability requires a target.", "danger");
		return;
	}

	const p = gameState.player;
	if (!p.unlockedAbilities.includes(abilityKey)) {
		setMessage("That ability is still locked.", "danger");
		return;
	}
	if ((p.cooldowns[abilityKey] || 0) > 0) {
		setMessage("That ability is on cooldown.", "danger");
		return;
	}

	const def = typeof getPlayerAbilityDef === "function" ? getPlayerAbilityDef(abilityKey, p) : null;
	if (!def) {
		setMessage("Ability definition missing for this character.", "danger");
		return;
	}
	const duration = Math.max(1, Math.floor(def.durationTurns || 1));
	gameState.playerStatus.evadeTurns = duration;
	gameState.playerStatus.tauntTurns = duration;

	decrementCooldowns(abilityKey);
	applyAbilityCooldown(abilityKey);
	beginEnemyPhase(`${def.name} activated. Leon will evade attacks and taunt enemies this turn.`, abilityKey);
}

function resolvePlayerAttack(enemy) {
	if (!gameState.canAct || gameState.gameOver || gameState.victory) {
		return;
	}
	if (gameState.selectedUnit !== "player") {
		setMessage("Select your character before attacking.");
		return;
	}

	const abilityKey = gameState.selectedAbility;
	const p = gameState.player;
	if (!p.unlockedAbilities.includes(abilityKey)) {
		setMessage("That ability is still locked.", "danger");
		return;
	}

	if ((p.cooldowns[abilityKey] || 0) > 0) {
		setMessage("That ability is on cooldown.", "danger");
		return;
	}

	if (abilityKey === "special1") {
		setMessage("Evade + Taunt is self-cast. Click Leon to activate it.");
		return;
	}

	if (!canHitTargetWithAbility(abilityKey, enemy)) {
		setMessage("Target is out of range for selected ability.", "danger");
		return;
	}

	const def = typeof getPlayerAbilityDef === "function" ? getPlayerAbilityDef(abilityKey, p) : null;
	if (!def) {
		setMessage("Ability definition missing for this character.", "danger");
		return;
	}

	if (abilityKey === "special2") {
		const affectedCount = applyGravityField(
			enemy.row,
			enemy.col,
			Math.max(0, Math.floor(def.radius || 2)),
			Math.max(1, Math.floor(def.durationTurns || 2)),
		);
		decrementCooldowns(abilityKey);
		applyAbilityCooldown(abilityKey);
		beginEnemyPhase(`${def.name} locked ${affectedCount} enemy${affectedCount === 1 ? "" : "ies"} to 1-tile movement.`, abilityKey);
		return;
	}

	if (abilityKey === "ultimate") {
		const fireDamage = typeof getConfiguredAbilityPower === "function"
			? getConfiguredAbilityPower(p, abilityKey)
			: def.power;
		addFireZone(
			enemy.row,
			enemy.col,
			Math.max(0, Math.floor(def.radius || 2)),
			fireDamage,
			Math.max(1, Math.floor(def.durationTurns || 5)),
		);
		decrementCooldowns(abilityKey);
		applyAbilityCooldown(abilityKey);
		beginEnemyPhase(`${def.name} ignites the area. Enemies inside will burn each enemy turn.`, abilityKey);
		return;
	}

	const basePower = typeof getConfiguredAbilityPower === "function"
		? getConfiguredAbilityPower(p, abilityKey)
		: def.power;
	const damage = computeDamage(enemy.defense, getPlayerScaledPower(basePower));
	enemy.hp -= damage;
	showFloatingDamageAt(enemy.row, enemy.col, damage);
	shakeOnHit();
	playAttackHitSfx("player");
	gainXp(xpForDamage(damage));

	let msg = `${def.name} hit ${enemy.type} enemy for ${damage}.`;
	if (enemy.hp <= 0) {
		enemy.alive = false;
		enemy.hp = 0;
		if (gameState.selectedEnemyId === enemy.id) {
			gameState.selectedEnemyId = null;
			gameState.selectedEnemyAbility = null;
			gameState.enemyAbilityPinned = false;
			gameState.openedEnemyAbilityInfo = null;
		}
		const bonus = enemy.killXp;
		gainXp(bonus);
		msg += ` Enemy defeated (+${bonus} XP).`;
	}

	decrementCooldowns(abilityKey);
	applyAbilityCooldown(abilityKey);

	const finishPlayerAttackStep = () => {
		if (gameState.player.hp <= 0) {
			gameState.player.hp = 0;
			gameState.gameOver = true;
			gameState.canAct = false;
			gameState.selectedUnit = null;
			gameState.movedThisTurn = false;
			discardPendingCombatXp();
			setMessage("Defeat. Restart level to try again.", "danger");
			saveGame();
			setTimeout(() => {
				renderHud();
				if (gameState.activeScene) {
					gameState.activeScene.requestBoardRedraw();
				}
				showMatchResultModal("defeat");
			}, FLOATING_DAMAGE_FADE_MS);
			return;
		}

		if (gameState.enemies.every((e) => !e.alive)) {
			gameState.victory = true;
			gameState.canAct = false;
			gameState.selectedUnit = null;
			gameState.movedThisTurn = false;
			commitPendingCombatXp();
			setMessage("Level clear. You defeated all enemies.", "ok");
			saveGame();
			setTimeout(() => {
				renderHud();
				if (gameState.activeScene) {
					gameState.activeScene.drawBoard();
				}
				showMatchResultModal("victory");
			}, FLOATING_DAMAGE_FADE_MS);
			return;
		}

		beginEnemyPhase(`${msg} Enemy turn starts.`, abilityKey);
	};

	// Counterattack: defender can retaliate with basic attack only, from current position only.
	if (enemy.alive && canEnemyBasicHitPlayer(enemy)) {
		setTimeout(() => {
			const enemyBasic = getEnemyBasicAbilityDef(enemy);
			const basicDamage = computeDamage(gameState.player.defense, enemyBasic.power);
			const counterDamage = Math.floor(basicDamage / 2);
			const evadeActive = (gameState.playerStatus?.evadeTurns || 0) > 0;
			const appliedCounterDamage = evadeActive ? 0 : counterDamage;
			gameState.player.hp -= appliedCounterDamage;
			if (appliedCounterDamage > 0) {
				showFloatingDamageAt(gameState.playerPos.row, gameState.playerPos.col, appliedCounterDamage);
			}
			shakeOnHit();
			playAttackHitSfx("enemy");
			msg += evadeActive ? " Counterattack was evaded." : ` Counterattack dealt ${appliedCounterDamage}.`;
			renderHud();
			if (gameState.activeScene) {
				gameState.activeScene.requestBoardRedraw();
			}
			finishPlayerAttackStep();
		}, ENEMY_MOVE_TO_ATTACK_DELAY_MS);
		return;
	}

	finishPlayerAttackStep();
}

function enemyCanMelee(enemy) {
	const orthAdj =
		(Math.abs(enemy.row - gameState.playerPos.row) === 1 && enemy.col === gameState.playerPos.col) ||
		(Math.abs(enemy.col - gameState.playerPos.col) === 1 && enemy.row === gameState.playerPos.row);
	return orthAdj;
}

function getBestEnemyAbilityInRange(enemy) {
	const dist = weightedDistance(enemy.row, enemy.col, gameState.playerPos.row, gameState.playerPos.col);
	const isOrthAdjacent = enemyCanMelee(enemy);
	let best = null;

	for (const abilityKey of enemy.abilities || []) {
		const def = typeof getEnemyAbilityDef === "function" ? getEnemyAbilityDef(enemy, abilityKey) : null;
		if (!def) {
			continue;
		}
		const inRange = def.rangeType === "melee"
			? isOrthAdjacent && dist === 1
			: dist >= (def.minRange || 2) && dist <= (def.maxRange || def.range || 3);
		if (!inRange) {
			continue;
		}
		if (!best || def.power > best.power) {
			best = def;
		}
	}

	return best;
}

function moveEnemyTowardPlayer(enemy, maxSteps) {
	for (let stepCount = 0; stepCount < maxSteps; stepCount += 1) {
		if (getBestEnemyAbilityInRange(enemy)) {
			break;
		}
		const step = nearestOrthStepToward(enemy.row, enemy.col, gameState.playerPos.row, gameState.playerPos.col);
		if (!step) {
			break;
		}
		enemy.row = step.row;
		enemy.col = step.col;
	}
}

function runEnemyTurn() {
	if (gameState.victory || gameState.gameOver) {
		return;
	}

	const fireTick = tickFireZonesAtEnemyTurnStart();
	if (fireTick.damage > 0) {
		renderHud();
		if (gameState.activeScene) {
			gameState.activeScene.requestBoardRedraw();
		}
	}

	const actingEnemies = gameState.enemies.filter((enemy) => enemy.alive);
	let totalDamage = 0;

	function finalizeEnemyTurn() {
		decrementStatusesAtEnemyTurnEnd();

		if (gameState.player.hp <= 0) {
			gameState.player.hp = 0;
			gameState.gameOver = true;
			gameState.canAct = false;
			gameState.selectedUnit = null;
			gameState.movedThisTurn = false;
			discardPendingCombatXp();
			setMessage("Defeat. Restart level to try again.", "danger");
			showMatchResultModal("defeat");
		} else if (gameState.enemies.every((enemy) => !enemy.alive)) {
			gameState.victory = true;
			gameState.canAct = false;
			gameState.selectedUnit = null;
			gameState.movedThisTurn = false;
			commitPendingCombatXp();
			setMessage("Level clear. You defeated all enemies.", "ok");
			saveGame();
			setTimeout(() => {
				renderHud();
				if (gameState.activeScene) {
					gameState.activeScene.requestBoardRedraw();
				}
				showMatchResultModal("victory");
			}, FLOATING_DAMAGE_FADE_MS);
			return;
		} else {
			gameState.canAct = true;
			gameState.selectedUnit = null;
			gameState.abilityPinned = false;
			gameState.turnStartPos = { ...gameState.playerPos };
			gameState.movedThisTurn = false;
			showTurnBanner("YOUR TURN", "#b8ffd0");
			setMessage(totalDamage > 0 ? `Enemies dealt ${totalDamage} total damage.` : "Enemy turn ended.");
		}

		setTimeout(() => {
			saveGame();
			renderHud();
			if (gameState.activeScene) {
				gameState.activeScene.drawBoard();
			}
		}, FLOATING_DAMAGE_FADE_MS);
	}

	function processEnemyAt(index) {
		if (index >= actingEnemies.length || gameState.player.hp <= 0) {
			finalizeEnemyTurn();
			return;
		}

		const enemy = actingEnemies[index];
		if (!enemy.alive) {
			setTimeout(() => processEnemyAt(index + 1), ENEMY_NEXT_ACTION_DELAY_MS);
			return;
		}

		const fromRow = enemy.row;
		const fromCol = enemy.col;
		const hadAbilityBeforeMove = Boolean(getBestEnemyAbilityInRange(enemy));
		if (!hadAbilityBeforeMove) {
			moveEnemyTowardPlayer(enemy, getEffectiveEnemyMoveBudget(enemy));
		}
		const toRow = enemy.row;
		const toCol = enemy.col;

		const continueAfterMove = () => {
			renderHud();
			if (gameState.activeScene) {
				gameState.activeScene.requestBoardRedraw();
			}

			setTimeout(() => {
				if (gameState.player.hp <= 0 || gameState.gameOver || gameState.victory) {
					finalizeEnemyTurn();
					return;
				}

				const bestAbility = getBestEnemyAbilityInRange(enemy);
				if (bestAbility) {
					const dmg = computeDamage(gameState.player.defense, bestAbility.power);
					const evadeActive = (gameState.playerStatus?.evadeTurns || 0) > 0;
					const appliedDamage = evadeActive ? 0 : dmg;
					gameState.player.hp -= appliedDamage;
					if (appliedDamage > 0) {
						showFloatingDamageAt(gameState.playerPos.row, gameState.playerPos.col, appliedDamage);
					}
					shakeOnHit();
					playAttackHitSfx("enemy");
					totalDamage += appliedDamage;
					renderHud();
				}

				const continueEnemyStepAfterCounterWindow = () => {
					if (gameState.enemies.every((e) => !e.alive)) {
						gameState.victory = true;
						gameState.canAct = false;
						gameState.selectedUnit = null;
						gameState.movedThisTurn = false;
						commitPendingCombatXp();
						setMessage("Level clear. You defeated all enemies.", "ok");
						saveGame();
						setTimeout(() => {
							renderHud();
							if (gameState.activeScene) {
								gameState.activeScene.requestBoardRedraw();
							}
							showMatchResultModal("victory");
						}, FLOATING_DAMAGE_FADE_MS);
						return;
					}

					if (gameState.player.hp <= 0) {
						finalizeEnemyTurn();
						return;
					}

					setTimeout(() => {
						if (gameState.activeScene) {
							gameState.activeScene.requestBoardRedraw();
						}
						processEnemyAt(index + 1);
					}, ENEMY_NEXT_ACTION_DELAY_MS);
				};

				// Counterattack: defender can retaliate with basic attack only, from current position only.
				if (enemy.alive && gameState.player.hp > 0 && canPlayerBasicHitEnemy(enemy)) {
					setTimeout(() => {
						const counterDef = typeof getPlayerAbilityDef === "function" ? getPlayerAbilityDef("basic", gameState.player) : null;
						if (!counterDef) {
							continueEnemyStepAfterCounterWindow();
							return;
						}
						const basicBasePower = typeof getConfiguredAbilityPower === "function"
							? getConfiguredAbilityPower(gameState.player, "basic")
							: counterDef.power;
						const basicDamage = computeDamage(enemy.defense, getPlayerScaledPower(basicBasePower));
						const counterDamage = Math.floor(basicDamage / 2);
						enemy.hp -= counterDamage;
						showFloatingDamageAt(enemy.row, enemy.col, counterDamage);
						shakeOnHit();
						playAttackHitSfx("player");
						gainXp(xpForDamage(counterDamage));
						if (enemy.hp <= 0) {
							enemy.alive = false;
							enemy.hp = 0;
							if (gameState.selectedEnemyId === enemy.id) {
								gameState.selectedEnemyId = null;
								gameState.selectedEnemyAbility = null;
								gameState.enemyAbilityPinned = false;
								gameState.openedEnemyAbilityInfo = null;
							}
							gainXp(enemy.killXp);
						}
						renderHud();
						if (gameState.activeScene) {
							gameState.activeScene.requestBoardRedraw();
						}
						continueEnemyStepAfterCounterWindow();
					}, ENEMY_MOVE_TO_ATTACK_DELAY_MS);
					return;
				}

				continueEnemyStepAfterCounterWindow();
			}, ENEMY_MOVE_TO_ATTACK_DELAY_MS);
		};

		if (gameState.activeScene && (fromRow !== toRow || fromCol !== toCol)) {
			const animated = gameState.activeScene.animateEnemyMovement(enemy.id, fromRow, fromCol, toRow, toCol, continueAfterMove);
			if (animated) {
				return;
			}
		}

		continueAfterMove();
	}

	processEnemyAt(0);
}
