import { Icon } from './Shared.tsx';

export default function Preparation({ onStart }: { onStart: () => void }) {
  return <><div className="prepare-tip"><span className="tip-number">01</span><p><b>布陣が、勝敗を決める。</b><span>下2段が配置エリア。味方のいるマスで位置交換。</span></p></div><div className="battle-controls"><button className="primary-button start-button" data-action="start" onClick={onStart}><Icon name="play" />戦闘を開始<span className="button-aside">AUTO BATTLE</span></button></div></>;
}
