import { ABILITIES, PIECES } from './catalog.ts';
import type { Ability, RewardChoice } from './types.ts';

const VARIANTS: Ability[][] = [[], [], ['iron', 'combo', 'split'], ['combo', 'split', 'iron'], ['split', 'iron', 'combo']];

/** Each victory always offers the three distinct non-king types; later ones have fixed abilities. */
export function getRewardChoices(stageIndex: number): RewardChoice[] {
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= 5) {
    throw new RangeError('報酬のステージは0から4の範囲で指定してください。');
  }
  return (['pawn', 'gold', 'rook'] as const).map((type, index) => {
    const ability = VARIANTS[stageIndex][index];
    return {
      id: `reward-${stageIndex + 1}-${type}`, type, abilities: ability ? [ability] : [],
      title: `${PIECES[type].name}${ability ? `・${ABILITIES[ability].name}` : ''}`,
      description: `${PIECES[type].description}${ability ? ` ${ABILITIES[ability].description}` : ''}`,
    };
  });
}
