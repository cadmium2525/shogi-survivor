import { PIECES } from './catalog.ts';
import { DIRECTIONS, isOnBoard, samePosition } from './moves.ts';
import { MAX_ON_BOARD } from './types.ts';
import type { Action, GameEvent, GameState, Piece, Side } from './types.ts';

export const otherSide = (side: Side): Side => side === 'ally' ? 'enemy' : 'ally';
export const clonePiece = (piece: Piece): Piece => ({ ...piece, position: { ...piece.position }, abilities: [...piece.abilities] });
export const hasShield = (piece: Piece): boolean => piece.abilities.includes('iron') && !piece.shieldUsed;
const name = (piece: Piece): string => `${piece.side === 'ally' ? '味方' : '敵'}の${PIECES[piece.type].label}`;

/** Collect every bracket from one board snapshot; converted pieces never start another scan. */
export function othelloTargets(pieces: Piece[], side: Side): Piece[] {
  const targets = new Map<string, Piece>();
  for (const origin of pieces.filter(piece => piece.side === side)) {
    for (const direction of DIRECTIONS) {
      const line: Piece[] = [];
      for (let step = 1; step < 5; step++) {
        const position = { x: origin.position.x + direction.x * step, y: origin.position.y + direction.y * step };
        if (!isOnBoard(position)) break;
        const occupant = pieces.find(piece => samePosition(piece.position, position));
        if (!occupant) break;
        if (occupant.side === side) {
          line.forEach(piece => targets.set(piece.id, piece));
          break;
        }
        if (occupant.type === 'king') break;
        line.push(occupant);
      }
    }
  }
  return [...targets.values()].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface MoveResolution { state: GameState; actor: Piece; captured: Piece | null }

/** Resolve shield/movement/capture → split → one global flip. No AI, turn switch, or winner check. */
export function resolveMove(source: GameState, action: Extract<Action, { type: 'move' }>, reason?: string): MoveResolution {
  const state: GameState = { ...source, pieces: source.pieces.map(clonePiece), relics: [...source.relics], eventLog: [...source.eventLog] };
  const actor = state.pieces.find(piece => piece.id === action.pieceId)!;
  const from = { ...actor.position };
  const to = { ...action.to };
  const target = state.pieces.find(piece => samePosition(piece.position, to));
  const base = { side: actor.side, halfTurn: state.halfTurn, pieceId: actor.id, from, to, reason };
  let captured: Piece | null = null;
  if (target && hasShield(target)) {
    target.shieldUsed = true;
    state.eventLog.push({ ...base, type: 'shieldBlocked', targetId: target.id,
      text: `${name(target)}の鉄壁が攻撃を防いだ。${name(actor)}は移動しない。` });
  } else {
    if (target) {
      captured = target;
      state.pieces = state.pieces.filter(piece => piece.id !== target.id);
      state.eventLog.push({ ...base, type: 'captured', targetId: target.id, text: `${name(actor)}が${name(target)}を捕獲。` });
    } else {
      state.eventLog.push({ ...base, type: 'moved', text: `${name(actor)}が${to.x + 1}列${to.y + 1}段へ移動。` });
    }
    actor.position = to;
    if (captured && actor.abilities.includes('split')
      && state.pieces.filter(piece => piece.side === actor.side).length < MAX_ON_BOARD
      && !state.pieces.some(piece => samePosition(piece.position, from))) {
      let id: string;
      do { id = `summon-${state.nextId++}`; } while (state.pieces.some(piece => piece.id === id));
      const pawn: Piece = { id, type: 'pawn', side: actor.side, position: { ...from }, abilities: [], shieldUsed: false, isSummoned: true };
      state.pieces.push(pawn);
      state.eventLog.push({ type: 'summoned', side: actor.side, halfTurn: state.halfTurn, pieceId: actor.id,
        targetId: pawn.id, to: { ...from }, text: `分裂！ 移動元に${name(pawn)}を召喚。` });
    }
  }
  if (state.relics.includes('othello')) {
    const room = Math.max(0, MAX_ON_BOARD - state.pieces.filter(piece => piece.side === actor.side).length);
    for (const flipped of othelloTargets(state.pieces, actor.side).slice(0, room)) {
      flipped.side = actor.side;
      const event: GameEvent = { type: 'flipped', side: actor.side, halfTurn: state.halfTurn,
        targetId: flipped.id, to: { ...flipped.position }, text: `オセロの法則！ ${PIECES[flipped.type].label}が${actor.side === 'ally' ? '味方' : '敵'}に反転。` };
      state.eventLog.push(event);
    }
  }
  return { state, actor, captured };
}
