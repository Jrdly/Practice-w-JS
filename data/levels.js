// Level data quick template:
// levelsById.<levelId> = {
//   id, name,
//   playerCharacterIds: ["all"] or ["leon", "mira", ...],
//   enemies: [
//     {
//       type, row, col,
//       // Optional overrides for unique enemies:
//       // id, name, hp, maxHp, defense, moveBudget, range, killXp,
//       // color, abilities, abilityDefs
//     }
//   ]
// }

const levelsById = {
	level_1: {
		id: "level_1",
		name: "Level 1",
		playerCharacterIds: ["all"],
		enemies: [
			{ type: "melee", row: 1, col: 6 },
			{ type: "ranged", row: 3, col: 8 },
		],
	},
};

const levelOrder = ["level_1"];
const defaultLevelId = levelOrder[0];

// Backward compatibility for existing runtime references.
const level1 = levelsById.level_1;
