import { MAX_DEPLOYED, MAX_HALF_TURNS, MAX_ON_BOARD } from './types.ts';
import type { RunState } from './types.ts';

export const SAVE_KEY = 'shogi-survivor-save-v2';
const TYPES = ['king', 'pawn', 'gold', 'rook'];
const ABILITIES = ['iron', 'combo', 'split'];
const PHASES = ['prepare', 'battle', 'reward', 'victory', 'defeat'];
const EVENTS = ['moved', 'captured', 'shieldBlocked', 'summoned', 'flipped', 'extraAction', 'passed', 'won', 'lost', 'limit'];
type Data = Record<string, unknown>;
const object = (value: unknown): value is Data => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number'
  && Number.isInteger(value) && value >= min && value <= max;
const string = (value: unknown, max = 128): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const position = (value: unknown, deploy = false): boolean => object(value)
  && integer(value.x, 0, 4) && integer(value.y, deploy ? 3 : 0, 4);
const abilities = (value: unknown): boolean => Array.isArray(value) && value.length <= 3
  && new Set(value).size === value.length && value.every((item) => ABILITIES.includes(item));
const relics = (value: unknown): boolean => Array.isArray(value) && value.length <= 1 && value.every((item) => item === 'othello');
const uniqueIds = (items: Data[]): boolean => new Set(items.map((item) => item.id)).size === items.length;
const uniqueSquares = (items: Data[]): boolean => {
  const squares = items.flatMap((item) => object(item.position) ? [`${item.position.x},${item.position.y}`] : []);
  return new Set(squares).size === squares.length;
};

