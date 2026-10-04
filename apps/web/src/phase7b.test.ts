import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {titleCopy} from './LandingPage';
import {playerMessage} from './player-language';
import {BottomActionBar,useMapCommands} from './BottomActionBar';
it('確定コピーを一字一句保持する',()=>{
 expect(titleCopy).toBe('京都の街を分け合い、交渉し、裏をかき、補給拠点を奪い合う。\n一手の読みと会話の駆け引きが、そのまま勝敗につながる。\n本家ディプロマシーに運の要素を加えた京都発戦略ボードゲーム');
});
it('表示層だけでArmy/SCを翻訳する',()=>{
 expect(playerMessage('Army / army数 / 選択Army / Armyなし / SC')).toBe('陸軍 / 陸軍数 / 選択中の陸軍 / 陸軍なし / 補給拠点');
 function Dock(){const unit={unitId:'internal-army-id',type:'army' as const,ownerWardId:'26102' as const,regionId:'a'},commands=useMapCommands({units:[unit],ownUnits:[unit],legalOrders:{},inventory:[],choose:()=>{},locked:false,contextKey:'test'});return createElement(BottomActionBar,{commands:{...commands,unit},units:[unit],regionName:()=> '桃園'});}
 const html=renderToStaticMarkup(createElement(Dock));expect(html).toContain('選択中の陸軍');expect(html.replace(/class="[^"]*"/g,'')).not.toMatch(/army|\bSC\b/i);
});
it('静的HTMLに公開URL・OGP・Discord用画像metadataを設定する',()=>{
 const html=readFileSync('apps/web/index.html','utf8');expect(html).toContain('<title>京都市版 Diplomacy</title>');
 for(const value of ['og:title','og:description','og:type','og:url','og:image','og:image:width','og:image:height','og:image:alt','twitter:card','twitter:title','twitter:description','twitter:image'])expect(html).toContain(`"${value}"`);
 expect(html).toContain('content="https://kyoto-diplomacy-web.onrender.com/"');expect(html).toContain('content="https://kyoto-diplomacy-web.onrender.com/og/kyoto-diplomacy-og.png"');expect(html).toContain('summary_large_image');
});
