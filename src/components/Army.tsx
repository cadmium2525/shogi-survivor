import { ABILITIES, OTHELLO, PIECES, getPieceInfo } from '../game/catalog.ts';
import { MAX_DEPLOYED } from '../game/types.ts';
import type { Piece, RunState } from '../game/types.ts';
import { AbilityBadge, Icon, PieceToken } from './Shared.tsx';

interface Props { run: RunState; pieces: Piece[]; selectedId: string | null; onSelect: (id: string) => void; onArrange: () => void; onBench: () => void }
export default function Army({ run, pieces, selectedId, onSelect, onArrange, onBench }: Props) {
  const selected = run.inventory.find(p => p.id === selectedId);
  const inspected = pieces.find(p => p.id === selectedId);
  const piece = run.phase === 'prepare' ? selected ?? inspected : inspected;
  const deployed = run.inventory.filter(p => p.position).length;
  const relic = run.unlockedRelics.includes('othello');
  const info = piece ? getPieceInfo(piece) : null;
  return <section className="army-panel"><div className="section-heading"><div><div className="section-eyebrow">YOUR ARMY</div><h2>我が軍勢</h2></div><span className="count-pill">{deployed}<span> / {MAX_DEPLOYED}</span></span></div>
    <p className="panel-hint">{run.phase === 'prepare' ? '駒を選び、自陣のマスをタップして配置。' : '捕獲された所持駒は、次の戦闘で復帰。'}</p>
    <div className="roster-list">{run.inventory.map(p => <button key={p.id} data-action="select" data-id={p.id} className={`roster-item ${selectedId === p.id ? 'is-selected' : ''}`} aria-pressed={selectedId === p.id} onClick={() => onSelect(p.id)}><PieceToken type={p.type} abilities={p.abilities} miniature /><span className="roster-description"><strong>{PIECES[p.type].name}</strong><span>{p.abilities.length ? p.abilities.map(a => ABILITIES[a].name).join('・') : p.type === 'king' ? '軍勢の要' : '異能なし'}</span></span><span className={`roster-status ${p.position ? 'deployed' : ''}`}>{p.position ? '出陣' : '控え'}</span></button>)}</div>
    {run.phase === 'prepare' && <button className="arrange-button" data-action="arrange" onClick={onArrange}><Icon name="refresh" />配置をおまかせ</button>}
    <div className="piece-inspector">{piece && info ? <><div className="inspector-title"><strong>{info.name}</strong><span>{'side' in piece && piece.side === 'enemy' ? '敵軍' : '味方'}{'promoted' in piece && piece.promoted ? ' · 成駒' : ''}</span></div><p>{info.description}</p>{piece.abilities.map(a => <div key={a} className="ability-description"><AbilityBadge ability={a} /><span><b>{ABILITIES[a].name}</b>{ABILITIES[a].description}</span></div>)}{run.phase === 'prepare' && selected?.position && selected.type !== 'king' && <button className="text-button bench-button" data-action="bench" onClick={onBench}>この駒を控えに戻す</button>}</> : <><span className="inspector-watermark">将</span><p>駒をタップすると<br />動きと異能を確認できます。</p></>}</div>
    <div className={`relic-panel ${relic ? 'unlocked' : ''}`}><span className="relic-symbol">反</span><div><strong>{relic ? OTHELLO.name : 'まだ見ぬ、ルール遺物'}</strong><p>{relic ? '挟んだ敵を、我が軍勢に。' : '第2戦に勝つと獲得します。'}</p></div><span className="relic-status">{relic ? '獲得' : '封印'}</span></div>
    <div className="rule-reminder"><Icon name="shield" /><p><strong>王を守り、敵王を討つ。</strong><br />最奥段で歩はと金、飛は龍王へ。<br />王手・詰み・持ち駒なし。</p></div>
  </section>;
}
