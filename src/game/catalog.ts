import type { Ability, Piece, PieceType } from './types.ts';

export const PIECES: Record<PieceType, { label: string; name: string; value: number; description: string }> = {
  king: { label: '王', name: '王将', value: 1000, description: '周囲8方向に1マス。捕獲されると遠征終了。' },
  pawn: { label: '歩', name: '歩兵', value: 1, description: '前に1マス。敵陣の最奥段でと金に成り、金と同じ動きになる。' },
  gold: { label: '金', name: '金将', value: 4, description: '前・斜め前・左右・後ろに1マス。王の護衛が得意。' },
  rook: { label: '飛', name: '飛車', value: 7, description: '縦横へ何マスでも。敵陣の最奥段で龍王に成り、斜め1マスも動ける。' },
};
export const PROMOTIONS = {
  pawn: { label: 'と', name: 'と金', value: 4, description: '成った歩。金将と同じく、前・斜め前・左右・後ろに1マス。' },
  rook: { label: '龍', name: '龍王', value: 10, description: '成った飛車。縦横へ何マスでも、さらに斜めに1マス。' },
};
export function getPieceInfo(piece: Pick<Piece, 'type' | 'promoted'>) {
  if (piece.promoted && (piece.type === 'pawn' || piece.type === 'rook')) return PROMOTIONS[piece.type];
  return PIECES[piece.type];
}
export const ABILITIES: Record<Ability, { name: string; short: string; description: string }> = {
  iron: { name: '鉄壁', short: '壁', description: '最初の捕獲を1回防ぐ。攻撃した駒も移動しない。戦闘ごとに復活。' },
  combo: { name: '連撃', short: '連', description: '捕獲成功時、同じ陣営に追加の1行動。追加行動から連撃は再発動しない。' },
  split: { name: '分裂', short: '裂', description: '捕獲成功時、移動元に味方の歩を1枚召喚。盤上の同陣営は最大8枚。' },
};
export const STAGES = ['はじまりの門', '歩兵の砦', '金の守り', '天守への道', '天守の決戦'];
export const OTHELLO = { name: 'オセロの法則', short: '反', description: '第2戦勝利で獲得。行動後、味方同士で8方向に挟んだ敵を反転。王を含む列は反転せず、同陣営8枚まで。連鎖なし。' };
