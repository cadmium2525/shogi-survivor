# Word仕様と実装・検証の対応

参照仕様は「ゲーム企画書 MVP 0.1」と「Codex実装指示書」。ゲーム処理を `src/game/`、表示と操作をReactコンポーネントへ分離している。以下はコードとテストケースの対応表で、テスト実行の成否は [検証記録](TESTING.md) に記録する。

| 仕様の要件 | 実装 | 対応する検証 |
| --- | --- | --- |
| TypeScript + React + Vite、Vitest | `package.json`、`src/App.tsx`、`src/main.tsx`、`vite.config.ts` | `npm test`、`npm run build` |
| 5×5盤、王・歩・金・飛 | `src/game/types.ts`、`catalog.ts`、`moves.ts` | `tests/engine.test.ts`: `5×5 traditional movement` の全3ケース |
| 盤外・味方重複不可、前方の陣営差、飛車の遮蔽と捕獲 | `src/game/moves.ts`: `legalMoves` | `keeps all four types on board and excludes friendly squares`、`reverses pawn and gold forward directions between armies`、`rook stops before allies and after the first enemy without jumping` |
| 王と歩で開始、下2段、王必須、配置・解除・交換、出撃6枚・控え | `src/game/progression.ts`: `createRun`、`placePiece`、`autoArrange` | `tests/progression.test.ts`: 初期編成、配置交換、最終7枚と控え、自動配置の各ケース |
| 全5戦の固定敵、事前公開、初手の王即死を回避 | `src/game/stages.ts`、`src/App.tsx`、`src/components/Board.tsx` | `uses exactly the five prescribed fixed enemy compositions`、`protects both initial kings, including every possible home-rank rook placement` |
| 味方先手、通常は陣営1枚ずつ交互に行動 | `src/game/engine.ts`: `createBattle`、`applyAction` | `moves only one army piece and alternates normally` |
| 全自軍駒の全合法手から毎回1手を選択、巡回順なし | `src/game/ai.ts`: `enumerateActions`、`chooseAction` | `selects any army piece and always prioritizes immediate king capture`、`sorts candidate ties by ID then y then x independently of array order` |
| 通常は一撃撃破、王捕獲で即終了 | `src/game/effects.ts`: `resolveMove`、`src/game/engine.ts` | `captures an ordinary target in one hit and occupies its square`、`ends on king capture and ignores later step calls` |
| 80半手・双方連続パスは敗北、王捕獲を上限より優先 | `src/game/engine.ts`: `applyAction`、`finish` | `counts 80 half-turns as enemy win but king capture has precedence`、`passes only when all army moves are blocked and mutual pass loses` |
| 合法手がないときだけパス、パスでは反転しない | `src/game/ai.ts`、`engine.ts` | `rejects voluntary passes and illegal or wrong-side moves`、`passes only when all army moves are blocked and mutual pass loses` |
| 鉄壁は1戦1回、攻撃側は動かず捕獲不成立、王にも適用 | `src/game/effects.ts`: `hasShield`、`resolveMove`、`engine.ts`: `createBattle` | `iron blocks once without movement, split, or combo; second attack captures`、`iron protects kings and restores its one shield at the start of a new battle` |
| 連撃は捕獲成功で同陣営に追加1半手、再連撃なし、別駒でも行動可能 | `src/game/engine.ts`: `pendingExtraAction` の更新 | `combo is never granted by an ordinary noncapture move`、`extra action can use another piece but cannot trigger another combo` |
| 分裂は捕獲側の移動元に歩1枚、能力なし、盤上8枚上限 | `src/game/effects.ts`: `resolveMove` | `split belongs to capturer and creates an abilityless pawn on its from square`、`suppresses split if the capturer already has eight allied pieces on board` |
| 遺物による盤面全体の8方向反転、王を除外・王をまたがない | `src/game/effects.ts`: `othelloTargets`、`resolveMove` | `flips all eight directions independently while retaining type, abilities, shield`、`checks brackets elsewhere on the whole board and converts continuous enemy chains`、`does nothing without relic, across gaps, or across an opposing king` |
| 反転は1スナップショット、連鎖なし、上→下・左→右、盤上8枚まで | `src/game/effects.ts`: 対象収集→重複除去→y/x順→上限適用→反転 | `never chains a second scan from a just-converted piece`、`applies the eight-piece cap in top-to-bottom left-to-right target order`、`prioritizes the upper target before a lower target with a smaller x coordinate` |
| 反転後も能力と盾消費を保持、召喚IDを再利用しない | `src/game/effects.ts`、`engine.ts` | `preserves a consumed iron shield when a piece changes sides`、`never reuses an initial summoned-looking ID even after capturing that piece` |
| 反転は行動側だけに適用し、敵にも同じルール | `src/game/effects.ts`: `actor.side` に対する処理 | `enables the same rule for the enemy army` |
| 捕獲→分裂→反転→勝敗→連撃、鉄壁時の分裂・連撃不発 | `src/game/effects.ts`、`engine.ts` | `scans after iron blocks but does not grant split or combo`、`orders king capture, split, flip, victory; no extra action follows victory` |
| 王捕獲最優先、自王保護、相手の次の最良捕獲、鉄壁、駒別の位置価値 | `src/game/ai.ts`: `bestOpponentCapture`、`positionValue`、`chooseAction` | `selects any army piece and always prioritizes immediate king capture`、`removes immediate king capture risk when a safe escape exists`。個別重みはコードレビューで確認 |
| 決定的な同点解決、同じ結果とログ、純粋関数・不変更新 | `src/game/ai.ts`、`engine.ts`、`effects.ts` | `sorts candidate ties by ID then y then x independently of array order`、`reproduces all decisions, outcomes, and Japanese logs from the same state`、`immutably clones positions, ability arrays, and cumulative event history` |
| 毎勝利3候補から駒1枚、王を除外、重複なし、第3戦勝利以降は能力付き | `src/game/rewards.ts`、`progression.ts` | `offers three distinct piece types, with fixed abilities from third clear onwards`、`requires a new piece after every win including boss, ending with seven owned pieces` |
| 第2戦勝利でオセロ遺物、最終戦も報酬後クリア | `src/game/progression.ts`: `finishBattle`、`selectReward` | `unlocks the relic after second clear and applies it from third battle`、`requires a new piece after every win including boss, ending with seven owned pieces` |
| 最初から全5戦を遊んでクリア、敗北と再挑戦 | `src/App.tsx`、`src/components/Preparation.tsx`、`Battle.tsx`、`Reward.tsx`、`Result.tsx` | `completes all five actual AI battles, mandatory boss reward and identical replay`、ブラウザスモークテスト |
| 危険マス、AIの判断理由、能力ログ、停止・1手送り・速度、基本キーボード | `src/App.tsx`、`src/components/Board.tsx`、`Battle.tsx`、`Shared.tsx` | ブラウザスモークテスト。陣営を敵/味方の文字と駒の向きでも区別 |
| 無料・バックエンド不要・GitHub Pagesのスマートフォン利用 | `vite.config.ts` の相対base、`.github/workflows/deploy.yml`、`src/style.css` | 本番ビルド、サブパス配信、狭い画面のブラウザ検証。実Pages・実機は公開後確認 |
| 追加機能：同じブラウザ内の一時保存、停止状態で復元 | `src/game/storage.ts`、`src/App.tsx` | `versioned defensive save` の全3ケース、全5戦リプレイ中の停止状態保存・復元、ブラウザ再読込 |

## 仕様上の仮定

具体的な初期座標・報酬の能力割り当て・AIの評価重みは固定データで定義する。所持駒の永久離脱は採用せず、召喚・反転は戦闘内に限定する。能力の付け替え・合成やメタ成長は導入しない。スマートフォン向けの途中保存だけを小さな追加機能として扱う。
