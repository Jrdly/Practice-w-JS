function computeDamage(attackerAttack, targetDefense, power) {
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

	const def = abilityDefs[abilityKey];
	if (!def) {
		return false;
	}

	if (def.rangeType === "melee") {
		return isOrthAdjacent && dist === 1;
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
	if (basicKey && enemyAbilityDefs[basicKey]) {
		return enemyAbilityDefs[basicKey];
	}

	const type = enemyTypes[enemy.type];
	const fallbackBasic = (type?.abilities || []).find((key) => key.startsWith("basic"));
	if (fallbackBasic && enemyAbilityDefs[fallbackBasic]) {
		return enemyAbilityDefs[fallbackBasic];
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
	const def = abilityDefs.basic;
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

	if (!canHitTargetWithAbility(abilityKey, enemy)) {
		setMessage("Target is out of range for selected ability.", "danger");
		return;
	}

	const def = abilityDefs[abilityKey];
	const damage = computeDamage(p.attack, enemy.defense, getPlayerScaledPower(def.power));
	enemy.hp -= damage;
	showFloatingDamageAt(enemy.row, enemy.col, damage);
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
			const basicDamage = computeDamage(enemy.attack, gameState.player.defense, enemyBasic.power);
			const counterDamage = Math.floor(basicDamage / 2);
			gameState.player.hp -= counterDamage;
			showFloatingDamageAt(gameState.playerPos.row, gameState.playerPos.col, counterDamage);
			msg += ` Counterattack dealt ${counterDamage}.`;
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
		const def = enemyAbilityDefs[abilityKey];
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

	const actingEnemies = gameState.enemies.filter((enemy) => enemy.alive);
	let totalDamage = 0;

	function finalizeEnemyTurn() {
		if (gameState.player.hp <= 0) {
			gameState.player.hp = 0;
			gameState.gameOver = true;
			gameState.canAct = false;
			gameState.selectedUnit = null;
			gameState.movedThisTurn = false;
			discardPendingCombatXp();
			setMessage("Defeat. Restart level to try again.", "danger");
			showMatchResultModal("defeat");
		} else {
			gameState.canAct = true;
			gameState.selectedUnit = null;
			gameState.selectedEnemyId = null;
			gameState.selectedEnemyAbility = null;
			gameState.enemyAbilityPinned = false;
			gameState.openedEnemyAbilityInfo = null;
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
			moveEnemyTowardPlayer(enemy, Math.max(1, enemy.moveBudget || 1));
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
					const dmg = computeDamage(enemy.attack, gameState.player.defense, bestAbility.power);
					gameState.player.hp -= dmg;
					showFloatingDamageAt(gameState.playerPos.row, gameState.playerPos.col, dmg);
					totalDamage += dmg;
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
						const counterDef = abilityDefs.basic;
						const basicDamage = computeDamage(gameState.player.attack, enemy.defense, getPlayerScaledPower(counterDef.power));
						const counterDamage = Math.floor(basicDamage / 2);
						enemy.hp -= counterDamage;
						showFloatingDamageAt(enemy.row, enemy.col, counterDamage);
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
