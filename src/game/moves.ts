import { BOARD_SIZE } from './types.ts';
import type { Piece, Position, Side } from './types.ts';

export const DIRECTIONS: Position[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
];
export const samePosition = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
export const isOnBoard = (p: Position): boolean => Number.isInteger(p.x) && Number.isInteger(p.y)
  && p.x >= 0 && p.y >= 0 && p.x < BOARD_SIZE && p.y < BOARD_SIZE;
export const isPromotionZone = (side: Side, position: Position): boolean => position.y === (side === 'ally' ? 0 : BOARD_SIZE - 1);

/** Independent movement rules, including tokin/dragon; check and captured-piece drops are omitted. */
export function legalMoves(piece: Piece, pieces: Piece[]): Position[] {
  const destinations: Position[] = [];
  const forward = piece.side === 'ally' ? -1 : 1;
  const add = (dx: number, dy: number, slides = false): void => {
    for (let n = 1; n < BOARD_SIZE; n++) {
      const to = { x: piece.position.x + dx * n, y: piece.position.y + dy * n };
      if (!isOnBoard(to)) break;
      const blocker = pieces.find(other => samePosition(other.position, to));
      if (!blocker || blocker.side !== piece.side) destinations.push(to);
      if (blocker || !slides) break;
    }
  };
  const goldMoves = (): void => {
    add(0, forward); add(-1, forward); add(1, forward);
    add(-1, 0); add(1, 0); add(0, -forward);
  };
  switch (piece.type) {
    case 'king': DIRECTIONS.forEach(d => add(d.x, d.y)); break;
    case 'pawn': if (piece.promoted) goldMoves(); else add(0, forward); break;
    case 'gold': goldMoves(); break;
    case 'rook':
      DIRECTIONS.filter(d => d.x === 0 || d.y === 0).forEach(d => add(d.x, d.y, true));
      if (piece.promoted) DIRECTIONS.filter(d => d.x !== 0 && d.y !== 0).forEach(d => add(d.x, d.y));
      break;
  }
  return destinations.sort((a, b) => a.y - b.y || a.x - b.x);
}
