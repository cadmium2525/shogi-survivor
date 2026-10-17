import type { RunState } from '../game/types.ts';
import { Icon } from './Shared.tsx';

export default function Result({ run, onRetry, onBoard }: { run: RunState; onRetry: () => void; onBoard: () => void }) {
  const won = run.phase === 'victory';
  return <><div className={`result-emblem ${won ? '' : 'defeat-emblem'}`}>{won ? '覇' : '終'}</div><div className="result-kicker">{won ? 'EXPEDITION COMPLETE' : 'END OF EXPEDITION'}</div><h2 id="modal-title">{won ? 'その一手が、天下を取る。' : 'また、一歩から。'}</h2><p className="modal-intro">{won ? <>五つの門を突破し、天守を制しました。<br />小さな軍勢が、ひとつの伝説に。</> : run.battle?.endReason === 'turnLimit' ? <>80半手で決着せず、遠征を終えました。<br />射線や配置を変えて、もう一度。</> : run.battle?.endReason === 'mutualPass' ? <>両陣営が連続でパスし、遠征を終えました。<br />動ける駒を残せる配置を考えよう。</> : <>王が討たれ、今回の遠征は幕を閉じました。<br />配置を変えれば、運命も変わる。</>}</p><div className="result-stats"><div><b>{run.victories}<small> / 5</small></b><span>突破した門</span></div><div><b>{run.inventory.length}<small>枚</small></b><span>集めた軍勢</span></div><div><b>{run.stageIndex + 1}<small>戦目</small></b><span>到達した戦い</span></div></div><p className="result-seed">{won ? '最後の勝利の仲間も、軍勢に迎えました。' : '行動ログと危険マスを、次の布陣の手がかりに。'}</p><button className="primary-button full-width" data-action="retry" onClick={onRetry}>新たな遠征をはじめる<Icon name="arrow" /></button><button className="text-button board-return" data-action="hide-result" onClick={onBoard}>最後の盤面を見る</button></>;
}
