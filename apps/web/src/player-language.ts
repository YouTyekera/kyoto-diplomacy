/** Human messages from older validation modules, translated only at the UI boundary. */
export function playerMessage(text: string): string {
  return text.replace(/非SC/g, '補給拠点以外の地域').replace(/敵初期SC/g, '敵の初期補給拠点').replace(/初期SC/g, '初期補給拠点').replace(/SC/g, '補給拠点');
}
