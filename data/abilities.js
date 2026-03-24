const abilityDefs = {
	basic: {
		name: "Lava Eruption",
		rangeType: "ranged",
		minRange: 1,
		maxRange: 2,
		cooldownTurns: 0,
		power: 15,
		description: "A short burst of lava that erupts under the target.",
	},
	special1: {
		name: "Evade (Taunt)",
		rangeType: "self",
		cooldownTurns: 2,
		power: 0,
		durationTurns: 1,
		description: "Evade all incoming damage and taunt enemies for 1 turn.",
	},
	special2: {
		name: "Gravity",
		rangeType: "ranged",
		minRange: 1,
		maxRange: 3,
		cooldownTurns: 3,
		power: 0,
		durationTurns: 2,
		radius: 2,
		description: "Creates a gravity field: affected enemies can move at most 1 tile for 2 turns.",
	},
	ultimate: {
		name: "AOE Fire",
		rangeType: "ranged",
		minRange: 1,
		maxRange: 4,
		cooldownTurns: 4,
		power: 12,
		durationTurns: 5,
		radius: 2,
		description: "Ignites a 2-tile radius area; enemies inside take 12 damage each enemy turn for 5 turns.",
	},
};

// Legacy fallback retained for compatibility. Enemy ability tuning now lives in data/enemies.js.
const enemyAbilityDefs = {};
