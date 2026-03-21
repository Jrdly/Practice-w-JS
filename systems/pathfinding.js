function orthogonalNeighbors(row, col) {
	return [
		{ row: row - 1, col, cost: 1 },
		{ row: row + 1, col, cost: 1 },
		{ row, col: col - 1, cost: 1 },
		{ row, col: col + 1, cost: 1 },
		{ row: row - 1, col: col - 1, cost: 2 },
		{ row: row - 1, col: col + 1, cost: 2 },
		{ row: row + 1, col: col - 1, cost: 2 },
		{ row: row + 1, col: col + 1, cost: 2 },
	].filter((n) => n.row >= 0 && n.row < GRID_ROWS && n.col >= 0 && n.col < GRID_COLS);
}

function tileKey(row, col) {
	return `${row},${col}`;
}

function isOccupiedByEnemy(row, col) {
	return gameState.enemies.some((e) => e.alive && e.row === row && e.col === col);
}

function weightedDistance(aRow, aCol, bRow, bCol) {
	const rowDiff = Math.abs(aRow - bRow);
	const colDiff = Math.abs(aCol - bCol);
	const diagonalSteps = Math.min(rowDiff, colDiff);
	const straightSteps = Math.max(rowDiff, colDiff) - diagonalSteps;
	return diagonalSteps * 2 + straightSteps;
}

function getReachableTiles(startRow, startCol, budget) {
	const dist = new Map();
	const visited = new Set();
	const queue = [{ row: startRow, col: startCol, cost: 0 }];
	dist.set(tileKey(startRow, startCol), 0);

	while (queue.length > 0) {
		queue.sort((a, b) => a.cost - b.cost);
		const current = queue.shift();
		const cKey = tileKey(current.row, current.col);

		if (visited.has(cKey)) {
			continue;
		}
		visited.add(cKey);

		for (const n of orthogonalNeighbors(current.row, current.col)) {
			if (isOccupiedByEnemy(n.row, n.col)) {
				continue;
			}

			const nextCost = current.cost + n.cost;
			if (nextCost > budget) {
				continue;
			}

			const nKey = tileKey(n.row, n.col);
			const prev = dist.has(nKey) ? dist.get(nKey) : Infinity;
			if (nextCost < prev) {
				dist.set(nKey, nextCost);
				queue.push({ row: n.row, col: n.col, cost: nextCost });
			}
		}
	}

	return dist;
}

function nearestOrthStepToward(fromRow, fromCol, targetRow, targetCol) {
	const candidates = [
		{ row: fromRow - 1, col: fromCol },
		{ row: fromRow + 1, col: fromCol },
		{ row: fromRow, col: fromCol - 1 },
		{ row: fromRow, col: fromCol + 1 },
	].filter((p) => p.row >= 0 && p.row < GRID_ROWS && p.col >= 0 && p.col < GRID_COLS);

	let best = null;
	let bestScore = Infinity;
	for (const c of candidates) {
		if (isOccupiedByEnemy(c.row, c.col)) {
			continue;
		}
		if (c.row === gameState.playerPos.row && c.col === gameState.playerPos.col) {
			continue;
		}
		const score = weightedDistance(c.row, c.col, targetRow, targetCol);
		if (score < bestScore) {
			best = c;
			bestScore = score;
		}
	}
	return best;
}
