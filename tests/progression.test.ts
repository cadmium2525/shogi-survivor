import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoArrange, createRun, finishBattle, placePiece, selectReward, startBattle } from '../src/game/progression.ts';
import { getRewardChoices } from '../src/game/rewards.ts';
import { getEnemies } from '../src/game/stages.ts';
import { clearSave, loadRun, SAVE_KEY, saveRun } from '../src/game/storage.ts';
import { legalMoves } from '../src/game/moves.ts';
import { runBattle, stepBattle } from '../src/game/engine.ts';
import type { GameState, Piece, RunState } from '../src/game/types.ts';

function win(run: RunState): RunState {
  const fighting = startBattle(run);
  const battle: GameState = { ...fighting.battle!, phase: 'finished', winner: 'ally', endReason: 'kingCaptured',
    pieces: fighting.battle!.pieces.filter((piece) => !(piece.side === 'enemy' && piece.type === 'king')) };
  return finishBattle(fighting, battle);
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
