// Enemy data quick template:
// enemyTypes.<typeKey> = {
//   name, maxHp, defense, moveBudget, range, killXp,
//   color: "colorName", abilities: ["abilityKey"],
//   abilityDefs: {
//     abilityKey: { name, rangeType, minRange, maxRange, power, description }
//   }
// }
// Notes:
// - Edit enemy colors with readable names in namedEnemyColors.
// - Edit enemy ability damage in abilityDefs.<abilityKey>.power.

const namedEnemyColors = {
	crimson: 0xff7777,
	amber: 0xffbc64,
	red: 0xff5555,
	orange: 0xffa84d,
	yellow: 0xffdf6b,
	green: 0x63d98a,
	blue: 0x63b6ff,
	purple: 0xc08bff,
	gray: 0x9aa3ad,
	white: 0xf0f3f7,
};

const enemyTypes = {
	melee: {
		name: "Bonk Bean",
		maxHp: 52,
		defense: 4,
		moveBudget: 2,
		range: 1,
		killXp: 12,
		color: "yellow",
		abilities: ["basic_melee"],
		abilityDefs: {
			basic_melee: {
				name: "Tiny Bonk",
				rangeType: "melee",
				minRange: 1,
				maxRange: 1,
				power: 7,
				description: "Lightly bonks anyone standing too close.",
			},
		},
	},
	ranged: {
		name: "Peashooter Pal",
		maxHp: 44,
		defense: 3,
		moveBudget: 1,
		range: 3,
		killXp: 14,
		color: "green",
		abilities: ["basic_ranged"],
		abilityDefs: {
			basic_ranged: {
				name: "Pebble Toss",
				rangeType: "ranged",
				minRange: 2,
				maxRange: 3,
				power: 8,
				description: "Flicks a tiny pebble that is somehow still annoying.",
			},
			special1: {
				name: "Double Pebble",
				rangeType: "ranged",
				minRange: 2,
				maxRange: 4,
				power: 12,
				description: "Throws two pebbles in a row like it practiced all week.",
			}
		},
	},
};