function validRun(value: unknown): value is RunState {
  if (!object(value) || value.version !== 2 || !integer(value.stageIndex, 0, 4) || !PHASES.includes(value.phase as string)
    || !integer(value.victories, 0, 5) || !integer(value.nextId, 3, 8) || !relics(value.unlockedRelics)
    || !Array.isArray(value.inventory) || value.inventory.length < 2 || value.inventory.length > 7) return false;
  const inventory: Data[] = [];
  for (const piece of value.inventory) {
    if (!object(piece) || !string(piece.id) || !/^ally-[1-7]$/.test(piece.id)
      || Number(piece.id.slice(5)) >= value.nextId || !TYPES.includes(piece.type as string) || !abilities(piece.abilities)
      || !(piece.position === null || position(piece.position, true))) return false;
    inventory.push(piece);
  }
  if (!uniqueIds(inventory) || !uniqueSquares(inventory) || inventory.length !== value.nextId - 1
    || inventory.filter((piece) => piece.type === 'king').length !== 1
    || inventory.some((piece) => piece.type === 'king' && piece.position === null)
    || inventory.filter((piece) => piece.position !== null).length > MAX_DEPLOYED) return false;
  const expectedVictories = value.phase === 'reward' || value.phase === 'victory' ? value.stageIndex + 1 : value.stageIndex;
  if (value.victories !== expectedVictories || value.phase === 'victory' && value.stageIndex !== 4
    || inventory.length !== (value.phase === 'victory' ? 7 : value.stageIndex + 2)
    || (value.unlockedRelics as unknown[]).includes('othello') !== (value.victories >= 2)) return false;
  if (!Array.isArray(value.rewardChoices) || value.rewardChoices.length !== (value.phase === 'reward' ? 3 : 0)) return false;
  const choices: Data[] = [];
  for (const choice of value.rewardChoices) {
    if (!object(choice) || !string(choice.id) || !['pawn', 'gold', 'rook'].includes(choice.type as string)
      || !abilities(choice.abilities) || !string(choice.title, 120) || !string(choice.description, 2000)) return false;
    choices.push(choice);
  }
  if (!uniqueIds(choices) || new Set(choices.map((choice) => choice.type)).size !== choices.length) return false;
  if (value.phase === 'prepare') return value.battle === null;
  const battle = value.battle;
  if (!object(battle) || !['battle', 'finished'].includes(battle.phase as string)
    || !['ally', 'enemy'].includes(battle.activeSide as string) || !integer(battle.halfTurn, 0, MAX_HALF_TURNS)
    || !integer(battle.consecutivePasses, 0, 2) || typeof battle.pendingExtraAction !== 'boolean'
    || !relics(battle.relics) || !integer(battle.nextId, 0, 1000000)
    || !Array.isArray(battle.pieces) || battle.pieces.length > 16) return false;
  const pieces: Data[] = [];
  for (const piece of battle.pieces) {
    if (!object(piece) || !string(piece.id) || !TYPES.includes(piece.type as string)
      || !['ally', 'enemy'].includes(piece.side as string) || !position(piece.position) || !abilities(piece.abilities)
      || typeof piece.shieldUsed !== 'boolean' || typeof piece.isSummoned !== 'boolean') return false;
    pieces.push(piece);
  }
  if (!uniqueIds(pieces) || !uniqueSquares(pieces)
    || pieces.filter((piece) => piece.side === 'ally').length > MAX_ON_BOARD
    || pieces.filter((piece) => piece.side === 'enemy').length > MAX_ON_BOARD) return false;
  const allyKings = pieces.filter((piece) => piece.type === 'king' && piece.side === 'ally').length;
  const enemyKings = pieces.filter((piece) => piece.type === 'king' && piece.side === 'enemy').length;
  if (battle.phase === 'battle') {
    if (battle.winner !== null || battle.endReason !== null || allyKings !== 1 || enemyKings !== 1) return false;
  } else {
    if (!['ally', 'enemy'].includes(battle.winner as string)
      || !['kingCaptured', 'turnLimit', 'mutualPass'].includes(battle.endReason as string)) return false;
    if (battle.endReason === 'kingCaptured') {
      if (battle.winner === 'ally' ? allyKings !== 1 || enemyKings !== 0 : enemyKings !== 1 || allyKings !== 0) return false;
    } else if (battle.winner !== 'enemy' || allyKings !== 1 || enemyKings !== 1) return false;
  }
  if (!Array.isArray(battle.eventLog) || battle.eventLog.length > 2000) return false;
  for (const event of battle.eventLog) {
    if (!object(event) || !EVENTS.includes(event.type as string) || !['ally', 'enemy'].includes(event.side as string)
      || !integer(event.halfTurn, 0, MAX_HALF_TURNS) || !string(event.text, 2000)
      || !(event.reason === undefined || string(event.reason, 2000))
      || !(event.pieceId === undefined || string(event.pieceId)) || !(event.targetId === undefined || string(event.targetId))
      || !(event.from === undefined || position(event.from)) || !(event.to === undefined || position(event.to))) return false;
  }
  if (battle.lastDecision !== null) {
    const decision = battle.lastDecision;
    if (!object(decision) || typeof decision.score !== 'number' || !Number.isFinite(decision.score)
      || !string(decision.reason, 2000) || !object(decision.action)
      || !(decision.action.type === 'pass' || decision.action.type === 'move'
        && string(decision.action.pieceId) && position(decision.action.to))) return false;
  }
  if (value.phase === 'reward' || value.phase === 'victory') {
    if (battle.phase !== 'finished' || battle.winner !== 'ally') return false;
  } else if (value.phase === 'defeat' && (battle.phase !== 'finished' || battle.winner !== 'enemy')) return false;
  return true;
}

export function saveRun(run: RunState): boolean {
  try {
    if (!validRun(run)) return false;
    const data = JSON.stringify(run);
    if (data.length > 250000) return false;
    globalThis.localStorage.setItem(SAVE_KEY, data);
    return true;
  } catch { return false; }
}

export function loadRun(): RunState | null {
  try {
    const data = globalThis.localStorage.getItem(SAVE_KEY);
    if (!data || data.length > 250000) return null;
    const value: unknown = JSON.parse(data);
    return validRun(value) ? value : null;
  } catch { return null; }
}

export function clearSave(): void {
  try { globalThis.localStorage.removeItem(SAVE_KEY); } catch { /* Browsing mode may disable storage. */ }
}
