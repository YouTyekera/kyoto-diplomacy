/** Locally generated, replaceable WAV placeholders. Missing audio never gates a game operation.
 * Lengths are replacement guidance from AUDIO_PLACEHOLDER_PLAN.md, not timers.
 */
export const sfxManifest = {
 select: {label:'選択',src:'/audio/sfx/select.wav',lengthMs:[40,80],trigger:'自軍の選択'},
 'order-confirm': {label:'命令',src:'/audio/sfx/order-confirm.wav',lengthMs:[80,150],trigger:'命令の受理'},
 march: {label:'進軍',src:'/audio/sfx/march.wav',lengthMs:[200,400],trigger:'移動演出中の単一グループ'},
 'support-success': {label:'支援',src:'/audio/sfx/support-success.wav',lengthMs:[120,220],trigger:'裁定の支援成功'},
 'sc-capture': {label:'補給拠点',src:'/audio/sfx/sc-capture.wav',lengthMs:[180,350],trigger:'自勢力の補給拠点増加'},
 standoff: {label:'競合',src:'/audio/sfx/standoff.wav',lengthMs:[120,220],trigger:'裁定のスタンドオフ'},
 victory: {label:'勝利',src:'/audio/sfx/victory.wav',lengthMs:[600,1200],trigger:'本人の勝利・共同勝利'},
} as const;

