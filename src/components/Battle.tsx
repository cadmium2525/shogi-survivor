import { MAX_HALF_TURNS } from '../game/types.ts';
import type { GameState } from '../game/types.ts';
import { Icon } from './Shared.tsx';

interface Props { battle: GameState; running: boolean; speed: number; onPause: () => void; onStep: () => void; onSpeed: (speed: number) => void; onFinish: () => void }
export default function Battle({ battle, running, speed, onPause, onStep, onSpeed, onFinish }: Props) {
  return <>
    <div className="turn-strip"><span className={`live-dot ${running ? 'active' : ''}`} /><strong>{running ? '戦闘中' : '一時停止中'}</strong><span>次は{battle.activeSide === 'ally' ? '味方' : '敵'}{battle.pendingExtraAction ? 'の連撃' : 'の一手'}</span><span className="action-count">{battle.halfTurn}<small> / {MAX_HALF_TURNS} 半手</small></span></div>
    <div className="battle-controls playing"><button className="primary-button" data-action="pause" onClick={onPause}><Icon name={running ? 'pause' : 'play'} />{running ? '一時停止' : '戦闘を再開'}</button><button className="secondary-button step-button" data-action="step" aria-label="一時停止して1手進める" title="1手進める" onClick={onStep}><Icon name="step" /></button><div className="speed-control" aria-label="戦闘速度">{[1, 2, 4].map(n => <button key={n} data-action="speed" data-value={n} aria-pressed={speed === n} className={speed === n ? 'active' : ''} onClick={() => onSpeed(n)}>{n}×</button>)}</div><button className="text-button finish-button" data-action="fast-forward" onClick={onFinish}>決着まで<Icon name="chevron" /></button></div>
    {battle.lastDecision && <div className="ai-reason"><span>AIの判断</span><p>{battle.lastDecision.reason}</p></div>}
  </>;
}
