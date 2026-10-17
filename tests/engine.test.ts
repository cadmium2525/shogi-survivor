import { describe, expect, it } from 'vitest';
import { chooseAction, enumerateActions } from '../src/game/ai.ts';
import { applyAction, createBattle, runBattle, stepBattle } from '../src/game/engine.ts';
import { DIRECTIONS, legalMoves, samePosition } from '../src/game/moves.ts';
import type { Ability, GameState, Piece, PieceType, Side } from '../src/game/types.ts';

const piece = (id: string, type: PieceType, side: Side, x: number, y: number, abilities: Ability[] = []): Piece =>
  ({ id, type, side, position: { x, y }, abilities, shieldUsed: false, isSummoned: false });
const ak = () => piece('ak', 'king', 'ally', 0, 4);
const ek = () => piece('ek', 'king', 'enemy', 4, 0);
const move = (s: GameState, pieceId: string, x: number, y: number) => applyAction(s, { type: 'move', pieceId, to: { x, y } });
const types = (s: GameState) => s.eventLog.filter(e => e.halfTurn === s.halfTurn).map(e => e.type);
const at = (s: GameState, id: string) => s.pieces.find(p => p.id === id)!;

describe('5×5 traditional movement', () => {
  it('keeps all four types on board and excludes friendly squares', () => {
    for (const type of ['king', 'pawn', 'gold', 'rook'] as const) {
      const actor = piece('a', type, 'ally', 0, 0), friend = piece('f', 'pawn', 'ally', 1, 0);
      const moves = legalMoves(actor, [actor, friend]);
      expect(moves.every(p => p.x >= 0 && p.x < 5 && p.y >= 0 && p.y < 5)).toBe(true);
      expect(moves).not.toContainEqual(friend.position);
    }
    const king = piece('k', 'king', 'ally', 2, 2);
    expect(legalMoves(king, [king])).toHaveLength(8);
    const gold = piece('g', 'gold', 'ally', 2, 2);
    expect(legalMoves(gold, [gold])).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 },
      { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 3 }]);
  });
  it('reverses pawn and gold forward directions between armies', () => {
    for (const side of ['ally', 'enemy'] as const) {
      const pawn = piece('p', 'pawn', side, 2, 2);
      expect(legalMoves(pawn, [pawn])).toEqual([{ x: 2, y: side === 'ally' ? 1 : 3 }]);
      pawn.position.y = side === 'ally' ? 0 : 4;
      expect(legalMoves(pawn, [pawn])).toEqual([]);
      const gold = piece('g', 'gold', side, 2, 2);
      expect(legalMoves(gold, [gold])).toContainEqual({ x: 1, y: side === 'ally' ? 1 : 3 });
      expect(legalMoves(gold, [gold])).not.toContainEqual({ x: 1, y: side === 'ally' ? 3 : 1 });
    }
  });
  it('rook stops before allies and after the first enemy without jumping', () => {
    const rook = piece('r', 'rook', 'ally', 2, 2);
    const moves = legalMoves(rook, [rook, piece('f', 'pawn', 'ally', 2, 1), piece('e', 'pawn', 'enemy', 3, 2)]);
    expect(moves).not.toContainEqual({ x: 2, y: 1 });
    expect(moves).not.toContainEqual({ x: 2, y: 0 });
    expect(moves).toContainEqual({ x: 3, y: 2 });
    expect(moves).not.toContainEqual({ x: 4, y: 2 });
    expect(moves).toContainEqual({ x: 0, y: 2 });
  });
});

