import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoArrange, createRun, finishBattle, placePiece, selectReward, startBattle } from '../src/game/progression.ts';
import { getRewardChoices } from '../src/game/rewards.ts';
import { getEnemies } from '../src/game/stages.ts';
import { clearSave, loadRun, SAVE_KEY, saveRun } from '../src/game/storage.ts';
import { legalMoves } from '../src/game/moves.ts';
import { applyAction, createBattle, runBattle, stepBattle } from '../src/game/engine.ts';
import type { GameState, Piece, RunState } from '../src/game/types.ts';

function win(run: RunState): RunState {
  const fighting = startBattle(run);
  const battle: GameState = { ...fighting.battle!, phase: 'finished', winner: 'ally', endReason: 'kingCaptured',
    pieces: fighting.battle!.pieces.filter((piece) => !(piece.side === 'enemy' && piece.type === 'king')) };
  return finishBattle(fighting, battle);
}
function promotionBattle(type: 'pawn' | 'rook' = 'pawn'): GameState {
  const piece = (id: string, type: Piece['type'], side: Piece['side'], x: number, y: number): Piece => ({
    id, type, side, position: { x, y }, abilities: [], shieldUsed: false, isSummoned: false,
  });
  return applyAction(createBattle([
    piece('ally-1', 'king', 'ally', 0, 4), piece('ally-2', type, 'ally', 2, 1),
  ], [piece('enemy-1-1', 'king', 'enemy', 4, 0), piece('enemy-1-2', 'pawn', 'enemy', 4, 1)]),
  { type: 'move', pieceId: 'ally-2', to: { x: 2, y: 0 } });
}
function legacyLastRankRun(): RunState {
  const run = startBattle(createRun());
  const piece = (id: string, type: Piece['type'], side: Piece['side'], x: number, y: number): Piece => ({
    id, type, side, position: { x, y }, abilities: [], shieldUsed: false, isSummoned: false,
  });
  run.battle!.pieces = [
    piece('ally-1', 'king', 'ally', 0, 3),
    { ...piece('ally-2', 'pawn', 'ally', 1, 0), abilities: ['iron', 'combo'], shieldUsed: true },
    piece('enemy-1-1', 'king', 'enemy', 4, 0),
    { ...piece('enemy-1-2', 'pawn', 'enemy', 3, 4), abilities: ['split'] },
    piece('legacy-other', 'pawn', 'ally', 2, 2),
    piece('legacy-rook', 'rook', 'ally', 2, 0),
    { ...piece('new-false', 'pawn', 'ally', 3, 0), promoted: false },
  ];
  run.battle!.halfTurn = 12;
  run.battle!.eventLog = [{ type: 'moved', side: 'ally', halfTurn: 12, pieceId: 'ally-1',
    from: { x: 0, y: 4 }, to: { x: 0, y: 3 }, text: '移行前の行動記録。' }];
  return run;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('fixed five-stage progression', () => {
  it('starts with king and pawn in a fixed legal 5x5 home formation', () => {
    const run = createRun();
    expect(run.stageIndex).toBe(0);
    expect(run.phase).toBe('prepare');
    expect(run.inventory).toEqual([
      { id: 'ally-1', type: 'king', abilities: [], position: { x: 0, y: 3 } },
      { id: 'ally-2', type: 'pawn', abilities: [], position: { x: 0, y: 4 } },
    ]);
    expect(createRun()).toEqual(run);
  });
  it('uses exactly the five prescribed fixed enemy compositions', () => {
    const compositions = [['king', 'pawn'], ['king', 'pawn', 'pawn'], ['king', 'gold', 'pawn'],
      ['king', 'gold', 'pawn', 'pawn'], ['king', 'rook', 'gold', 'pawn']];
    for (let i = 0; i < 5; i++) {
      const enemies = getEnemies(i);
      expect(enemies.map((piece) => piece.type)).toEqual(compositions[i]);
      expect(enemies.every((piece) => piece.side === 'enemy' && piece.position.y <= 1)).toBe(true);
      expect(new Set(enemies.map((piece) => `${piece.position.x},${piece.position.y}`)).size).toBe(enemies.length);
      const initialX = enemies[0].position.x;
      enemies[0].position.x = (initialX + 1) % 5;
      expect(getEnemies(i)[0].position.x).toBe(initialX);
    }
    expect(() => getEnemies(-1)).toThrow(RangeError);
    expect(() => getEnemies(5)).toThrow(RangeError);
  });
  it('protects both initial kings, including every possible home-rank rook placement', () => {
    for (let stageIndex = 0; stageIndex < 5; stageIndex++) {
      const enemies = getEnemies(stageIndex);
      const battle = startBattle({ ...createRun(), stageIndex }).battle!;
      const allyKing = battle.pieces.find((piece) => piece.side === 'ally' && piece.type === 'king')!;
      const enemyKing = enemies.find((piece) => piece.type === 'king')!;
      expect(enemies.some((piece) => legalMoves(piece, battle.pieces)
        .some((to) => to.x === allyKing.position.x && to.y === allyKing.position.y))).toBe(false);
      for (let y = 3; y <= 4; y++) for (let x = 0; x < 5; x++) {
        if (x === allyKing.position.x && y === allyKing.position.y) continue;
        const rook: Piece = { id: 'probe-rook', type: 'rook', side: 'ally', position: { x, y },
          abilities: [], shieldUsed: false, isSummoned: false };
        expect(legalMoves(rook, [allyKing, rook, ...enemies])
          .some((to) => to.x === enemyKing.position.x && to.y === enemyKing.position.y)).toBe(false);
      }
    }
  });
  it('only prepares on y=3,4, swaps positions, and keeps king deployed', () => {
    const run = createRun();
    const moved = placePiece(run, 'ally-2', { x: 1, y: 3 });
    expect(moved.inventory[1].position).toEqual({ x: 1, y: 3 });
    expect(run.inventory[1].position).toEqual({ x: 0, y: 4 });
    for (const p of [null, { x: 5, y: 4 }, { x: 2, y: 2 }, { x: 0.5, y: 4 }]) {
      expect(placePiece(run, 'ally-1', p)).toBe(run);
    }
    expect(placePiece(run, 'ally-1', { x: 0, y: 4 }).inventory[1].position).toEqual({ x: 0, y: 3 });
    const bench = placePiece(run, 'ally-2', null);
    expect(placePiece(bench, 'ally-2', { x: 0, y: 3 })).toBe(bench);
    const fighting = startBattle(run);
    expect(placePiece(fighting, 'ally-2', null)).toBe(fighting);
  });
  it('offers three distinct piece types, with fixed abilities from third clear onwards', () => {
    for (let i = 0; i < 5; i++) {
      const choices = getRewardChoices(i);
      expect(choices.map((choice) => choice.type)).toEqual(['pawn', 'gold', 'rook']);
      expect(choices.every((choice) => choice.abilities.length === (i >= 2 ? 1 : 0))).toBe(true);
      expect(getRewardChoices(i)).toEqual(choices);
    }
    expect(() => getRewardChoices(5)).toThrow(RangeError);
  });
  it('requires a new piece after every win including boss, ending with seven owned pieces', () => {
    let run = createRun();
    for (let i = 0; i < 5; i++) {
      const before = run.inventory.length;
      run = win(run);
      expect(run.stageIndex).toBe(i);
      expect(run.phase).toBe('reward');
      expect(run.victories).toBe(i + 1);
      expect(run.inventory).toHaveLength(before);
      expect(run.rewardChoices).toHaveLength(3);
      expect(run.unlockedRelics).toEqual(i >= 1 ? ['othello'] : []);
      expect(selectReward(run, 'invalid')).toBe(run);
      const choice = run.rewardChoices[2];
      run = selectReward(run, choice.id);
      expect(run.inventory).toHaveLength(before + 1);
      expect(run.inventory.at(-1)?.type).toBe('rook');
      expect(run.inventory.at(-1)?.abilities).toEqual(choice.abilities);
      expect(run.phase).toBe(i === 4 ? 'victory' : 'prepare');
    }
    expect(run.inventory).toHaveLength(7);
    expect(run.inventory.filter((piece) => piece.position !== null)).toHaveLength(6);
    expect(run.inventory.at(-1)?.position).toBeNull();
    expect(startBattle(run)).toBe(run);
  });
  it('unlocks the relic after second clear and applies it from third battle', () => {
    let run = createRun();
    for (let i = 0; i < 3; i++) {
      expect(startBattle(run).battle?.relics).toEqual(i >= 2 ? ['othello'] : []);
      const reward = win(run);
      run = selectReward(reward, reward.rewardChoices[1].id);
    }
    expect(run.unlockedRelics).toEqual(['othello']);
  });
  it('does not persist battle casualties, flipped enemies or summoned pawns', () => {
    const run = placePiece(createRun(), 'ally-2', null);
    const fighting = startBattle(run);
    expect(fighting.battle!.pieces.filter((piece) => piece.side === 'ally').map((piece) => piece.id)).toEqual(['ally-1']);
    const end: GameState = { ...fighting.battle!, phase: 'finished', winner: 'ally', endReason: 'kingCaptured',
      pieces: [...fighting.battle!.pieces.filter((piece) => piece.side === 'ally'), {
        id: 'summoned-50', type: 'pawn', side: 'ally', position: { x: 0, y: 0 }, abilities: [], shieldUsed: false, isSummoned: true,
      }] };
    const reward = finishBattle(fighting, end);
    expect(reward.inventory).toEqual(run.inventory);
    expect(finishBattle(reward, end)).toBe(reward);
    expect(finishBattle(fighting, fighting.battle!)).toBe(fighting);
  });
  it('keeps promotion within one battle and restores the base inventory next encounter', () => {
    const initial = createRun();
    const inventory = structuredClone(initial.inventory);
    const promoted = promotionBattle();
    expect(promoted.pieces.find((piece) => piece.id === 'ally-2')?.promoted).toBe(true);
    const fighting = { ...startBattle(initial), battle: promoted };
    const finished: GameState = { ...promoted, phase: 'finished', winner: 'ally', endReason: 'kingCaptured',
      pieces: promoted.pieces.filter((piece) => !(piece.side === 'enemy' && piece.type === 'king')) };
    const reward = finishBattle(fighting, finished);
    expect(reward.inventory).toEqual(inventory);
    expect(reward.inventory.every((piece) => !('promoted' in piece))).toBe(true);
    const next = startBattle(selectReward(reward, reward.rewardChoices[2].id));
    expect(next.battle!.pieces.filter((piece) => piece.side === 'ally').every((piece) => !piece.promoted)).toBe(true);
    expect(next.battle!.pieces.find((piece) => piece.id === 'ally-2')?.type).toBe('pawn');
    expect(initial.inventory).toEqual(inventory);
  });
  it('ends losses, move limits and mutual passes without rewards', () => {
    const run = startBattle(createRun());
    for (const reason of ['kingCaptured', 'turnLimit', 'mutualPass'] as const) {
      const lost = finishBattle(run, { ...run.battle!, phase: 'finished', winner: 'enemy', endReason: reason });
      expect(lost.phase).toBe('defeat');
      expect(lost.victories).toBe(0);
      expect(lost.rewardChoices).toHaveLength(0);
      expect(startBattle(lost)).toBe(lost);
    }
  });
  it('auto-arranges deterministically without overlapping or mutating inventory', () => {
    let run = createRun();
    for (let i = 0; i < 4; i++) { const reward = win(run); run = selectReward(reward, reward.rewardChoices[2].id); }
    const snapshot = structuredClone(run);
    const arranged = autoArrange(run);
    expect(run).toEqual(snapshot);
    expect(arranged).toEqual(autoArrange(run));
    expect(new Set(arranged.inventory.map((piece) => `${piece.position?.x},${piece.position?.y}`)).size).toBe(6);
    expect(arranged.inventory[0].position).toEqual({ x: 2, y: 4 });
    expect(arranged.inventory.every((piece) => piece.position === null || piece.position.y >= 3)).toBe(true);
  });
  it('completes all five actual AI battles, mandatory boss reward and identical replay', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const play = (): RunState => {
      let run = createRun();
      expect(autoArrange(run).inventory).toEqual(run.inventory);
      while (run.phase === 'prepare') {
        run = startBattle(autoArrange(run));
        const paused = { ...run, battle: stepBattle(run.battle!) };
        expect(saveRun(paused)).toBe(true);
        expect(loadRun()).toEqual(paused);
        expect(stepBattle(loadRun()!.battle!)).toEqual(stepBattle(paused.battle!));
        run = finishBattle(run, runBattle(run.battle!));
        expect(run.phase, `Failed at stage ${run.stageIndex + 1}`).toBe('reward');
        expect(saveRun(run)).toBe(true);
        run = selectReward(run, run.rewardChoices.find((choice) => choice.type === 'rook')!.id);
      }
      expect(saveRun(run)).toBe(true);
      expect(loadRun()).toEqual(run);
      return run;
    };
    const completed = play();
    expect(completed.phase).toBe('victory');
    expect(completed.victories).toBe(5);
    expect(completed.inventory).toHaveLength(7);
    expect(completed).toEqual(play());
  });
});

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}
describe('versioned defensive save', () => {
  it.each(['pawn', 'rook'] as const)('restores promoted %s and events, then continues deterministically', (type) => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const run = { ...startBattle(createRun()), battle: promotionBattle(type) };
    expect(run.battle.eventLog.some((event) => event.type === 'promoted')).toBe(true);
    expect(saveRun(run)).toBe(true);
    const restored = loadRun();
    expect(restored).toEqual(run);
    expect(restored!.battle!.pieces.find((piece) => piece.id === 'ally-2')?.promoted).toBe(true);
    expect(stepBattle(restored!.battle!)).toEqual(stepBattle(run.battle));
    expect(runBattle(restored!.battle!)).toEqual(runBattle(run.battle));
  });
  it('keeps version-two saves without promoted fields backward compatible', () => {
    const storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage);
    const legacy = startBattle(createRun());
    legacy.battle!.pieces.forEach((piece) => { delete piece.promoted; });
    storage.setItem(SAVE_KEY, JSON.stringify(legacy));
    const restored = loadRun();
    expect(restored).toEqual(legacy);
    expect(restored!.battle!.pieces.every((piece) => piece.promoted === undefined)).toBe(true);
    expect(stepBattle(restored!.battle!)).toEqual(stepBattle(legacy.battle!));
    legacy.battle!.pieces.forEach((piece) => { piece.promoted = false; });
    expect(saveRun(legacy)).toBe(true);
    expect(loadRun()).toEqual(legacy);
  });
  it('migrates only legacy last-rank pawns once without advancing or rewriting the stored input', () => {
    const storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage);
    const legacy = legacyLastRankRun();
    const raw = JSON.stringify(legacy);
    storage.setItem(SAVE_KEY, raw);
    const migrated = loadRun()!;
    expect(migrated).not.toBeNull();
    expect(storage.getItem(SAVE_KEY)).toBe(raw);
    expect(legacy.battle!.pieces[1].promoted).toBeUndefined();
    expect(migrated.battle!.halfTurn).toBe(12);
    expect(migrated.inventory).toEqual(legacy.inventory);
    expect(migrated.battle!.activeSide).toBe(legacy.battle!.activeSide);
    for (const original of legacy.battle!.pieces) {
      const restored = migrated.battle!.pieces.find((piece) => piece.id === original.id)!;
      expect(restored).toEqual(original.id === 'ally-2' || original.id === 'enemy-1-2'
        ? { ...original, promoted: true } : original);
    }
    const events = migrated.battle!.eventLog.filter((event) => event.type === 'promoted');
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.pieceId)).toEqual(['ally-2', 'enemy-1-2']);
    expect(events.every((event) => event.halfTurn === 12 && event.reason?.includes('旧仕様'))).toBe(true);
    expect(migrated.battle!.eventLog[0]).toEqual(legacy.battle!.eventLog[0]);
    expect(loadRun()).toEqual(migrated);
    expect(saveRun(migrated)).toBe(true);
    const reloaded = loadRun()!;
    expect(reloaded).toEqual(migrated);
    expect(saveRun(reloaded)).toBe(true);
    expect(loadRun()).toEqual(migrated);
    expect(stepBattle(reloaded.battle!)).toEqual(stepBattle(migrated.battle!));
  });
  it('leaves finished legacy battles and their recorded results unchanged', () => {
    const storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage);
    const ongoing = legacyLastRankRun();
    const finished: GameState = { ...ongoing.battle!, phase: 'finished', winner: 'ally', endReason: 'kingCaptured',
      pieces: ongoing.battle!.pieces.filter((piece) => !(piece.side === 'enemy' && piece.type === 'king')) };
    for (const run of [{ ...ongoing, battle: finished }, finishBattle(ongoing, finished)]) {
      const raw = JSON.stringify(run);
      storage.setItem(SAVE_KEY, raw);
      expect(loadRun()).toEqual(run);
      expect(storage.getItem(SAVE_KEY)).toBe(raw);
      expect(loadRun()!.battle!.eventLog.some((event) => event.type === 'promoted')).toBe(false);
    }
  });
  it('round trips preparation, battle, every reward and final seventh piece', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    let run = createRun();
    for (let i = 0; i < 5; i++) {
      expect(saveRun(run)).toBe(true);
      expect(loadRun()).toEqual(run);
      const fighting = startBattle(run);
      expect(saveRun(fighting)).toBe(true);
      expect(loadRun()).toEqual(fighting);
      run = win(run);
      expect(saveRun(run)).toBe(true);
      expect(loadRun()).toEqual(run);
      run = selectReward(run, run.rewardChoices[2].id);
    }
    expect(saveRun(run)).toBe(true);
    expect(loadRun()).toEqual(run);
    expect(run.phase).toBe('victory');
    clearSave();
    expect(loadRun()).toBeNull();
  });
  it('rejects corruption, old schemas, impossible formations, progress and battle shape', () => {
    const storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage);
    for (const raw of ['broken', 'null', '[]', '{}', 'x'.repeat(250001)]) {
      storage.setItem(SAVE_KEY, raw); expect(loadRun()).toBeNull();
    }
    const invalid: unknown[] = [{ ...createRun(), version: 1 }, { ...createRun(), stageIndex: 5 },
      { ...createRun(), victories: 3 }, { ...createRun(), phase: 'reward' }, { ...createRun(), phase: 'battle', battle: {} },
      { ...createRun(), unlockedRelics: ['othello'] }, { ...createRun(), nextId: 4 }];
    const bad = createRun(); bad.inventory[1].position = { x: 2, y: 2 }; invalid.push(bad);
    const overlap = createRun(); overlap.inventory[1].position = { x: 0, y: 3 }; invalid.push(overlap);
    const noKing = createRun(); noKing.inventory[0].position = null; invalid.push(noKing);
    const duplicate = createRun(); duplicate.inventory[1].id = 'ally-1'; invalid.push(duplicate);
    const duplicateAbility = createRun(); duplicateAbility.inventory[1].abilities = ['iron', 'iron']; invalid.push(duplicateAbility);
    const collision = startBattle(createRun()); collision.battle!.pieces[1].position = { ...collision.battle!.pieces[0].position }; invalid.push(collision);
    const limit = startBattle(createRun()); limit.battle!.halfTurn = 81; invalid.push(limit);
    for (const promoted of ['yes', 1, null, true]) {
      const badFlag = startBattle(createRun());
      Object.assign(badFlag.battle!.pieces[0], { promoted }); invalid.push(badFlag);
    }
    const promotedGold = startBattle(createRun());
    Object.assign(promotedGold.battle!.pieces[1], { type: 'gold', promoted: true }); invalid.push(promotedGold);
    const permanentPromotion = createRun();
    Object.assign(permanentPromotion.inventory[1], { promoted: true }); invalid.push(permanentPromotion);
    for (const value of invalid) {
      storage.setItem(SAVE_KEY, JSON.stringify(value)); expect(loadRun()).toBeNull(); expect(saveRun(value as RunState)).toBe(false);
    }
  });
  it('continues gracefully when browser storage is blocked or full', () => {
    vi.stubGlobal('localStorage', { getItem() { throw Error('blocked'); }, setItem() { throw Error('full'); }, removeItem() { throw Error('blocked'); } });
    expect(saveRun(createRun())).toBe(false);
    expect(loadRun()).toBeNull();
    expect(() => clearSave()).not.toThrow();
  });
});
