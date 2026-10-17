import { chooseAction, enumerateActions } from './ai.ts';
import { clonePiece, otherSide, resolveMove } from './effects.ts';
import { isOnBoard, samePosition } from './moves.ts';
import { MAX_HALF_TURNS, MAX_ON_BOARD } from './types.ts';
import type { Action, GameState, Piece, Relic, Side } from './types.ts';

export { chooseAction, enumerateActions } from './ai.ts';
export { legalMoves } from './moves.ts';

export function createBattle(allies: Piece[], enemies: Piece[], relics: Relic[] = []): GameState {
  const ids = new Set<string>();
  const cells = new Set<string>();
  const pieces = ([['ally', allies], ['enemy', enemies]] as const).flatMap(([side, army]) => {
    if (army.length > MAX_ON_BOARD || army.filter(piece => piece.type === 'king').length !== 1) {
      throw new Error('各陣営は王1枚、盤上8枚以内で配置してください。');
    }
    return army.map(source => {
      if (!isOnBoard(source.position)) throw new Error(`盤外の配置です: ${source.id}`);
      if (ids.has(source.id)) throw new Error(`駒IDが重複しています: ${source.id}`);
      const square = `${source.position.x},${source.position.y}`;
      if (cells.has(square)) throw new Error(`配置が重複しています: ${square}`);
      ids.add(source.id); cells.add(square);
      return { ...clonePiece(source), side, shieldUsed: false };
    });
  });
  const nextId = pieces.reduce((next, piece) => {
    const existing = /^summon-(\d+)$/.exec(piece.id);
    const number = existing ? Number(existing[1]) : 0;
    return Number.isSafeInteger(number) && number < Number.MAX_SAFE_INTEGER ? Math.max(next, number + 1) : next;
  }, 1);
  return { pieces, activeSide: 'ally', halfTurn: 0, phase: 'battle', winner: null, endReason: null,
    consecutivePasses: 0, pendingExtraAction: false, relics: [...new Set(relics)], eventLog: [], nextId, lastDecision: null };
}

function finish(state: GameState, winner: Side, endReason: GameState['endReason']): void {
  state.phase = 'finished'; state.winner = winner; state.endReason = endReason; state.pendingExtraAction = false;
  state.eventLog.push({ type: winner === 'ally' ? 'won' : 'lost', side: winner, halfTurn: state.halfTurn,
    text: endReason === 'mutualPass' ? '双方が連続パス。遠征は敗北となります。'
      : endReason === 'turnLimit' ? '80半手の上限に到達。遠征は敗北となります。'
      : winner === 'ally' ? '敵王を捕獲！ 勝利です。' : '味方王が捕獲されました。敗北です。' });
}

function validAction(state: GameState, action: Action): boolean {
  return enumerateActions(state).some(candidate => candidate.type === 'pass' ? action.type === 'pass'
    : action.type === 'move' && candidate.pieceId === action.pieceId && samePosition(candidate.to, action.to));
}

/** Execute exactly one half-turn, including passes and capture-granted extra actions. */
export function applyAction(source: GameState, action: Action, reason = '指定された合法手を実行。'): GameState {
  if (source.phase === 'finished') return source;
  if (!validAction(source, action)) throw new Error('その行動は現在の合法手ではありません。');
  let state: GameState = { ...source, pieces: source.pieces.map(clonePiece), relics: [...source.relics], eventLog: [...source.eventLog],
    halfTurn: source.halfTurn + 1, lastDecision: { action: action.type === 'move' ? { ...action, to: { ...action.to } } : { type: 'pass' }, score: 0, reason } };
  if (action.type === 'pass') {
    state.consecutivePasses++;
    state.pendingExtraAction = false;
    state.activeSide = otherSide(source.activeSide);
    state.eventLog.push({ type: 'passed', side: source.activeSide, halfTurn: state.halfTurn, text: `${source.activeSide === 'ally' ? '味方' : '敵'}は合法手がなくパス。`, reason });
    if (state.consecutivePasses >= 2) { finish(state, 'enemy', 'mutualPass'); return state; }
  } else {
    const result = resolveMove(state, action, reason);
    state = result.state;
    state.consecutivePasses = 0;
    // Ability events precede the king capture result, exactly as the implementation specification requires.
    if (!state.pieces.some(piece => piece.side === 'ally' && piece.type === 'king')) {
      finish(state, 'enemy', 'kingCaptured'); return state;
    }
    if (!state.pieces.some(piece => piece.side === 'enemy' && piece.type === 'king')) {
      finish(state, 'ally', 'kingCaptured'); return state;
    }
    const extra = Boolean(result.captured && result.actor.abilities.includes('combo') && !source.pendingExtraAction);
    state.pendingExtraAction = extra;
    state.activeSide = extra ? source.activeSide : otherSide(source.activeSide);
    if (extra) state.eventLog.push({ type: 'extraAction', side: source.activeSide, halfTurn: state.halfTurn,
      pieceId: result.actor.id, text: '連撃！ 同じ陣営が追加で1行動。追加行動からの再連撃はありません。' });
  }
  if (state.halfTurn >= MAX_HALF_TURNS) {
    state.eventLog.push({ type: 'limit', side: 'enemy', halfTurn: state.halfTurn, text: '80半手の行動上限です。' });
    finish(state, 'enemy', 'turnLimit');
  }
  return state;
}

export function stepBattle(state: GameState): GameState {
  if (state.phase === 'finished') return state;
  const decision = chooseAction(state);
  return { ...applyAction(state, decision.action, decision.reason), lastDecision: decision };
}

export function runBattle(source: GameState): GameState {
  let state = source;
  while (state.phase === 'battle') state = stepBattle(state);
  return state;
}