describe('half-turn engine and forced passes', () => {
  it('moves only one army piece and alternates normally', () => {
    const s = createBattle([ak(), piece('p', 'pawn', 'ally', 2, 3)], [ek()]);
    const n = move(s, 'p', 2, 2);
    expect(at(n, 'p').position).toEqual({ x: 2, y: 2 });
    expect(at(n, 'ak').position).toEqual(at(s, 'ak').position);
    expect(n).toMatchObject({ activeSide: 'enemy', halfTurn: 1 });
    expect(n.eventLog[0].halfTurn).toBe(1);
  });
  it('captures an ordinary target in one hit and occupies its square', () => {
    const n = move(createBattle([ak(), piece('p', 'pawn', 'ally', 2, 3)], [ek(), piece('e', 'gold', 'enemy', 2, 2)]), 'p', 2, 2);
    expect(n.pieces.some(p => p.id === 'e')).toBe(false);
    expect(at(n, 'p').position).toEqual({ x: 2, y: 2 });
    expect(types(n)).toEqual(['captured']);
  });
  it('ends on king capture and ignores later step calls', () => {
    const n = move(createBattle([ak(), piece('r', 'rook', 'ally', 4, 4)], [ek()]), 'r', 4, 0);
    expect(n).toMatchObject({ phase: 'finished', winner: 'ally', endReason: 'kingCaptured', halfTurn: 1 });
    expect(stepBattle(n)).toBe(n);
  });
  it('counts 80 half-turns as enemy win but king capture has precedence', () => {
    const s = { ...createBattle([ak(), piece('r', 'rook', 'ally', 4, 4)], [ek()]), halfTurn: 79 };
    expect(move(s, 'ak', 1, 4)).toMatchObject({ winner: 'enemy', endReason: 'turnLimit', halfTurn: 80 });
    expect(move(s, 'r', 4, 0)).toMatchObject({ winner: 'ally', endReason: 'kingCaptured', halfTurn: 80 });
  });
  it('rejects voluntary passes and illegal or wrong-side moves', () => {
    const s = createBattle([ak()], [ek()]);
    expect(() => applyAction(s, { type: 'pass' })).toThrow(/合法手/);
    expect(() => move(s, 'ak', -1, 4)).toThrow(/合法手/);
    expect(() => move(s, 'ek', 3, 0)).toThrow(/合法手/);
  });
  it('passes only when all army moves are blocked and mutual pass loses', () => {
    const allies = [piece('ak', 'king', 'ally', 0, 0)], enemies = [piece('ek', 'king', 'enemy', 4, 4)];
    for (const [x, y] of [[1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1]]) allies.push(piece(`a${x}${y}`, 'pawn', 'ally', x, y));
    for (const [x, y] of [[0, 4], [1, 4], [2, 4], [3, 4], [2, 3], [3, 3], [4, 3]]) enemies.push(piece(`e${x}${y}`, 'pawn', 'enemy', x, y));
    const s = createBattle(allies, enemies, ['othello']);
    expect(enumerateActions(s)).toEqual([{ type: 'pass' }]);
    const first = stepBattle(s);
    expect(types(first)).toEqual(['passed']);
    expect(first).toMatchObject({ consecutivePasses: 1, activeSide: 'enemy', halfTurn: 1 });
    const second = stepBattle(first);
    expect(second).toMatchObject({ winner: 'enemy', endReason: 'mutualPass', halfTurn: 2 });
    expect(types(second)).toEqual(['passed', 'lost']);
  });
  it('immutably clones positions, ability arrays, and cumulative event history', () => {
    const s = createBattle([ak(), piece('r', 'rook', 'ally', 2, 4, ['split'])], [ek(), piece('p', 'pawn', 'enemy', 2, 2)]);
    const snapshot = structuredClone(s), n = move(s, 'r', 2, 2);
    expect(s).toEqual(snapshot);
    expect(n.pieces).not.toBe(s.pieces);
    expect(n.eventLog).not.toBe(s.eventLog);
    expect(at(n, 'ak').position).not.toBe(at(s, 'ak').position);
    expect(at(n, 'ak').abilities).not.toBe(at(s, 'ak').abilities);
  });
});

