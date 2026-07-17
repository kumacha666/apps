export type UnitSide = "player" | "enemy";

export interface Unit {
  id: string;
  side: UnitSide;
  hp: number;
  maxHp: number;
  atk: number;
  /** 硬質化で伸ばす防御力。被ダメ倍率(dmgTakenMult)はdefが変わるたびに必ず同時に再計算すること */
  def: number;
  critChance: number;
  critMult: number;
  dmgOutMult: number;
  dmgTakenMult: number;
  attackCount: number;
  aoeLevel: number;
  retaliateLevel: number;
  tauntLevel: number;
  alive: boolean;
}

export interface RunStats {
  maxTurnDamage: number;
  maxTurnKills: number;
}

export interface GameState {
  round: number;
  playerUnits: Unit[];
  enemyUnits: Unit[];
  deck: Card[];
  /** 累積SCORE。1ラン中はリセットされず、「最初から」した時だけ0に戻る */
  score: number;
  stats: RunStats;
  /** このランの通常クリア層数（タイトル画面で選択、10/15/20層）。これを超えるとエンドレス扱いになる */
  finalRound: number;
  /**
   * 挑発の「1ラウンドにつきtauntLevel回ぶんダメージを完全無効化」の残り回数（ユニットidをキーに保持）。
   * 1回の戦闘（1つのround）はbattleTick()がsetTimeoutで自分自身を再帰的に何度も呼び出す構造のため、
   * enemyAttackTurn()内のローカル変数では呼び出しのたびにリフィルされてしまう。
   * 必ずstartBattle()（ラウンドが変わり敵編成を生成するタイミング）で初期化し、
   * その戦闘が決着するまでenemyAttackTurnの複数回の呼び出しにまたがって保持・消費する。
   */
  tauntBlockBudget: Map<string, number>;
}

export interface CardApplyResult {
  message: string;
  /** 実際に効果が適用されたユニット（対象未選択でランダムに決まった場合も、そのランダムな実体を返す）。
   * 全体・複数体対象のカード（増援・合体など）はハイライト不要のためundefinedのままでよい */
  appliedUnit?: Unit | null;
}

export interface Card {
  id: string;
  name: string;
  desc: string;
  singleTarget?: boolean;
  apply: (state: GameState, chosenUnit?: Unit | null) => CardApplyResult;
}

/** 1回の攻撃アクション（連撃・全体攻撃を含む一連のヒット）で発生した1ヒット分の結果 */
export interface HitResult {
  attacker: Unit;
  target: Unit;
  damage: number;
  isCrit: boolean;
  wasKilled: boolean;
  hitIndex: number;
  /** このヒット直後の対象のHP（段階的なアニメーション再生用） */
  hpAfter: number;
  /** 「同じ1回の振り」を識別するID（アニメーション演出専用）。同じ攻撃者・同じhitIndexでも、
   * 別々の攻撃アクション（例: 反撃持ちが複数回に分けて反撃した場合の各反撃）ならswingIdは別になる。
   * hitIndexだけでは「1回のAoE振りで複数体に同時ヒット」と「別々の攻撃が偶然hitIndexが同じ」を
   * 区別できないため導入した（2026-07-15、Codexレビュー指摘） */
  swingId?: number;
  /** 挑発のブロック予算で完全無効化されたヒットか。damage===0だけでは、DEFの軽減で自然に0へ丸められた
   * ケースと区別できないため導入した */
  blocked?: boolean;
  /** blocked===trueのヒットについて、このヒットでブロック予算を消費した直後の残り回数。
   * 「ちょうどこのヒットで盾が尽きた（0になった）」かどうかをアニメーション側が判定するために持つ
   * （state.tauntBlockBudgetは戦闘ターン全体を解決し終えた後の最終値しか持たないため、
   * 個々のヒットの時点の値を別途記録する必要がある） */
  blockRemainingAfter?: number;
}
