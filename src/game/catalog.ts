import type { Ability, PieceType } from './types.ts';

export const PIECES: Record<PieceType, { label: string; name: string; value: number; description: string }> = {
  king: { label: '王', name: '王将', value: 1000, description: '周囲8方向に1マス。捕獲されると遠征終了。' },
  pawn: { label: '歩', name: '歩兵', value: 1, description: '前に1マス。味方の前方は画面の上方向。' },
  gold: { label: '金', name: '金将', value: 4, description: '前・斜め前・左右・後ろに1マス。王の護衛が得意。' },
  rook: { label: '飛', name: '飛車', value: 7, description: '縦横へ何マスでも。途中の駒は飛び越せない。' },
};
export const ABILITIES: Record<Ability, { name: string; short: string; description: string }> = {
  iron: { name: '鉄壁', short: '壁', description: '最初の捕獲を1回防ぐ。攻撃した駒も移動しない。戦闘ごとに復活。' },
  combo: { name: '連撃', short: '連', description: '捕獲成功時、同じ陣営に追加の1行動。追加行動から連撃は再発動しない。' },
  split: { name: '分裂', short: '裂', description: '捕獲成功時、移動元に味方の歩を1枚召喚。盤上の同陣営は最大8枚。' },
};
export const STAGES = ['はじまりの門', '歩兵の砦', '金の守り', '天守への道', '天守の決戦'];
export const OTHELLO = { name: 'オセロの法則', short: '反', description: '第2戦勝利で獲得。行動後、味方同士で8方向に挟んだ敵を反転。王を含む列は反転せず、同陣営8枚まで。連鎖なし。' };
