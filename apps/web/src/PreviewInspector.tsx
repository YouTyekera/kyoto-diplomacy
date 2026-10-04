import type { GameStatePreview, RegionControl } from '../../../packages/shared/preview';
import { setPreviewUnit, validatePreview } from '../../../packages/shared/preview';
import { WARDS, type MapDefinition, type WardId } from '../../../packages/shared/model';

interface Props { map: MapDefinition; state: GameStatePreview; selected: string | null; onChange: (value: GameStatePreview) => void }
function OwnerSelect({ value, label, onChange, nullable = false }: {
  value: WardId | null; label: string; nullable?: boolean; onChange: (value: WardId | null) => void;
}) {
  return <label>{label}<select aria-label={label} value={value ?? ''} onChange={e => onChange((e.target.value || null) as WardId | null)}>
    {nullable && <option value="">中立 / 未支配</option>}
    {WARDS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
  </select></label>;
}
export function PreviewInspector({ map, state, selected, onChange }: Props) {
  const region = map.regions.find(r => r.regionId === selected);
  const control = selected ? state.regionControl[selected] : undefined;
  const unit = state.units.find(u => u.regionId === selected);
  function update(patch: Partial<RegionControl>) {
    if (selected && control) onChange({ ...state, regionControl: { ...state.regionControl, [selected]: { ...control, ...patch } } });
  }
  const issues = validatePreview(state, map);
  return <section className="preview-inspector">
    <h2>ゲームプレビュー</h2><p className="preview-caption">表示確認専用です。占領・裁定・勝敗処理は行いません。</p>
    {region && control ? <>
      <h3>{region.name}</h3>
      <OwnerSelect value={control.controllerWardId} label="現在の支配勢力" nullable onChange={v => update({ controllerWardId: v })} />
      {region.isSupplyCenter ? <OwnerSelect value={control.supplyCenterOwnerWardId} label="補給拠点の現在所有勢力" nullable onChange={v => update({ supplyCenterOwnerWardId: v })} />
        : <p className="hint">この地域は補給拠点ではありません。</p>}
      <label className="check"><input type="checkbox" aria-label="プレビューユニットを配置" checked={!!unit}
        onChange={e => onChange(setPreviewUnit(state, region.regionId, e.target.checked ? region.wardId : null))} />プレビューユニットを配置</label>
      {unit && <OwnerSelect value={unit.ownerWardId} label="プレビューユニットの勢力" onChange={v => onChange(setPreviewUnit(state, region.regionId, v))} />}
      <p className="hint">支配色・補給拠点所有者・ユニット所有者は別々です。静的マップの初期配置や拠点設定は変更されません。</p>
    </> : <p className="hint">採用され、侵入可能な地域を選択してください。障害物そのものには配置できません。</p>}
    {issues.map((message, i) => <p key={i} className="issue error">{message}</p>)}
    <table><thead><tr><th>勢力</th><th>支配</th><th>補給拠点の所有</th><th>ユニット</th></tr></thead><tbody>{WARDS.map(w => <tr key={w.id}>
      <th>{w.name}</th><td>{Object.values(state.regionControl).filter(c => c.controllerWardId === w.id).length}</td>
      <td>{Object.values(state.regionControl).filter(c => c.supplyCenterOwnerWardId === w.id).length}</td>
      <td>{state.units.filter(u => u.ownerWardId === w.id).length}</td>
    </tr>)}</tbody></table>
  </section>;
}
