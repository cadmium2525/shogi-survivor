import { PIECES } from './catalog.ts';
import { createBattle } from './engine.ts';
import { getRewardChoices } from './rewards.ts';
import { getEnemies } from './stages.ts';
import { MAX_DEPLOYED, STAGE_COUNT } from './types.ts';
import type { GameState, InventoryPiece, Piece, Position, RunState } from './types.ts';

export function createRun(): RunState {
  return {
    version: 2, stageIndex: 0, inventory: [
      { id: 'ally-1', type: 'king', abilities: [], position: { x: 0, y: 3 } },
      { id: 'ally-2', type: 'pawn', abilities: [], position: { x: 0, y: 4 } },
    ], unlockedRelics: [], phase: 'prepare', rewardChoices: [], battle: null, victories: 0, nextId: 3,
  };
}

function sameSquare(a: Position | null, b: Position | null): boolean {
  return a === null ? b === null : b !== null && a.x === b.x && a.y === b.y;
}

export function placePiece(run: RunState, id: string, position: Position | null): RunState {
  if (run.phase !== 'prepare') return run;
  const piece = run.inventory.find((item) => item.id === id);
  if (!piece || (piece.type === 'king' && position === null) || sameSquare(piece.position, position)) return run;
  if (position !== null && (!Number.isInteger(position.x) || !Number.isInteger(position.y)
    || position.x < 0 || position.x > 4 || position.y < 3 || position.y > 4)) return run;
  const other = position === null ? undefined : run.inventory.find((item) => item.id !== id && sameSquare(item.position, position));
  if (other?.type === 'king' && piece.position === null) return run;
  if (piece.position === null && position !== null && !other
    && run.inventory.filter((item) => item.position !== null).length >= MAX_DEPLOYED) return run;
  return { ...run, inventory: run.inventory.map((item) => item.id === id
    ? { ...item, position: position === null ? null : { ...position } }
    : item.id === other?.id ? { ...item, position: piece.position === null ? null : { ...piece.position } } : item) };
}

export function startBattle(run: RunState): RunState {
  if (run.phase !== 'prepare') return run;
  const allies: Piece[] = run.inventory.filter((piece) => piece.position !== null).map((piece) => ({
    id: piece.id, type: piece.type, side: 'ally', position: { ...piece.position! },
    abilities: [...piece.abilities], shieldUsed: false, isSummoned: false,
  }));
  if (!allies.some((piece) => piece.type === 'king') || allies.length > MAX_DEPLOYED) return run;
  return { ...run, phase: 'battle', rewardChoices: [],
    battle: createBattle(allies, getEnemies(run.stageIndex), [...run.unlockedRelics]) };
}

export function finishBattle(run: RunState, battle: GameState): RunState {
  if (run.phase !== 'battle' || battle.phase !== 'finished') return run;
  if (battle.winner !== 'ally') return { ...run, phase: 'defeat', battle, rewardChoices: [] };
  const unlockedRelics = run.stageIndex >= 1 && !run.unlockedRelics.includes('othello')
    ? [...run.unlockedRelics, 'othello' as const] : run.unlockedRelics;
  // Even the boss awards a mandatory new piece before the run is marked complete.
  return { ...run, phase: 'reward', battle, victories: run.victories + 1, unlockedRelics,
    rewardChoices: getRewardChoices(run.stageIndex) };
}

function findDeployment(inventory: InventoryPiece[]): Position | null {
  if (inventory.filter((piece) => piece.position !== null).length >= MAX_DEPLOYED) return null;
  for (const y of [3, 4]) for (const x of [1, 3, 2, 0, 4]) {
    if (!inventory.some((piece) => sameSquare(piece.position, { x, y }))) return { x, y };
  }
  return null;
}

export function selectReward(run: RunState, rewardId: string): RunState {
  if (run.phase !== 'reward') return run;
  const reward = run.rewardChoices.find((choice) => choice.id === rewardId);
  if (!reward) return run;
  const inventory = [...run.inventory, { id: `ally-${run.nextId}`, type: reward.type,
    abilities: [...reward.abilities], position: findDeployment(run.inventory) }];
  const complete = run.stageIndex === STAGE_COUNT - 1;
  return { ...run, inventory, nextId: run.nextId + 1, stageIndex: complete ? run.stageIndex : run.stageIndex + 1,
    phase: complete ? 'victory' : 'prepare', rewardChoices: [], battle: complete ? run.battle : null };
}

export function autoArrange(run: RunState): RunState {
  if (run.phase !== 'prepare') return run;
  if (run.inventory.length === 2) return { ...run, inventory: run.inventory.map((piece) => ({ ...piece,
    position: piece.type === 'king' ? { x: 0, y: 3 } : { x: 0, y: 4 } })) };
  const supports = run.inventory.filter((piece) => piece.type !== 'king').sort((a, b) =>
    PIECES[b.type].value + b.abilities.length * 2 - PIECES[a.type].value - a.abilities.length * 2
    || a.id.localeCompare(b.id, 'en')).slice(0, MAX_DEPLOYED - 1);
  const positions: Position[] = [{ x: 1, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 3 }, { x: 0, y: 3 }, { x: 4, y: 3 }];
  return { ...run, inventory: run.inventory.map((piece) => ({ ...piece,
    position: piece.type === 'king' ? { x: 2, y: 4 } : supports.includes(piece)
      ? supports.length === 1 ? { x: 2, y: 3 } : { ...positions[supports.indexOf(piece)] } : null })) };
}
