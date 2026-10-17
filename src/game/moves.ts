import { BOARD_SIZE } from './types.ts';
import type { Piece, Position } from './types.ts';

export const DIRECTIONS: Position[] = [
  { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
  { x: -1, y: 0 }, { x: 1, y: 0 },
  { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
];
export const samePosition = (a: Position, b: Position): boolean => a.x === b.x && a.y === b.y;
export const isOnBoard = (p: Position): boolean => Number.isInteger(p.x) && Number.isInteger(p.y)
  && p.x >= 0 && p.y >= 0 && p.x < BOARD_SIZE && p.y < BOARD_SIZE;

/** Independent movement rules: there is no check, promotion, or captured-piece drop. */
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
  switch (piece.type) {
    case 'king': DIRECTIONS.forEach(d => add(d.x, d.y)); break;
    case 'pawn': add(0, forward); break;
    case 'gold':
      add(0, forward); add(-1, forward); add(1, forward);
      add(-1, 0); add(1, 0); add(0, -forward); break;
    case 'rook': DIRECTIONS.filter(d => d.x === 0 || d.y === 0).forEach(d => add(d.x, d.y, true)); break;
  }
  return destinations.sort((a, b) => a.y - b.y || a.x - b.x);
}
