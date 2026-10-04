import {it,expect,vi} from 'vitest';
import {onlineTarget} from './online-target';
import {OnlineConnection,backoffMs,probeHealth} from './online-connection';
import {inviteLink} from './RoomCard';
it('公開接続はHTTPS env必須・URL中の秘密/localhostを拒否、招待はFrontend origin',()=>{
 expect(onlineTarget(undefined,true,'https://web.example').url).toBeUndefined();
 for(const url of ['http://backend.example','https://localhost','https://127.0.0.1','https://u:secret@backend.example','https://backend.example/path'])expect(onlineTarget(url,true,'https://web.example').error).toBeTruthy();
 expect(onlineTarget('https://backend.example/',true,'https://web.example').url).toBe('https://backend.example');
 expect(onlineTarget(undefined,false,'http://192.168.1.1:5173').url).toBe('http://192.168.1.1:5173');
 expect(inviteLink('https://web.example','ABC234')).toBe('https://web.example/?room=ABC234');
});
it('healthはJSON ok:trueだけ受理し、Render起動HTML/404/通信障害を吸収する',async()=>{
 const signal=new AbortController().signal;
 for(const response of [new Response('<html>waking</html>'),new Response('{"ok":false}'),new Response('{"ok":true}',{status:404})])expect(await probeHealth('https://backend.example',signal,vi.fn().mockResolvedValue(response))).toBe(false);
 expect(await probeHealth('https://backend.example',signal,vi.fn().mockRejectedValue(Error('raw socket error')))).toBe(false);
 const fetcher=vi.fn().mockResolvedValue(new Response('{"ok":true}'));expect(await probeHealth('https://backend.example',signal,fetcher)).toBe(true);expect(fetcher.mock.calls[0][0].href).toBe('https://backend.example/health');
});
it('指数backoff・90秒待ち・unavailableから再試行・復帰後はhealth反復しない',async()=>{
 vi.useFakeTimers();const states:string[]=[],health=vi.fn().mockResolvedValue(false),connect=vi.fn().mockResolvedValue(undefined),disconnect=vi.fn();
 const connection=new OnlineConnection({health,connect,disconnect,state:s=>states.push(s)});
 try{
  expect([0,1,2,3,4].map(n=>backoffMs(n,.5))).toEqual([1000,2000,4000,5000,5000]);
  connection.start();await vi.advanceTimersByTimeAsync(90000);expect(states[0]).toBe('connecting');expect(states).toContain('waking');expect(states.at(-1)).toBe('unavailable');expect(connect).not.toHaveBeenCalled();
  health.mockResolvedValue(true);connect.mockRejectedValueOnce(Error('temporarily unavailable'));connection.start(true);await vi.advanceTimersByTimeAsync(6000);expect(states).toContain('retrying');expect(states.at(-1)).toBe('online');
  const count=health.mock.calls.length;await vi.advanceTimersByTimeAsync(120000);expect(health.mock.calls.length).toBe(count);expect(states.at(-1)).toBe('online');
 }finally{connection.dispose();vi.useRealTimers();}
});
it('unmount/やり直しの古い非同期health結果が接続や表示を上書きしない',async()=>{
 vi.useFakeTimers();let resolve!:(value:boolean)=>void;const state=vi.fn(),connect=vi.fn(),disconnect=vi.fn();
 const connection=new OnlineConnection({health:()=>new Promise<boolean>(r=>{resolve=r;}),connect,disconnect,state});
 connection.start();connection.dispose();resolve(true);await Promise.resolve();expect(connect).not.toHaveBeenCalled();expect(state).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(90000);expect(state).toHaveBeenCalledTimes(1);vi.useRealTimers();
});
