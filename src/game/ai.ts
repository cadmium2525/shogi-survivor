import { getPieceInfo } from './catalog.ts';
import { hasShield, otherSide, resolveMove } from './effects.ts';
import { legalMoves, samePosition } from './moves.ts';
import type { Action, ActionDecision, GameState, Piece, Position, Side } from './types.ts';

const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const distance = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const material = (pieces: Piece[], side: Side): number => pieces.filter(piece => piece.side === side)
  .reduce((sum, piece) => sum + (piece.type === 'king' ? 0 : getPieceInfo(piece).value) * 200 + piece.abilities.length * 25, 0);

/** Sorted legal actions across the whole army, with a forced pass only if all are blocked. */
export function enumerateActions(state: GameState): Action[] {
  if (state.phase === 'finished') return [];
  const actions: Action[] = state.pieces.filter(piece => piece.side === state.activeSide)
    .sort((a, b) => compareId(a.id, b.id))
    .flatMap(piece => legalMoves(piece, state.pieces).map(to => ({ type: 'move' as const, pieceId: piece.id, to })));
  return actions.length ? actions : [{ type: 'pass' }];
}

function positionValue(pieces: Piece[], side: Side): number {
  const king = pieces.find(piece => piece.side === side && piece.type === 'king');
  const enemyKing = pieces.find(piece => piece.side !== side && piece.type === 'king');
  let value = 0;
  for (const piece of pieces.filter(candidate => candidate.side === side)) {
    const advance = side === 'ally' ? 4 - piece.position.y : piece.position.y;
    switch (piece.type) {
      case 'pawn':
        if (piece.promoted) {
          // A tokin has reached the front: use its new sideways/backward moves to close a net.
          if (enemyKing) value -= distance(piece.position, enemyKing.position) * 12;
          value += legalMoves(piece, pieces).length * 2;
        } else value += advance * 18 - Math.abs(piece.position.x - 2) * 3;
        break;
      case 'gold':
        if (king) value -= distance(piece.position, king.position) * 10;
        value += advance * 5;
        break;
      case 'rook': {
        const moves = legalMoves(piece, pieces);
        value += moves.length * 4;
        if (enemyKing && moves.some(to => samePosition(to, enemyKing.position))) value += 100;
        break;
      }
      case 'king':
        // Direct capture danger is handled separately; an otherwise safe king escorts the army.
        value += advance * 8;
        value -= Math.abs(piece.position.x - 2);
        break;
    }
    if (enemyKing && piece.type !== 'king') value -= distance(piece.position, enemyKing.position) * 5;
  }
  if (enemyKing) {
    let safeEscapes = 0;
    for (const to of legalMoves(enemyKing, pieces)) {
      const destination = pieces.find(piece => samePosition(piece.position, to));
      // Capturing our king wins immediately, so a defended king square is still a valid escape.
      if (destination?.side === side && destination.type === 'king') { safeEscapes++; continue; }
      const after = pieces.filter(piece => piece.id !== destination?.id).map(piece => piece.id === enemyKing.id
        ? { ...piece, position: to } : piece);
      const attacked = after.some(piece => piece.side === side && legalMoves(piece, after).some(square => samePosition(square, to)));
      if (!attacked) safeEscapes++;
    }
    value -= safeEscapes * 30;
  }
  return value;
}

function bestOpponentCapture(state: GameState, side: Side): { value: number; kingRisk: boolean; shieldRisk: boolean } {
  let best = 0;
  let kingRisk = false;
  let shieldRisk = false;
  for (const opponent of state.pieces.filter(piece => piece.side !== side)) {
    for (const to of legalMoves(opponent, state.pieces)) {
      const target = state.pieces.find(piece => piece.side === side && samePosition(piece.position, to));
      if (!target) continue;
      if (target.type === 'king') {
        if (hasShield(target)) { shieldRisk = true; best = Math.max(best, 300); }
        else kingRisk = true;
      }
      const before = material(state.pieces, side) - material(state.pieces, otherSide(side));
      const result = resolveMove({ ...state, activeSide: otherSide(side), halfTurn: state.halfTurn + 1 },
        { type: 'move', pieceId: opponent.id, to }).state;
      const opposingKing = result.pieces.find(piece => piece.side !== side && piece.type === 'king');
      if (target.type !== 'king' && opposingKing && !hasShield(opposingKing)
        && result.pieces.some(piece => piece.side === side && legalMoves(piece, result.pieces)
          .some(destination => samePosition(destination, opposingKing.position)))) continue;
      const after = material(result.pieces, side) - material(result.pieces, otherSide(side));
      const combo = !hasShield(target) && opponent.abilities.includes('combo') ? 80 : 0;
      best = Math.max(best, before - after + combo);
    }
  }
  return { value: best, kingRisk, shieldRisk };
}

