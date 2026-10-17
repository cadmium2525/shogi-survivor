import { legalMoves } from '../game/moves.ts';
import { getPieceInfo } from '../game/catalog.ts';
import { BOARD_SIZE } from '../game/types.ts';
import type { GameEvent, Piece, Position } from '../game/types.ts';
import { Icon, PieceToken } from './Shared.tsx';

interface Props {
  pieces: Piece[];
  selectedId: string | null;
  canDeploy: boolean;
  isPreparing: boolean;
  showThreats: boolean;
  events: GameEvent[];
  onCell: (position: Position) => void;
  onThreats: () => void;
}
export default function Board({ pieces, selectedId, canDeploy, isPreparing, showThreats, events, onCell, onThreats }: Props) {
  const selected = pieces.find(p => p.id === selectedId);
  const moves = selected ? legalMoves(selected, pieces) : [];
  const threats = showThreats ? pieces.filter(p => p.side === 'enemy').flatMap(p => legalMoves(p, pieces)) : [];
  return <>
    <div className="board-head"><span className="team-label enemy-label"><i />敵陣 <span>{pieces.filter(p => p.side === 'enemy').length}枚</span></span><span className="board-objective">{isPreparing ? '上端で歩→と金・飛→龍王に成る' : '自動で成り · 王の捕獲で決着'}</span></div>
    <div className="board-frame"><div className="file-labels">{['一', '二', '三', '四', '五'].map(n => <span key={n}>{n}</span>)}</div>
      <div className="board-surface"><div className="board" aria-label="5列5行の将棋盤">
        {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, i) => {
          const x = i % BOARD_SIZE, y = Math.floor(i / BOARD_SIZE);
          const piece = pieces.find(p => p.position.x === x && p.position.y === y);
          const deployable = canDeploy && y >= 3;
          const threatened = threats.some(p => p.x === x && p.y === y);
          const moved = events.some(e => e.to?.x === x && e.to.y === y);
          const classes = [piece?.id === selectedId ? 'selected' : '', deployable ? 'deployable' : '', threatened ? 'threatened' : '', moved ? 'just-moved' : '', isPreparing && y >= 3 ? 'home-zone' : ''].join(' ');
          return <button key={i} className={`square ${classes}`} data-action="cell" data-x={x} data-y={y} aria-label={`${x + 1}列${y + 1}段 ${piece ? `${piece.side === 'ally' ? '味方' : '敵'} ${getPieceInfo(piece).name}` : '空きマス'}${y === 0 ? ' 味方の成りエリア' : y === 4 ? ' 敵の成りエリア' : ''}${deployable ? ' 配置可能' : ''}${threatened ? ' 敵の攻撃範囲' : ''}`} aria-pressed={piece ? selectedId === piece.id : undefined} onClick={() => onCell({ x, y })}>
            {piece && <PieceToken {...piece} />}
            {moves.some(p => p.x === x && p.y === y) && <span className="move-dot" />}
            {!piece && deployable && <span className="deploy-plus">＋</span>}
            {threatened && !piece && <span className="threat-mark" aria-hidden="true">×</span>}
          </button>;
        })}
      </div></div>
      <div className="rank-labels">{['一', '二', '三', '四', '五'].map(n => <span key={n}>{n}</span>)}</div>
    </div>
    <div className="board-foot"><span className="team-label"><i />自陣 <span>{pieces.filter(p => p.side === 'ally').length}枚</span></span><button className={`text-button ${showThreats ? 'on' : ''}`} data-action="threats" aria-pressed={showThreats} onClick={onThreats}><Icon name="eye" />危険マスを{showThreats ? '隠す' : '表示'}</button></div>
  </>;
}
