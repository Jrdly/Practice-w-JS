const enemyTypes = {
	melee: {
		name: "Melee",
		maxHp: 70,
		attack: 14,
		defense: 8,
		moveBudget: 2,
		range: 1,
		killXp: 20,
		color: 0xff7777,
		abilities: ["basic_melee"],
	},
	ranged: {
		name: "Ranged",
		maxHp: 55,
		attack: 16,
		defense: 5,
		moveBudget: 1,
		range: 3,
		killXp: 25,
		color: 0xffbc64,
		abilities: ["basic_ranged"],
	},
};