/** One-ply capture-risk evaluation, shared symmetrically by both armies. No random source. */
export function chooseAction(state: GameState): ActionDecision {
  const actions = enumerateActions(state);
  if (!actions.length || actions[0].type === 'pass') {
    return { action: { type: 'pass' }, score: 0, reason: state.phase === 'finished' ? '戦闘は終了しています。' : '全軍に合法手がないためパス。' };
  }
  const side = state.activeSide;
  const initialMaterial = material(state.pieces, side) - material(state.pieces, otherSide(side));
  const initialPosition = positionValue(state.pieces, side);
  const initialKingRisk = bestOpponentCapture(state, side).kingRisk;
  let best: ActionDecision | null = null;
  for (const action of actions) {
    if (action.type === 'pass') continue;
    const moving = state.pieces.find(piece => piece.id === action.pieceId)!;
    const target = state.pieces.find(piece => samePosition(piece.position, action.to));
    const resolution = resolveMove({ ...state, halfTurn: state.halfTurn + 1 }, action);
    const next = resolution.state;
    if (!next.pieces.some(piece => piece.side !== side && piece.type === 'king')) {
      return { action, score: 1_000_000_000, reason: '最優先：敵王をこの一手で捕獲。' };
    }
    const captureRisk = bestOpponentCapture(next, side);
    const gain = material(next.pieces, side) - material(next.pieces, otherSide(side)) - initialMaterial;
    const position = positionValue(next.pieces, side) - initialPosition;
    let score = gain + position - captureRisk.value * 1.1;
    if (captureRisk.kingRisk) score -= 100_000_000;
    if (initialKingRisk && !captureRisk.kingRisk) score += 100_000;
    if (captureRisk.shieldRisk) score -= 200;
    if (target && hasShield(target)) score += target.type === 'king' ? 4_000 : getPieceInfo(target).value * 30;
    if (resolution.captured && moving.abilities.includes('combo') && !state.pendingExtraAction) score += 120;
    const visits = state.eventLog.filter(event => event.pieceId === moving.id
      && (event.type === 'moved' || event.type === 'captured') && event.to && samePosition(event.to, action.to)).length;
    score -= visits * 12;
    const previous = [...state.eventLog].reverse().find(event => event.pieceId === moving.id
      && (event.type === 'moved' || event.type === 'captured'));
    if (previous?.from && samePosition(previous.from, action.to)) score -= 10;
    const role = moving.type === 'king' ? '王の安全' : moving.type === 'gold' ? `${getPieceInfo(moving).label}の護衛`
      : moving.type === 'pawn' && moving.promoted ? 'と金の追い込み'
      : moving.type === 'rook' ? `${getPieceInfo(moving).label}の射線` : '歩の前進';
    const reasons = [captureRisk.kingRisk ? '自王が直後に捕獲される危険' : initialKingRisk ? '自王への脅威を除去' : '自王の即時捕獲を回避',
      resolution.captured ? `${getPieceInfo(resolution.captured).label}を捕獲` : target && hasShield(target) ? '鉄壁を消費させる' : role,
      ...(!moving.promoted && resolution.actor.promoted ? [`${getPieceInfo(resolution.actor).name}へ成る`] : []),
      `戦力変化${gain >= 0 ? '+' : ''}${gain}・位置${position >= 0 ? '+' : ''}${position}・相手の最良捕獲${Math.round(captureRisk.value)}`];
    const decision: ActionDecision = { action, score: Math.round(score * 100) / 100, reason: reasons.join('／') };
    // Actions are already sorted by ID, then y, then x. Equal scores keep the first.
    if (!best || decision.score > best.score) best = decision;
  }
  return best!;
}
