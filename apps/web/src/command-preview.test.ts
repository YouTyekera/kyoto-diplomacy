import { expect,it } from 'vitest';
import { supportPreview } from './BottomActionBar';
import type { Unit } from '../../../packages/rules-core';
it('identifies the supported army by target ID and separates its current location from its destination',()=>{
 const units:Unit[]=[{unitId:'helper',regionId:'a',ownerWardId:'26101',type:'army'},{unitId:'target',regionId:'b',ownerWardId:'26102',type:'army'}];
 expect(supportPreview({type:'support-hold',unitId:'helper',targetUnitId:'target'},units)).toEqual({kind:'support',origin:'b'});
 expect(supportPreview({type:'support-move',unitId:'helper',targetUnitId:'target',destination:'c'},units)).toEqual({kind:'support',origin:'b',destination:'c'});
 expect(supportPreview({type:'support-hold',unitId:'helper',targetUnitId:'missing'},units)).toBeUndefined();
});
