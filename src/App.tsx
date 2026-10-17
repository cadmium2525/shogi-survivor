import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Board from './components/Board.tsx';
import Army from './components/Army.tsx';
import Preparation from './components/Preparation.tsx';
import Battle from './components/Battle.tsx';
import Reward from './components/Reward.tsx';
import Result from './components/Result.tsx';
import { AbilityBadge, Icon } from './components/Shared.tsx';
import { ABILITIES, OTHELLO, STAGES } from './game/catalog.ts';
import { runBattle, stepBattle } from './game/engine.ts';
import { autoArrange, createRun, finishBattle, placePiece, selectReward, startBattle } from './game/progression.ts';
import { getEnemies } from './game/stages.ts';
import { loadRun, saveRun } from './game/storage.ts';
import type { Ability, Piece, Position, RunState } from './game/types.ts';

function Modal({ kind, children, onClose }: { kind: string; children: ReactNode; onClose?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element?.querySelector<HTMLElement>('button:not(.modal-close), summary')?.focus({ preventScroll: true });
    document.body.classList.add('has-modal');
    return () => { document.body.classList.remove('has-modal'); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [kind]);
  return <div className="modal-backdrop"><section ref={ref} className={`modal modal-${kind}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={event => {
    if (event.key === 'Escape' && onClose) onClose();
    if (event.key === 'Tab') {
      const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary, [tabindex="0"]') ?? [])];
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>{onClose && <button className="icon-button modal-close" data-action="close" aria-label="閉じる" onClick={onClose}><Icon name="close" /></button>}{children}</section></div>;
}

function Help({ onClose }: { onClose: () => void }) {
  return <><div className="section-eyebrow">HOW TO PLAY</div><h2 id="modal-title">一手を、運命に。</h2><p className="modal-intro">王と歩から始まる、5つの門への遠征。</p><ol className="help-steps"><li><span>01</span><div><strong>陣を組む</strong><p>味方を選び、下2段をタップ。最大6枚を配置できます。王は必ず出陣。味方のいるマスへ置くと交換、控えも保有できます。</p></div></li><li><span>02</span><div><strong>戦いを見守る</strong><p>味方先手で、味方1枚→敵1枚が交互に行動。AIが全駒の合法手から1手を選びます。敵王を捕獲すれば勝利、自王の捕獲で遠征終了。通常は一撃撃破です。</p></div></li><li><span>03</span><div><strong>仲間を迎える</strong><p>勝つたびに、3候補から必ず駒を1枚獲得。第2戦後に「オセロの法則」、第3戦勝利後から異能を持つ駒が登場します。第5戦の最後の仲間を選ぶとクリア。</p></div></li></ol><div className="help-abilities">{(Object.keys(ABILITIES) as Ability[]).map(a => <div key={a}><AbilityBadge ability={a} /><p><strong>{ABILITIES[a].name}</strong><span>{ABILITIES[a].description}</span></p></div>)}<div><span className="ability-badge ability-flip">反</span><p><strong>{OTHELLO.name}</strong><span>行動後、縦横斜め8方向に味方と挟んだ敵を反転。王を挟む方向は不成立。両陣営に適用し、連鎖再検査はしません。</span></p></div></div><details className="help-details"><summary>独自ルール・AI・保存について</summary><p>将棋の動きを使った「王の捕獲」で決着する独自ルールです。王手・詰み・成り・持ち駒打ち・二歩はありません。味方は上、敵は下が前方。飛車は途中の駒を飛び越えません。</p><p>AIは敵王の捕獲を最優先に、自王の安全、相手の次の捕獲、護衛、捕獲価値、駒ごとの位置を評価。同点は駒ID・移動先の行・列で決定。同じ配置は、再生速度にかかわらず同じ結果になります。</p><p>80半手（陣営の1行動で1半手）で決着しない場合は敗北。合法手がない陣営はパス、双方が連続パスでも敗北です。召喚・反転後の盤上上限は各陣営8枚。</p><p>所持駒は戦闘で倒れても次戦で復帰。召喚・反転した駒は戦闘限り。ブラウザ内に途中保存し、再読込時は停止して再開します。端末間同期やメタ成長はありません。</p></details><button className="primary-button full-width" data-action="close" onClick={onClose}>いざ、出陣<Icon name="arrow" /></button></>;
}

function previewAllies(run: RunState): Piece[] {
  return run.inventory.flatMap(p => p.position ? [{ id: p.id, type: p.type, side: 'ally' as const, position: { ...p.position }, abilities: [...p.abilities], shieldUsed: false, isSummoned: false }] : []);
}

export default function App() {
  const [initial] = useState(() => loadRun());
  const [run, setRun] = useState<RunState>(() => initial ?? createRun());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [showThreats, setShowThreats] = useState(true);
  const [modal, setModal] = useState<'help' | 'new' | null>(null);
  const [rewardHidden, setRewardHidden] = useState(false);
  const [saveWarning, setSaveWarning] = useState(false);
  const [toast, setToast] = useState(initial ? '前回の遠征を再開しました' : '');

  useEffect(() => { setSaveWarning(!saveRun(run)); }, [run]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const hide = () => { if (document.hidden) setRunning(false); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    if (!running || run.phase !== 'battle' || !run.battle || modal) return;
    const timer = setTimeout(() => {
      const battle = stepBattle(run.battle!);
      setRun(battle.phase === 'finished' ? finishBattle(run, battle) : { ...run, battle });
      if (battle.phase === 'finished') { setRunning(false); setSelectedId(null); setRewardHidden(false); }
    }, 800 / speed);
    return () => clearTimeout(timer);
  }, [running, run, speed, modal]);

  const pieces = run.phase === 'prepare' ? [...previewAllies(run), ...getEnemies(run.stageIndex)] : run.battle?.pieces ?? [];
  const lastEvents = run.phase === 'battle' ? run.battle?.eventLog.filter(e => e.halfTurn === run.battle!.halfTurn) ?? [] : [];
  const overlay = modal !== null || !rewardHidden && ['reward', 'victory', 'defeat'].includes(run.phase);

  function onCell(position: Position) {
    const occupant = pieces.find(p => p.position.x === position.x && p.position.y === position.y);
    if (run.phase === 'prepare' && selectedId && run.inventory.some(p => p.id === selectedId) && position.y >= 3 && occupant?.side !== 'enemy') {
      const next = placePiece(run, selectedId, position);
      if (next === run && occupant?.id !== selectedId) setToast('配置できません。出陣は王を含め最大6枚です。');
      setRun(next);
    } else setSelectedId(occupant?.id ?? null);
  }
  function onStart() {
    const next = startBattle(run);
    if (next === run) { setToast('王を含む軍勢を配置してください。'); return; }
    setRun(next); setSelectedId(null); setRunning(true); setRewardHidden(false);
  }
  function onStep() {
    setRunning(false);
    if (!run.battle || run.phase !== 'battle') return;
    const battle = stepBattle(run.battle);
    setRun(battle.phase === 'finished' ? finishBattle(run, battle) : { ...run, battle });
    if (battle.phase === 'finished') { setSelectedId(null); setRewardHidden(false); }
  }
  function onFinish() {
    setRunning(false);
    if (!run.battle || run.phase !== 'battle') return;
    setRun(finishBattle(run, runBattle(run.battle))); setSelectedId(null); setRewardHidden(false);
  }
  function onReward(id: string) {
    const reward = run.rewardChoices.find(r => r.id === id);
    const next = selectReward(run, id);
    if (next === run) return;
    setRun(next); setSelectedId(null); setRewardHidden(false);
    setToast(`${reward?.title ?? '新しい仲間'}を軍勢に迎えました`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function onNew() {
    setRunning(false); setRun(createRun()); setSelectedId(null); setModal(null); setRewardHidden(false); setShowThreats(true);
    setToast('王と歩から、新たな遠征へ'); window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return <>
    <div inert={overlay || undefined}>
      <header className="site-header"><a className="brand" href="./" aria-label="将棋サバイバー ホーム"><span className="brand-mark">王</span><span>将棋サバイバー<small>SHOGI SURVIVOR</small></span></a><div className="header-right"><span className="edition">ROGUELIKE AUTO BATTLER <i>MVP 0.1</i></span><button className="header-help" data-action="help" onClick={() => { setRunning(false); setModal('help'); }}><Icon name="book" /><span>遊び方</span></button><button className="icon-button" data-action="new" aria-label="新しい遠征" title="新しい遠征" onClick={() => { setRunning(false); setModal('new'); }}><Icon name="refresh" /></button></div></header>
      <main className="game-layout"><aside className="journey"><div className="section-eyebrow">THE EXPEDITION</div><h2>五門の遠征</h2><p className="muted small">小さな軍勢で、天守を目指せ。</p><ol className="journey-list">{STAGES.map((name, i) => {
        const done = i < run.victories, current = i === run.stageIndex && run.phase !== 'victory';
        return <li key={name} className={`${done ? 'done' : ''} ${current ? 'current' : ''}`}><span className="node-index">{done ? '✓' : String(i + 1).padStart(2, '0')}</span><span><span className="node-title">{name}</span><span className="node-caption">{i === 4 ? '最終戦 · 飛車の待つ天守' : i === 1 ? '戦闘 · ルール遺物の覚醒' : i >= 2 ? '戦闘 · 異能を持つ仲間' : '戦闘 · 新たな仲間'}</span></span>{current && <span className="current-dot" />}</li>;
      })}</ol><div className="journey-note"><span className="note-symbol">歩</span><p>始まりは、王と歩。<br />どんな軍勢になるかは、<br />あなたの一手次第。</p></div><div className="journey-principles"><span>5 × 5 の盤面</span><span>1勝につき、仲間を1枚。</span><span>同じ布陣は、同じ結末に。</span></div></aside>
        <section className="battle-panel"><div className="stage-heading"><div><div className="section-eyebrow">GATE {String(run.stageIndex + 1).padStart(2, '0')} <span>/ 05</span></div><h1>{STAGES[run.stageIndex]}</h1></div><span className={`phase-label ${run.phase === 'battle' ? 'is-battle' : ''}`}>{run.phase === 'prepare' ? '布陣のとき' : run.phase === 'battle' ? '交戦中' : run.phase === 'defeat' ? '遠征終了' : '勝利'}</span></div>
          <div className="mobile-progress" aria-label="遠征の進行">{STAGES.map((_, i) => <span key={i} className={`${i < run.victories ? 'done' : ''} ${i === run.stageIndex ? 'current' : ''}`} />)}<small>{run.victories} / 5 突破</small></div>
          <div className="combat-caption"><span>一撃撃破</span><span>味方 1枚 <b>⇄</b> 敵 1枚</span><span>交互オートバトル</span></div>
          <Board pieces={pieces} selectedId={selectedId} canDeploy={run.phase === 'prepare' && run.inventory.some(p => p.id === selectedId)} isPreparing={run.phase === 'prepare'} showThreats={showThreats} events={lastEvents} onCell={onCell} onThreats={() => setShowThreats(!showThreats)} />
          {run.phase === 'prepare' ? <Preparation onStart={onStart} /> : run.phase === 'battle' && run.battle ? <Battle battle={run.battle} running={running} speed={speed} onPause={() => setRunning(!running)} onStep={onStep} onSpeed={setSpeed} onFinish={onFinish} /> : <div className={`result-strip ${run.phase === 'defeat' ? 'lost' : ''}`}><span>{run.phase === 'defeat' ? '遠征終了' : run.phase === 'victory' ? '五門制覇' : '敵王、討ち取ったり。'}</span><button className="primary-button" data-action="show-result" onClick={() => setRewardHidden(false)}>{run.phase === 'reward' ? '仲間を選ぶ' : '結果を見る'}<Icon name="arrow" /></button></div>}
          <section className="battle-log"><div className="section-heading"><h3>戦況記録</h3><span className="small muted">全行動 · スクロールで振り返る</span></div><div className="log-entries" aria-live={running ? 'off' : 'polite'}>{run.battle?.eventLog.length ? [...run.battle.eventLog].reverse().map((e, i) => <p key={`${e.halfTurn}-${i}`} className={`log-entry ${i === 0 ? 'latest' : ''} event-${e.type}`} title={e.reason}><span className="log-dot" /><span><small className="log-halfturn">{String(e.halfTurn).padStart(2, '0')}</small>{e.text}{e.reason && <span className="log-reason">{e.reason}</span>}</span></p>) : <p className="log-empty">布陣を決めたら、戦闘を開始。<br />一手ごとの行動とAIの判断がここに残ります。</p>}</div></section>
        </section><aside className="right-panel"><Army run={run} pieces={pieces} selectedId={selectedId} onSelect={setSelectedId} onArrange={() => { setRun(autoArrange(run)); setSelectedId(null); setToast('軍勢の配置を整えました'); }} onBench={() => { if (selectedId) setRun(placePiece(run, selectedId, null)); }} /></aside>
      </main>
      <footer className="site-footer"><span>一手を、運命に。</span><p>王と歩からはじまる、小さな戦記。</p><span className={`save-status ${saveWarning ? 'warning' : ''}`}><i />{saveWarning ? '保存できません · 遊びは継続できます' : 'このブラウザに自動保存'}</span></footer>
    </div>
    {modal === 'help' ? <Modal kind="help" onClose={() => setModal(null)}><Help onClose={() => setModal(null)} /></Modal> : modal === 'new' ? <Modal kind="new" onClose={() => setModal(null)}><div className="section-eyebrow">NEW EXPEDITION</div><h2 id="modal-title">新たな遠征へ。</h2><p className="modal-intro">王と歩の2枚から、もう一度。<br />現在の遠征の途中保存は置き換わります。</p><button className="primary-button full-width new-run-button" data-action="confirm-new" onClick={onNew}>遠征をはじめる<Icon name="arrow" /></button><button className="text-button board-return" data-action="close" onClick={() => setModal(null)}>今の遠征に戻る</button></Modal> : !rewardHidden && run.phase === 'reward' ? <Modal kind="reward"><Reward run={run} onChoose={onReward} onBoard={() => setRewardHidden(true)} /></Modal> : !rewardHidden && (run.phase === 'victory' || run.phase === 'defeat') ? <Modal kind="result"><Result run={run} onRetry={onNew} onBoard={() => setRewardHidden(true)} /></Modal> : null}
    {toast && <div className="toast" role="status">{toast}</div>}
  </>;
}
