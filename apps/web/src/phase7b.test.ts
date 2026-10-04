import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {LandingPage,titleCopy} from './LandingPage';
import {playerMessage} from './player-language';
import {BottomActionBar,useMapCommands} from './BottomActionBar';
vi.mock('./online-target',()=>({currentOnlineTarget:()=>({publicMode:true,error:undefined,url:'https://example.test'})}));
it('確定コピーを一字一句保持する',()=>{
 expect(titleCopy).toBe('3〜11人で京都の街を奪い合う、交渉型オンライン戦略ゲーム。\n全員が同時に命令を出し、表面上の協力・裏切り・イベントを駆使して補給拠点の制覇を目指そう！');
});
it('公開ブランドのrubyと安全な作者リンクを説明の直後に表示する',()=>{
 const html=renderToStaticMarkup(createElement(LandingPage,{online:()=>{},local:()=>{},settings:()=>{},localDisabled:false,children:null}));
 expect(html).toContain('<ruby>京都ま市ー<rt>きょうとましー</rt></ruby>');
 expect(html).toContain('href="https://x.com/ReindeerSkyBean" target="_blank" rel="noopener noreferrer">ようちぇけら</a>');
 expect(html.indexOf('制覇を目指そう！')).toBeLessThan(html.indexOf('Presented by'));expect(html.indexOf('Presented by')).toBeLessThan(html.indexOf('オンライン対戦'));
 expect(html).not.toContain('京都市版 Diplomacy');
});
it('表示層だけでArmy/SCを翻訳する',()=>{
 expect(playerMessage('Army / army数 / 選択Army / Armyなし / SC')).toBe('陸軍 / 陸軍数 / 選択中の陸軍 / 陸軍なし / 補給拠点');
 function Dock(){const unit={unitId:'internal-army-id',type:'army' as const,ownerWardId:'26102' as const,regionId:'a'},commands=useMapCommands({units:[unit],ownUnits:[unit],legalOrders:{},inventory:[],choose:()=>{},locked:false,contextKey:'test'});return createElement(BottomActionBar,{commands:{...commands,unit},units:[unit],regionName:()=> '桃園'});}
 const html=renderToStaticMarkup(createElement(Dock));expect(html).toContain('選択中の陸軍');expect(html.replace(/class="[^"]*"/g,'')).not.toMatch(/army|\bSC\b/i);
});
it('静的HTMLに公開URL・OGP・Discord用画像metadataを設定する',()=>{
 const html=readFileSync('apps/web/index.html','utf8');expect(html).toContain('<title>京都ま市ー</title>');expect(html).not.toContain('京都市版 Diplomacy');
 for(const attr of ['name="description"','property="og:description"','name="twitter:description"'])expect(html).toContain(`${attr} content="${titleCopy.replace('\n','')}"`);
 for(const attr of ['property="og:title"','name="twitter:title"'])expect(html).toContain(`${attr} content="京都ま市ー"`);
 for(const value of ['og:title','og:description','og:type','og:url','og:image','og:image:width','og:image:height','og:image:alt','twitter:card','twitter:title','twitter:description','twitter:image'])expect(html).toContain(`"${value}"`);
 expect(html).toContain('content="https://kyoto-diplomacy-web.onrender.com/"');expect(html).toContain('content="https://kyoto-diplomacy-web.onrender.com/og/kyoto-diplomacy-og.png"');expect(html).toContain('summary_large_image');
});
