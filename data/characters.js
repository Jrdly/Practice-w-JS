// Character data quick template:
// characterTemplates.<key> = {
//   id, name, maxHp, hp, defense, damageMultiplier, moveBudget,
//   level, xpCurrent, xpThresholds, thresholdIndex,
//   unlockedAbilities: ["basic", "special1", "special2", "ultimate"],
//   abilityBasePowers: { basic, special1, special2, ultimate },
//   abilityCooldownTurns: { basic, special1, special2, ultimate },
//   cooldowns: { special1, special2, ultimate }
// }
// Notes:
// - Edit starting ability damage in abilityBasePowers.
// - Edit per-character cooldown turns in abilityCooldownTurns.

const defaultXpThresholds = [
	100, 150, 200, 250, 300, 350, 400, 450, 500, 550,
	600, 650, 700, 750, 800, 850, 900, 950, 1000, 1050,
	1100, 1150, 1200, 1250, 1300, 1350, 1400, 1450, 1500, 1550,
	1600, 1650, 1700, 1750, 1800, 1850, 1900, 1950, 2000,
];

// Character templates are the source-of-truth roster data.
// New player-controlled characters can be added here without changing gameplay code.
const characterTemplates = {
	leon: {
		id: "balanced",
		name: "Leon",
		maxHp: 100,
		hp: 100,
		defense: 10,
		damageMultiplier: 1,
		moveBudget: 3,
		level: 1,
		xpCurrent: 0,
		xpThresholds: [...defaultXpThresholds],
		thresholdIndex: 0,
		unlockedAbilities: ["basic"],
		abilityBasePowers: {
			basic: 15,
			special1: 0,
			special2: 0,
			ultimate: 12,
		},
		abilityCooldownTurns: {
			basic: 0,
			special1: 2,
			special2: 3,
			ultimate: 4,
		},
		cooldowns: { special1: 0, special2: 0, ultimate: 0 },
	},
	loyd: {
		id: "tank",
		name: "Loyd",
		maxHp: 150,
		hp: 150,
		defense: 20,
		damageMultiplier: 1,
		moveBudget: 3,
		level: 1,
		xpCurrent: 0,
		xpThresholds: [...defaultXpThresholds],
		thresholdIndex: 0,
		unlockedAbilities: ["basic"],
		abilityBasePowers: {
			basic: 20,
			special1: 32,
			special2: 34,
			ultimate: 50,
		},
		abilityCooldownTurns: {
			basic: 0,
			special1: 1,
			special2: 2,
			ultimate: 3,
		},
		cooldowns: { special1: 0, special2: 0, ultimate: 0 },
	},
	andreol: {
		id: "dps",
		name: "Andreol",
		maxHp: 80,
		hp: 80,
		defense: 8,
		damageMultiplier: 1,
		moveBudget: 4,
		level: 1,
		xpCurrent: 0,
		xpThresholds: [...defaultXpThresholds],
		thresholdIndex: 0,
		unlockedAbilities: ["basic"],
		abilityBasePowers: {
			basic: 16,
			special1: 24,
			special2: 40,
			ultimate: 56,
		},
		abilityCooldownTurns: {
			basic: 0,
			special1: 1,
			special2: 2,
			ultimate: 3,
		},
		cooldowns: { special1: 0, special2: 0, ultimate: 0 },
	},
	Jamiel: {
		id: "support",
		name: "Jamiel",
		maxHp: 120,
		hp: 120,
		defense: 5,
		damageMultiplier: 1,
		moveBudget: 2,
		level: 1,
		xpCurrent: 0,
		xpThresholds: [...defaultXpThresholds],
		thresholdIndex: 0,
		unlockedAbilities: ["basic"],
		abilityBasePowers: {
			basic: 19,
			special1: 35,
			special2: 30,
			ultimate: 58,
		},
		abilityCooldownTurns: {
			basic: 0,
			special1: 1,
			special2: 2,
			ultimate: 3,
		},
		cooldowns: { special1: 0, special2: 0, ultimate: 0 },
	},
	gelo: {
		id: "control",
		name: "Gelo",
		maxHp: 60,
		hp: 60,
		defense: 3,
		damageMultiplier: 1,
		moveBudget: 2,
		level: 1,
		xpCurrent: 0,
		xpThresholds: [...defaultXpThresholds],
		thresholdIndex: 0,
		unlockedAbilities: ["basic"],
		abilityBasePowers: {
			basic: 18,
			special1: 30,
			special2: 38,
			ultimate: 60,
		},
		abilityCooldownTurns: {
			basic: 0,
			special1: 1,
			special2: 2,
			ultimate: 3,
		},
		cooldowns: { special1: 0, special2: 0, ultimate: 0 },
	},
};

const playableCharacterIds = Object.keys(characterTemplates);

function getCharacterTemplateById(characterId) {
	if (!characterId || !characterTemplates[characterId]) {
		return characterTemplates.leon;
	}
	return characterTemplates[characterId];
}

// Backward compatibility: current game flow still reads from baseCharacter.
// Keep this alias until the runtime is migrated to choose from characterTemplates directly.
const baseCharacter = getCharacterTemplateById("leon");
