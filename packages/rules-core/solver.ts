/** Independent Boolean constraint solver. Interval propagation never guesses a strength result.
 * Assumptions are checked against every equation. Move=true is tried first so unopposed
 * cycles of 3+ armies rotate; no convoy/paradox variant is part of this engine. */
export type Truth = boolean | undefined;
export type State = Map<string,boolean>;
export interface Equation { id:string; evaluate:(state:State)=>Truth }
export function solve(equations:Equation[]): State | null {
  function search(input:State):State|null {
    const state=new Map(input);
    let changed=true;
    while(changed) {
      changed=false;
      for(const equation of equations) {
        const result=equation.evaluate(state);
        if(result===undefined) continue;
        if(state.has(equation.id) && state.get(equation.id)!==result) return null;
        if(!state.has(equation.id)) {state.set(equation.id,result);changed=true;}
      }
    }
    const unknown=equations.find(e=>!state.has(e.id));
    if(!unknown) return state;
    for(const value of [true,false]) {
      const branch=new Map(state);branch.set(unknown.id,value);
      const result=search(branch);if(result) return result;
    }
    return null;
  }
  return search(new Map());
}
export type Range = {min:number;max:number};
export const fixed=(value:number):Range=>({min:value,max:value});
export function greater(a:Range,b:Range):Truth { return a.min>b.max?true:a.max<=b.min?false:undefined; }
export function all(values:Truth[]):Truth {return values.includes(false)?false:values.includes(undefined)?undefined:true;}
export function none(values:Truth[]):Truth {return values.includes(true)?false:values.includes(undefined)?undefined:true;}
