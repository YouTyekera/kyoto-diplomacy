import type { ReasonCode } from '../rules-core/model';
export const reasonText:Record<ReasonCode,string>={
  held:'保持に成功',moved:'移動に成功',blocked:'防御または他の攻撃を上回れません',
  'self-dislodgement':'自軍の自己排除は禁止です','head-to-head':'向かい合う移動に勝てません','standoff':'同戦力の競合で進めません',
  supported:'支援が有効','support-cut':'攻撃または排除で支援がカットされました','support-mismatch':'支援と対象の実命令が一致しません',
  dislodged:'他軍に排除され、撤退が必要',retreated:'撤退に成功','retreat-collision':'撤退先の競合により解散',
  disbanded:'指定により解散','no-retreat':'合法な撤退先がなく解散',
};
