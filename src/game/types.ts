export const BOARD_SIZE = 5;
export const MAX_HALF_TURNS = 80;
export const MAX_DEPLOYED = 6;
export const MAX_ON_BOARD = 8;
export const STAGE_COUNT = 5;
export type Side = 'ally' | 'enemy';
export type PieceType = 'king' | 'pawn' | 'gold' | 'rook';
export type Ability = 'iron' | 'combo' | 'split';
export type Relic = 'othello';
export interface Position { x: number; y: number }
export interface Piece {
  id: string;
  type: PieceType;
  side: Side;
  position: Position;
  abilities: Ability[];
  shieldUsed: boolean;
  isSummoned: boolean;
}
export type Action = { type: 'move'; pieceId: string; to: Position } | { type: 'pass' };
export interface ActionDecision { action: Action; score: number; reason: string }
export type EventType = 'moved' | 'captured' | 'shieldBlocked' | 'summoned' | 'flipped' | 'extraAction' | 'passed' | 'won' | 'lost' | 'limit';
export interface GameEvent {
  type: EventType;
  side: Side;
  halfTurn: number;
  pieceId?: string;
  targetId?: string;
  from?: Position;
  to?: Position;
  text: string;
  reason?: string;
}
export interface GameState {
  pieces: Piece[];
  activeSide: Side;
  halfTurn: number;
  phase: 'battle' | 'finished';
  winner: Side | null;
  endReason: 'kingCaptured' | 'turnLimit' | 'mutualPass' | null;
  consecutivePasses: number;
  pendingExtraAction: boolean;
  relics: Relic[];
  eventLog: GameEvent[];
  nextId: number;
  lastDecision: ActionDecision | null;
}
export interface InventoryPiece {
  id: string;
  type: PieceType;
  abilities: Ability[];
  position: Position | null;
}
export interface RewardChoice {
  id: string;
  type: Exclude<PieceType, 'king'>;
  abilities: Ability[];
  title: string;
  description: string;
}
export interface RunState {
  version: 2;
  stageIndex: number;
  inventory: InventoryPiece[];
  unlockedRelics: Relic[];
  phase: 'prepare' | 'battle' | 'reward' | 'victory' | 'defeat';
  rewardChoices: RewardChoice[];
  battle: GameState | null;
  victories: number;
  nextId: number;
}