describe('iron, capture-only combo, and capture-origin split', () => {
  it('iron blocks once without movement, split, or combo; second attack captures', () => {
    let s = createBattle([ak(), piece('r', 'rook', 'ally', 2, 4, ['split', 'combo'])], [ek(), piece('e', 'gold', 'enemy', 2, 2, ['iron'])]);
    s = move(s, 'r', 2, 2);
    expect(at(s, 'r').position).toEqual({ x: 2, y: 4 });
    expect(at(s, 'e').shieldUsed).toBe(true);
    expect(types(s)).toEqual(['shieldBlocked']);
    expect(s.pendingExtraAction).toBe(false);
    s = move(s, 'ek', 3, 0);
    s = move(s, 'r', 2, 2);
    expect(s.pieces.some(p => p.id === 'e')).toBe(false);
    expect(types(s)).toEqual(['captured', 'summoned', 'extraAction']);
    expect(s.activeSide).toBe('ally');
  });
  it('iron protects kings and restores its one shield at the start of a new battle', () => {
    const enemy = { ...ek(), abilities: ['iron' as const], shieldUsed: true };
    const s = createBattle([ak(), piece('r', 'rook', 'ally', 4, 4)], [enemy]);
    expect(at(s, 'ek').shieldUsed).toBe(false);
    expect(move(s, 'r', 4, 0).phase).toBe('battle');
    expect(enemy.shieldUsed).toBe(true);
  });
  it('combo is never granted by an ordinary noncapture move', () => {
    const s = move(createBattle([ak(), piece('r', 'rook', 'ally', 2, 4, ['combo'])], [ek()]), 'r', 2, 3);
    expect(s.pendingExtraAction).toBe(false);
    expect(s.activeSide).toBe('enemy');
    expect(types(s)).toEqual(['moved']);
  });
  it('extra action can use another piece but cannot trigger another combo', () => {
    let s = createBattle([ak(), piece('r', 'rook', 'ally', 2, 4, ['combo']), piece('g', 'gold', 'ally', 0, 3, ['combo'])],
      [ek(), piece('first', 'pawn', 'enemy', 2, 2), piece('second', 'rook', 'enemy', 1, 2)]);
    s = move(s, 'r', 2, 2);
    expect(s).toMatchObject({ activeSide: 'ally', pendingExtraAction: true, halfTurn: 1 });
    s = move(s, 'g', 1, 2);
    expect(s).toMatchObject({ activeSide: 'enemy', pendingExtraAction: false, halfTurn: 2 });
    expect(types(s)).toEqual(['captured']);
  });
  it('split belongs to capturer and creates an abilityless pawn on its from square', () => {
    const s = createBattle([ak(), piece('r', 'rook', 'ally', 2, 4, ['split'])], [ek(), piece('e', 'gold', 'enemy', 2, 2, ['split'])]);
    const summons = move(s, 'r', 2, 2).pieces.filter(p => p.isSummoned);
    expect(summons).toHaveLength(1);
    expect(summons[0]).toMatchObject({ type: 'pawn', side: 'ally', position: { x: 2, y: 4 }, abilities: [], shieldUsed: false });
    const victimOnly = createBattle([ak(), piece('r', 'rook', 'ally', 2, 4)], [ek(), piece('e', 'gold', 'enemy', 2, 2, ['split'])]);
    expect(move(victimOnly, 'r', 2, 2).pieces.some(p => p.isSummoned)).toBe(false);
  });
  it('suppresses split if the capturer already has eight allied pieces on board', () => {
    const allies = [ak(), piece('r', 'rook', 'ally', 2, 4, ['split'])];
    for (const [x, y] of [[0, 3], [1, 3], [3, 3], [4, 3], [1, 4], [3, 4]]) allies.push(piece(`a${x}${y}`, 'pawn', 'ally', x, y));
    const s = move(createBattle(allies, [ek(), piece('e', 'gold', 'enemy', 2, 2)]), 'r', 2, 2);
    expect(s.pieces.filter(p => p.side === 'ally')).toHaveLength(8);
    expect(s.pieces.some(p => p.isSummoned)).toBe(false);
  });
  it('never reuses an initial summoned-looking ID even after capturing that piece', () => {
    const s = createBattle([ak(), piece('r', 'rook', 'ally', 2, 4, ['split'])],
      [ek(), piece('summon-1', 'gold', 'enemy', 2, 2)]);
    const n = move(s, 'r', 2, 2);
    expect(n.pieces.find(p => p.isSummoned)!.id).toBe('summon-2');
  });
});

