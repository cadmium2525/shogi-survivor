import { ABILITIES, STAGES } from '../game/catalog.ts';
import type { RunState } from '../game/types.ts';
import { AbilityBadge, Icon, PieceToken } from './Shared.tsx';

export default function Reward({ run, onChoose, onBoard }: { run: RunState; onChoose: (id: string) => void; onBoard: () => void }) {
  return <><div className="result-kicker">GATE {String(run.stageIndex + 1).padStart(2, '0')} CLEARED</div><h2 id="modal-title">勝利に、新たな一手を。</h2><p className="modal-intro">{STAGES[run.stageIndex]}を突破。{run.stageIndex === 4 ? '最後の仲間を選び、遠征を締めくくろう。' : '3枚の候補から、仲間を1枚。'}</p>
    {run.stageIndex === 1 && <div className="relic-unlock"><Icon name="spark" /><span><b>ルール遺物「オセロの法則」を獲得</b><small>次の戦闘から、挟んだ敵が味方に反転します。</small></span></div>}
    <div className="reward-options">{run.rewardChoices.map((r, i) => <button key={r.id} className="reward-card" data-action="reward" data-id={r.id} onClick={() => onChoose(r.id)}><span className="reward-index">0{i + 1} / 新たな仲間</span><span className="reward-art"><PieceToken type={r.type} abilities={r.abilities} shieldUsed={false} /></span><strong>{r.title}</strong>{r.abilities.length > 0 && <span className="reward-ability-names">{r.abilities.map(a => <span key={a}><AbilityBadge ability={a} />{ABILITIES[a].name}</span>)}</span>}<p>{r.description}</p><span className="reward-choose">軍勢に加える<Icon name="arrow" /></span></button>)}</div><p className="reward-footnote">必ず駒を1枚獲得。出陣枠が満員なら、控えに加わります。</p><button className="text-button board-return" data-action="hide-result" onClick={onBoard}>盤面を振り返る</button></>;
}
