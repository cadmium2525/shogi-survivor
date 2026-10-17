import type { Piece, PieceType, Position } from './types.ts';

type EnemyDefinition = { type: PieceType; position: Position };
const FORMATIONS: EnemyDefinition[][] = [
  [{ type: 'king', position: { x: 0, y: 0 } }, { type: 'pawn', position: { x: 0, y: 1 } }],
  [{ type: 'king', position: { x: 2, y: 0 } }, { type: 'pawn', position: { x: 2, y: 1 } }, { type: 'pawn', position: { x: 4, y: 1 } }],
  [{ type: 'king', position: { x: 2, y: 0 } }, { type: 'gold', position: { x: 2, y: 1 } }, { type: 'pawn', position: { x: 0, y: 1 } }],
  [{ type: 'king', position: { x: 2, y: 0 } }, { type: 'gold', position: { x: 2, y: 1 } }, { type: 'pawn', position: { x: 0, y: 1 } }, { type: 'pawn', position: { x: 4, y: 1 } }],
  [{ type: 'king', position: { x: 2, y: 0 } }, { type: 'rook', position: { x: 1, y: 0 } }, { type: 'gold', position: { x: 2, y: 1 } }, { type: 'pawn', position: { x: 4, y: 1 } }],
];

/** Stage definitions are public, fixed, and cloned so previews cannot mutate later battles. */
export function getEnemies(stageIndex: number): Piece[] {
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= FORMATIONS.length) {
    throw new RangeError('ステージは0から4の範囲で指定してください。');
  }
  return FORMATIONS[stageIndex].map((definition, index) => ({
    id: `enemy-${stageIndex + 1}-${index + 1}`, type: definition.type, side: 'enemy',
    position: { ...definition.position }, abilities: [], shieldUsed: false, isSummoned: false,
  }));
}