describe('one global Othello scan', () => {
  it('flips all eight directions independently while retaining type, abilities, shield', () => {
    for (const d of DIRECTIONS) {
      const target = { x: 2 + d.x, y: 2 + d.y }, anchor = { x: 2 + d.x * 2, y: 2 + d.y * 2 };
      const from = DIRECTIONS.map(v => ({ x: 2 + v.x, y: 2 + v.y })).find(p => !samePosition(p, target))!;
      const enemyKing = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }, { x: 4, y: 4 }].find(p => !samePosition(p, anchor))!;
      const s = createBattle([piece('ak', 'king', 'ally', from.x, from.y), piece('anchor', 'gold', 'ally', anchor.x, anchor.y)],
        [piece('ek', 'king', 'enemy', enemyKing.x, enemyKing.y), piece('target', 'rook', 'enemy', target.x, target.y, ['iron', 'combo'])], ['othello']);
      expect(at(move(s, 'ak', 2, 2), 'target')).toMatchObject({ side: 'ally', type: 'rook', abilities: ['iron', 'combo'], shieldUsed: false });
    }
  });
  it('checks brackets elsewhere on the whole board and converts continuous enemy chains', () => {
    const s = createBattle([ak(), piece('left', 'pawn', 'ally', 0, 1), piece('right', 'gold', 'ally', 3, 1)],
      [ek(), piece('one', 'pawn', 'enemy', 1, 1), piece('two', 'rook', 'enemy', 2, 1)], ['othello']);
    const n = move(s, 'ak', 1, 4);
    expect(types(n)).toEqual(['moved', 'flipped', 'flipped']);
    expect(at(n, 'one').side).toBe('ally');
    expect(at(n, 'two').side).toBe('ally');
  });
  it('does nothing without relic, across gaps, or across an opposing king', () => {
    const s = createBattle([ak(), piece('left', 'pawn', 'ally', 0, 1), piece('right', 'gold', 'ally', 2, 1)],
      [ek(), piece('one', 'pawn', 'enemy', 1, 1)]);
    expect(at(move(s, 'ak', 1, 4), 'one').side).toBe('enemy');
    const gap = createBattle([ak(), piece('left', 'pawn', 'ally', 0, 1), piece('right', 'gold', 'ally', 3, 1)],
      [ek(), piece('one', 'pawn', 'enemy', 1, 1)], ['othello']);
    expect(at(move(gap, 'ak', 1, 4), 'one').side).toBe('enemy');
    const king = createBattle([ak(), piece('left', 'pawn', 'ally', 0, 2), piece('right', 'gold', 'ally', 4, 2)],
      [piece('ek', 'king', 'enemy', 2, 2), piece('one', 'pawn', 'enemy', 1, 2), piece('two', 'pawn', 'enemy', 3, 2)], ['othello']);
    const n = move(king, 'ak', 1, 4);
    expect(types(n)).toEqual(['moved']);
    expect(at(n, 'ek').side).toBe('enemy');
  });
  it('never chains a second scan from a just-converted piece', () => {
    const s = createBattle([piece('ak', 'king', 'ally', 4, 4), piece('a', 'pawn', 'ally', 0, 0),
      piece('b', 'pawn', 'ally', 2, 0), piece('c', 'pawn', 'ally', 1, 2)],
      [ek(), piece('first', 'pawn', 'enemy', 1, 0), piece('second', 'gold', 'enemy', 1, 1)], ['othello']);
    const n = move(s, 'ak', 3, 4);
    expect(at(n, 'first').side).toBe('ally');
    expect(at(n, 'second').side).toBe('enemy');
  });
  it('applies the eight-piece cap in top-to-bottom left-to-right target order', () => {
    const allies = [ak(), piece('left', 'pawn', 'ally', 0, 0), piece('right', 'pawn', 'ally', 4, 0)];
    for (const x of [0, 1, 2, 3]) allies.push(piece(`f${x}`, 'pawn', 'ally', x, 2));
    const s = createBattle(allies, [piece('ek', 'king', 'enemy', 4, 4), ...[1, 2, 3].map(x => piece(`e${x}`, 'pawn', 'enemy', x, 0))], ['othello']);
    const n = move(s, 'ak', 1, 4);
    expect(at(n, 'e1').side).toBe('ally');
    expect(at(n, 'e2').side).toBe('enemy');
    expect(at(n, 'e3').side).toBe('enemy');
    expect(n.pieces.filter(p => p.side === 'ally')).toHaveLength(8);
  });
  it('prioritizes the upper target before a lower target with a smaller x coordinate', () => {
    const s = createBattle([ak(), piece('a', 'pawn', 'ally', 2, 0), piece('b', 'pawn', 'ally', 4, 0),
      piece('c', 'pawn', 'ally', 0, 2), piece('d', 'pawn', 'ally', 2, 2),
      piece('e', 'pawn', 'ally', 3, 4), piece('f', 'pawn', 'ally', 4, 4)],
      [piece('ek', 'king', 'enemy', 4, 1), piece('late', 'pawn', 'enemy', 1, 2),
        piece('early', 'pawn', 'enemy', 3, 0)], ['othello']);
    const n = move(s, 'ak', 1, 4);
    expect(at(n, 'early').side).toBe('ally');
    expect(at(n, 'late').side).toBe('enemy');
  });
  it('preserves a consumed iron shield when a piece changes sides', () => {
    const s = createBattle([ak(), piece('left', 'pawn', 'ally', 0, 1), piece('right', 'gold', 'ally', 2, 1)],
      [ek(), piece('target', 'rook', 'enemy', 1, 1, ['iron'])], ['othello']);
    at(s, 'target').shieldUsed = true;
    expect(at(move(s, 'ak', 1, 4), 'target')).toMatchObject({ side: 'ally', shieldUsed: true, abilities: ['iron'] });
  });
  it('scans after iron blocks but does not grant split or combo', () => {
    const s = createBattle([ak(), piece('r', 'rook', 'ally', 2, 4, ['split', 'combo']),
      piece('left', 'pawn', 'ally', 0, 1), piece('right', 'gold', 'ally', 2, 1)],
      [ek(), piece('shield', 'pawn', 'enemy', 2, 3, ['iron']), piece('flip', 'pawn', 'enemy', 1, 1)], ['othello']);
    const n = move(s, 'r', 2, 3);
    expect(types(n)).toEqual(['shieldBlocked', 'flipped']);
    expect(at(n, 'r').position).toEqual({ x: 2, y: 4 });
  });
  it('orders king capture, split, flip, victory; no extra action follows victory', () => {
    const s = createBattle([ak(), piece('r', 'rook', 'ally', 4, 4, ['split', 'combo']),
      piece('left', 'pawn', 'ally', 0, 1), piece('right', 'gold', 'ally', 2, 1)],
      [ek(), piece('flip', 'pawn', 'enemy', 1, 1)], ['othello']);
    const n = move(s, 'r', 4, 0);
    expect(types(n)).toEqual(['captured', 'summoned', 'flipped', 'won']);
    expect(n.winner).toBe('ally');
    expect(n.pendingExtraAction).toBe(false);
  });
  it('enables the same rule for the enemy army', () => {
    const s = createBattle([ak(), piece('flip', 'pawn', 'ally', 1, 1)],
      [ek(), piece('left', 'pawn', 'enemy', 0, 1), piece('right', 'gold', 'enemy', 2, 1)], ['othello']);
    expect(at(move({ ...s, activeSide: 'enemy' }, 'ek', 3, 0), 'flip').side).toBe('enemy');
  });
});

