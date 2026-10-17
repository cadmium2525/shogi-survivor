import type { ReactNode } from 'react';
import { ABILITIES, getPieceInfo } from '../game/catalog.ts';
import type { Ability, PieceType, Side } from '../game/types.ts';

const paths: Record<string, ReactNode> = {
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  play: <path d="m9 5 11 7-11 7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  step: <path d="m5 5 11 7-11 7zM20 5v14" />,
  book: <path d="M12 6c-4-3-8-2-9-1v14c2-2 6-2 9 0 3-2 7-2 9 0V5c-2-1-6-2-9 1Zm0 0v13" />,
  refresh: <path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6" />,
  shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6" />,
  eye: <><path d="M2 12S6 5 12 5s10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />,
};
export function Icon({ name }: { name: string }) {
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.spark}</svg>;
}
export function AbilityBadge({ ability }: { ability: Ability }) {
  return <span className={`ability-badge ability-${ability}`} title={`${ABILITIES[ability].name}: ${ABILITIES[ability].description}`}>{ABILITIES[ability].short}</span>;
}
export function PieceToken({ type, side = 'ally', abilities = [], shieldUsed = true, promoted = false, miniature = false }: { type: PieceType; side?: Side; abilities?: Ability[]; shieldUsed?: boolean; promoted?: boolean; miniature?: boolean }) {
  const info = getPieceInfo({ type, promoted });
  const isPromoted = promoted && (type === 'pawn' || type === 'rook');
  return <span className={`piece-wrap ${side} ${isPromoted ? 'promoted' : ''} ${miniature ? 'miniature' : ''}`} aria-hidden="true">
    <span className="piece"><span className="piece-character">{info.label}</span><span className="piece-engraving">{side === 'enemy' ? isPromoted ? '敵成' : '敵' : isPromoted ? '成' : '将'}</span></span>
    {abilities.length > 0 && <span className="piece-abilities">{abilities.map(a => <AbilityBadge key={a} ability={a} />)}</span>}
    {abilities.includes('iron') && !shieldUsed && <span className="shield-ring" />}
  </span>;
}
