import { describe, expect, it } from 'vitest';
import { chooseAction } from '../src/game/ai.ts';
import { getPieceInfo } from '../src/game/catalog.ts';
import { applyAction, createBattle, runBattle, stepBattle } from '../src/game/engine.ts';
import { isPromotionZone, legalMoves, samePosition } from '../src/game/moves.ts';
import type { Ability, GameState, Piece, PieceType, Side } from '../src/game/types.ts';

const piece = (id: string, type: PieceType, side: Side, x: number, y: number, promoted = false, abilities: Ability[] = []): Piece =>
  ({ id, type, side, position: { x, y }, abilities, promoted, shieldUsed: false, isSummoned: false });
const ak = () => piece('ak', 'king', 'ally', 0, 4);
const ek = () => piece('ek', 'king', 'enemy', 4, 0);
const move = (s: GameState, pieceId: string, x: number, y: number) => applyAction(s, { type: 'move', pieceId, to: { x, y } });
const at = (s: GameState, id: string) => s.pieces.find(p => p.id === id)!;
const types = (s: GameState) => s.eventLog.filter(e => e.halfTurn === s.halfTurn).map(e => e.type);

describe('promotion movement and automatic timing', () => {
  it('uses only the opponent outermost rank as the promotion zone', () => {
    expect(isPromotionZone('ally', { x: 2, y: 0 })).toBe(true);
    expect(isPromotionZone('ally', { x: 2, y: 1 })).toBe(false);
    expect(isPromotionZone('enemy', { x: 2, y: 4 })).toBe(true);
    expect(isPromotionZone('enemy', { x: 2, y: 3 })).toBe(false);
  });
  it('moves a promoted pawn exactly like a gold for either side', () => {
    for (const side of ['ally', 'enemy'] as const) {
      const pawn = piece('p', 'pawn', side, 2, 2, true);
      const gold = piece('g', 'gold', side, 2, 2);
      expect(legalMoves(pawn, [pawn])).toEqual(legalMoves(gold, [gold]));
      expect(legalMoves(pawn, [pawn])).toHaveLength(6);
    }
  });
  it('adds exactly one diagonal step to a dragon while keeping rook blockers', () => {
    const dragon = piece('r', 'rook', 'ally', 2, 2, true);
    const pieces = [dragon, piece('friend', 'pawn', 'ally', 1, 1),
      piece('enemy', 'gold', 'enemy', 3, 3), piece('wall', 'pawn', 'ally', 2, 1)];
    const moves = legalMoves(dragon, pieces);
    expect(moves).toContainEqual({ x: 3, y: 3 });
    expect(moves).toContainEqual({ x: 1, y: 3 });
    expect(moves).not.toContainEqual({ x: 1, y: 1 });
    expect(moves).not.toContainEqual({ x: 0, y: 0 });
    expect(moves).not.toContainEqual({ x: 4, y: 4 });
    expect(moves).not.toContainEqual({ x: 2, y: 0 });
    expect(moves).toContainEqual({ x: 4, y: 2 });
  });
  it('auto-promotes an allied pawn entering the zone without spending another half-turn', () => {
    const source = createBattle([ak(), piece('p', 'pawn', 'ally', 2, 1)], [ek()]);
    const next = move(source, 'p', 2, 0);
    expect(at(next, 'p')).toMatchObject({ id: 'p', type: 'pawn', side: 'ally', promoted: true });
    expect(types(next)).toEqual(['moved', 'promoted']);
    expect(next).toMatchObject({ halfTurn: 1, activeSide: 'enemy', pendingExtraAction: false });
    expect(next.eventLog.every(event => event.halfTurn === 1)).toBe(true);
    expect(next.eventLog.at(-1)!.text).toContain('と金');
    expect(at(source, 'p').promoted).toBe(false);
  });
  it('auto-promotes an enemy pawn entering its opposite zone', () => {
    const source = createBattle([ak()], [ek(), piece('p', 'pawn', 'enemy', 2, 3)]);
    const next = move({ ...source, activeSide: 'enemy' }, 'p', 2, 4);
    expect(at(next, 'p').promoted).toBe(true);
    expect(getPieceInfo(at(next, 'p')).name).toBe('と金');
    expect(next.eventLog.at(-1)).toMatchObject({ type: 'promoted', side: 'enemy', pieceId: 'p' });
  });
  it('promotes a rook moving from the zone as well as into the zone', () => {
    const from = createBattle([ak(), piece('r', 'rook', 'ally', 2, 0)], [ek()]);
    expect(at(move(from, 'r', 2, 2), 'r').promoted).toBe(true);
    const into = createBattle([ak(), piece('r', 'rook', 'ally', 2, 2)], [ek()]);
    expect(at(move(into, 'r', 2, 0), 'r').promoted).toBe(true);
  });
  it('does not promote moves outside the zone or king and gold moves into it', () => {
    const pawn = createBattle([ak(), piece('p', 'pawn', 'ally', 2, 2)], [ek()]);
    expect(at(move(pawn, 'p', 2, 1), 'p').promoted).toBe(false);
    for (const type of ['king', 'gold'] as const) {
      const actor = piece('actor', type, 'ally', 2, 1);
      const source = createBattle(type === 'king' ? [actor] : [ak(), actor], [ek()]);
      expect(move(source, 'actor', 2, 0).eventLog.some(e => e.type === 'promoted')).toBe(false);
    }
  });
  it('does not promote shield-blocked attacks even when the destination or origin is in zone', () => {
    for (const [fromY, toY] of [[2, 0], [0, 2]]) {
      const source = createBattle([ak(), piece('r', 'rook', 'ally', 2, fromY)],
        [ek(), piece('shield', 'gold', 'enemy', 2, toY, false, ['iron'])]);
      const next = move(source, 'r', 2, toY);
      expect(at(next, 'r').position.y).toBe(fromY);
      expect(at(next, 'r').promoted).toBe(false);
      expect(types(next)).toEqual(['shieldBlocked']);
    }
  });
  it('promotes once and preserves identity, side, abilities, and spent shield', () => {
    const source = createBattle([ak(), piece('r', 'rook', 'ally', 2, 2, false, ['iron', 'split'])], [ek()]);
    at(source, 'r').shieldUsed = true;
    const next = move(source, 'r', 2, 0);
    expect(at(next, 'r')).toMatchObject({ id: 'r', type: 'rook', side: 'ally', promoted: true,
      shieldUsed: true, abilities: ['iron', 'split'] });
    const continued = move({ ...next, activeSide: 'ally' }, 'r', 2, 1);
    expect(types(continued)).toEqual(['moved']);
    expect(continued.eventLog.filter(e => e.type === 'promoted')).toHaveLength(1);
    expect(continued.eventLog.at(-1)!.text).toContain('龍');
  });
  it('retains supplied promotion fixtures and treats missing legacy flags as unpromoted', () => {
    const promoted = piece('r', 'rook', 'ally', 2, 2, true);
    const legacy = { ...piece('p', 'pawn', 'ally', 1, 3) };
    delete legacy.promoted;
    const source = createBattle([ak(), promoted, legacy], [ek()]);
    expect(at(source, 'r').promoted).toBe(true);
    expect(Boolean(at(source, 'p').promoted)).toBe(false);
    expect(legalMoves(at(source, 'p'), source.pieces)).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('promotion, capture abilities, and Othello interactions', () => {
  it('orders capture then promotion then split then capture-only extra action', () => {
    const source = createBattle([ak(), piece('r', 'rook', 'ally', 2, 2, false, ['split', 'combo'])],
      [ek(), piece('target', 'gold', 'enemy', 2, 0)]);
    const next = move(source, 'r', 2, 0);
    expect(types(next)).toEqual(['captured', 'promoted', 'summoned', 'extraAction']);
    expect(next).toMatchObject({ halfTurn: 1, activeSide: 'ally', pendingExtraAction: true });
    const summoned = next.pieces.find(p => p.isSummoned)!;
    expect(summoned).toMatchObject({ type: 'pawn', promoted: false, position: { x: 2, y: 2 }, abilities: [] });
  });
  it('force-promotes a pawn split on its own last rank immediately after summoning', () => {
    const source = createBattle([ak(), piece('r', 'rook', 'ally', 2, 0, false, ['split'])],
      [ek(), piece('target', 'gold', 'enemy', 2, 2)]);
    const next = move(source, 'r', 2, 2);
    const pawn = next.pieces.find(p => p.isSummoned)!;
    expect(types(next)).toEqual(['captured', 'promoted', 'summoned', 'promoted']);
    expect(pawn).toMatchObject({ type: 'pawn', side: 'ally', promoted: true, position: { x: 2, y: 0 }, abilities: [] });
    expect(legalMoves(pawn, next.pieces).length).toBeGreaterThan(0);
    expect(next.eventLog.at(-1)!.pieceId).toBe(pawn.id);
  });
  it('uses the same mandatory split-pawn promotion at the enemy bottom rank', () => {
    const source = createBattle([ak(), piece('target', 'gold', 'ally', 2, 2)],
      [ek(), piece('r', 'rook', 'enemy', 2, 4, false, ['split'])]);
    const next = move({ ...source, activeSide: 'enemy' }, 'r', 2, 2);
    expect(next.pieces.find(p => p.isSummoned)).toMatchObject({ type: 'pawn', side: 'enemy', promoted: true, position: { x: 2, y: 4 } });
    expect(types(next)).toEqual(['captured', 'promoted', 'summoned', 'promoted']);
  });
  it('force-promotes a reflected pawn stranded on its new side last rank without restoring shields', () => {
    const source = createBattle([ak(), piece('a', 'gold', 'ally', 0, 0), piece('b', 'gold', 'ally', 2, 0)],
      [ek(), piece('p', 'pawn', 'enemy', 1, 0, false, ['iron', 'combo'])], ['othello']);
    at(source, 'p').shieldUsed = true;
    const next = move(source, 'ak', 1, 4);
    expect(types(next)).toEqual(['moved', 'flipped', 'promoted']);
    expect(at(next, 'p')).toMatchObject({ id: 'p', side: 'ally', type: 'pawn', promoted: true,
      shieldUsed: true, abilities: ['iron', 'combo'] });
    expect(next.halfTurn).toBe(1);
  });
  it('keeps reflected pawns unpromoted outside the new zone and follows the new forward direction', () => {
    const source = createBattle([ak(), piece('a', 'gold', 'ally', 0, 1), piece('b', 'gold', 'ally', 2, 1)],
      [ek(), piece('p', 'pawn', 'enemy', 1, 1)], ['othello']);
    const next = move(source, 'ak', 1, 4), pawn = at(next, 'p');
    expect(pawn.promoted).toBe(false);
    expect(legalMoves(pawn, next.pieces)).toEqual([{ x: 1, y: 0 }]);
  });
  it('retains existing tokin and dragon promotion across reflection without emitting promotion again', () => {
    for (const type of ['pawn', 'rook'] as const) {
      const source = createBattle([ak(), piece('a', 'gold', 'ally', 0, 1), piece('b', 'gold', 'ally', 2, 1)],
        [ek(), piece('p', type, 'enemy', 1, 1, true, ['iron'])], ['othello']);
      const next = move(source, 'ak', 1, 4), converted = at(next, 'p');
      expect(converted).toMatchObject({ type, side: 'ally', promoted: true, abilities: ['iron'] });
      expect(types(next)).toEqual(['moved', 'flipped']);
      expect(legalMoves(converted, next.pieces)).toContainEqual({ x: 1, y: 2 });
      if (type === 'pawn') expect(legalMoves(converted, next.pieces)).not.toContainEqual({ x: 0, y: 2 });
      else expect(legalMoves(converted, next.pieces)).toContainEqual({ x: 0, y: 2 });
    }
  });
  it('does not promote a merely reflected rook until it makes a real move from its new zone', () => {
    const source = createBattle([ak(), piece('a', 'gold', 'ally', 0, 0), piece('b', 'gold', 'ally', 2, 0)],
      [ek(), piece('r', 'rook', 'enemy', 1, 0)], ['othello']);
    const flipped = move(source, 'ak', 1, 4);
    expect(at(flipped, 'r').promoted).toBe(false);
    expect(types(flipped)).toEqual(['moved', 'flipped']);
    const moved = move({ ...flipped, activeSide: 'ally' }, 'r', 1, 1);
    expect(at(moved, 'r').promoted).toBe(true);
  });
  it('still resolves promotion before a king-capture victory on half-turn 80', () => {
    const source = createBattle([ak(), piece('p', 'pawn', 'ally', 2, 1, false, ['combo'])],
      [piece('ek', 'king', 'enemy', 2, 0)]);
    const next = move({ ...source, halfTurn: 79 }, 'p', 2, 0);
    expect(types(next)).toEqual(['captured', 'promoted', 'won']);
    expect(next).toMatchObject({ winner: 'ally', endReason: 'kingCaptured', halfTurn: 80, pendingExtraAction: false });
  });
});

describe('promotion-aware deterministic AI', () => {
  it('resolves a former king-and-pawn patrol through promotion and deterministic king capture', () => {
    // A legal opening that previously exhausted 80 half-turns. Keep the real army IDs:
    // they are part of the documented deterministic tie-breaking rules.
    const source = createBattle([piece('ally-1', 'king', 'ally', 0, 3), piece('ally-2', 'pawn', 'ally', 1, 3)],
      [piece('enemy-1-1', 'king', 'enemy', 0, 0), piece('enemy-1-2', 'pawn', 'enemy', 0, 1)]);
    const ending = runBattle(source);
    expect(ending).toMatchObject({ phase: 'finished', winner: 'ally', endReason: 'kingCaptured' });
    expect(ending.halfTurn).toBeLessThan(80);
    expect(ending.eventLog.some(event => event.type === 'promoted' && event.pieceId === 'ally-2')).toBe(true);
    expect(runBattle(structuredClone(source))).toEqual(ending);
    expect(source.halfTurn).toBe(0);
    expect(at(source, 'ally-2').promoted).toBe(false);
  });
  it('values safe promotion ahead of an ordinary pawn capture and explains the choice', () => {
    const source = createBattle([ak(), piece('promote', 'pawn', 'ally', 2, 1), piece('capture', 'pawn', 'ally', 0, 3)],
      [ek(), piece('target', 'pawn', 'enemy', 0, 2)]);
    const decision = chooseAction(source);
    expect(decision.action).toEqual({ type: 'move', pieceId: 'promote', to: { x: 2, y: 0 } });
    expect(decision.reason).toContain('と金へ成る');
    expect(chooseAction({ ...source, pieces: [...source.pieces].reverse() })).toEqual(decision);
  });
  it('keeps immediate king capture above promotion value', () => {
    const source = createBattle([ak(), piece('promote', 'pawn', 'ally', 2, 1), piece('capture', 'pawn', 'ally', 0, 3)],
      [piece('ek', 'king', 'enemy', 0, 2)]);
    expect(chooseAction(source).action).toEqual({ type: 'move', pieceId: 'capture', to: { x: 0, y: 2 } });
  });
  it('prioritizes escaping a direct king capture over an otherwise valuable promotion', () => {
    const source = createBattle([ak(), piece('promote', 'pawn', 'ally', 2, 1)],
      [ek(), piece('r', 'rook', 'enemy', 0, 0)]);
    const next = stepBattle(source), king = at(next, 'ak');
    expect(next.lastDecision!.action).not.toMatchObject({ pieceId: 'promote' });
    expect(next.lastDecision!.reason).toContain('脅威を除去');
    expect(next.pieces.filter(p => p.side === 'enemy').some(p => legalMoves(p, next.pieces)
      .some(to => samePosition(to, king.position)))).toBe(false);
  });
  it('recognizes a dragon diagonal threat and its promoted capture label', () => {
    const source = createBattle([ak()], [ek(), piece('dragon', 'rook', 'enemy', 1, 3, true)]);
    const next = stepBattle(source);
    expect(next.lastDecision!.reason).toContain('龍を捕獲');
    expect(next.lastDecision!.reason).toContain('脅威を除去');
    expect(next.pieces.some(p => p.id === 'dragon')).toBe(false);
    const king = at(next, 'ak');
    expect(next.pieces.filter(p => p.side === 'enemy').some(p => legalMoves(p, next.pieces)
      .some(to => samePosition(to, king.position)))).toBe(false);
  });
  it('replays promotion results and event ordering without mutating an initial state', () => {
    const source = createBattle([ak(), piece('p', 'pawn', 'ally', 2, 1), piece('r', 'rook', 'ally', 3, 3, false, ['split'])],
      [ek(), piece('g', 'gold', 'enemy', 3, 1)], ['othello']);
    const snapshot = structuredClone(source);
    expect(runBattle(source)).toEqual(runBattle(structuredClone(source)));
    expect(source).toEqual(snapshot);
    expect(getPieceInfo({ type: 'pawn', promoted: true }).value).toBe(4);
    expect(getPieceInfo({ type: 'rook', promoted: true }).value).toBe(10);
  });
});