describe('global deterministic one-ply AI', () => {
  it('selects any army piece and always prioritizes immediate king capture', () => {
    const s = createBattle([ak(), piece('p', 'pawn', 'ally', 2, 3)], [piece('ek', 'king', 'enemy', 2, 2)]);
    const d = chooseAction(s);
    expect(d.action).toEqual({ type: 'move', pieceId: 'p', to: { x: 2, y: 2 } });
    expect(d.reason).toContain('敵王');
    expect(Number.isFinite(d.score)).toBe(true);
  });
  it('sorts candidate ties by ID then y then x independently of array order', () => {
    const s = createBattle([piece('king', 'king', 'ally', 2, 4), piece('b', 'pawn', 'ally', 1, 3), piece('a', 'pawn', 'ally', 3, 3)],
      [piece('enemy-king', 'king', 'enemy', 2, 0)]);
    expect(chooseAction(s).action).toEqual({ type: 'move', pieceId: 'a', to: { x: 3, y: 2 } });
    expect(enumerateActions(s).slice(0, 2)).toEqual([
      { type: 'move', pieceId: 'a', to: { x: 3, y: 2 } }, { type: 'move', pieceId: 'b', to: { x: 1, y: 2 } },
    ]);
    expect(chooseAction({ ...s, pieces: [...s.pieces].reverse() })).toEqual(chooseAction(s));
  });
  it('removes immediate king capture risk when a safe escape exists', () => {
    const s = createBattle([ak(), piece('g', 'gold', 'ally', 1, 3)], [ek(), piece('r', 'rook', 'enemy', 0, 0)]);
    const n = stepBattle(s), king = at(n, 'ak');
    expect(n.pieces.filter(p => p.side === 'enemy').some(p => legalMoves(p, n.pieces).some(to => samePosition(to, king.position)))).toBe(false);
    expect(n.lastDecision!.reason).toContain('脅威を除去');
  });
  it('reproduces all decisions, outcomes, and Japanese logs from the same state', () => {
    const make = () => createBattle([ak(), piece('r', 'rook', 'ally', 2, 4, ['split', 'combo'])],
      [ek(), piece('g', 'gold', 'enemy', 2, 1, ['iron'])], ['othello']);
    const s = make(), snapshot = structuredClone(s);
    expect(runBattle(s)).toEqual(runBattle(make()));
    expect(s).toEqual(snapshot);
    expect(runBattle(s).halfTurn).toBeLessThanOrEqual(80);
  });
  it('rejects duplicate IDs, overlapping squares, missing kings, and off-board pieces', () => {
    expect(() => createBattle([ak()], [piece('ak', 'king', 'enemy', 4, 0)])).toThrow(/ID/);
    expect(() => createBattle([ak()], [piece('ek', 'king', 'enemy', 0, 4)])).toThrow(/配置/);
    expect(() => createBattle([piece('p', 'pawn', 'ally', 1, 4)], [ek()])).toThrow(/王/);
    expect(() => createBattle([piece('ak', 'king', 'ally', 5, 4)], [ek()])).toThrow(/盤外/);
  });
});
