import { expect,it } from 'vitest';
import { barricadeUnavailableReason } from './BottomActionBar';
import { army,R } from '../../../tests/gameplay-fixture';
it('distinguishes missing equipment, reservation and absent safe edges without changing legal orders',()=>{
 const unit=army('r',R,'a'),inventory=[{equipmentId:'wall',type:'barricade' as const,ownerWardId:R}],hold={type:'hold' as const,unitId:'r'};
 expect(barricadeUnavailableReason(unit,[],[],[hold],[])).toContain('所持していません');
 expect(barricadeUnavailableReason(unit,inventory,[{equipmentId:'wall',type:'barricade',unitId:'other'}],[hold],[])).toContain('予約済み');
 expect(barricadeUnavailableReason(unit,inventory,[],[hold],[])).toContain('合法な設置辺がありません');
 expect(barricadeUnavailableReason(unit,inventory,[],[],[])).toContain('確認中');
 const order={type:'deploy-barricade' as const,unitId:'r',equipmentId:'wall',targetRegionId:'b'};
 expect(barricadeUnavailableReason(unit,inventory,[{equipmentId:'wall',type:'barricade',unitId:'r'}],[hold,order],[])).toBeUndefined();
});
