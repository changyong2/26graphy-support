export const filters = {
  'default':['Default','#b8b8b0'], '26-day':['26 Day','#e7c69b'], '26-grove':['26 Grove','#526f51'],
  '26-blue':['26 Blue','#70b1de'], '26-amber':['26 Amber','#d5a56c'], '26-dusk':['26 Dusk','#7983b1'],
  '26-mono':['26 Mono','#5e6268'], '26-forest':['26 Forest','#66865c'], '26-seoul':['26 Seoul','#bab4aa'],
  '26-seoul-night':['26 Seoul Night','#354976'], '26-indoor':['26 Indoor','#b8a386'],
  '26-portrait-minus':['26 Portrait −0.65','#e7c2b6'], '26-portrait-plus':['26 Portrait +0.65','#ddc3b8']
};
export function captureReport(days, dimensions = []) {
  if (![7,30,90].includes(days)) throw new Error('Invalid date range');
  return {dateRanges:[{startDate:`${days-1}daysAgo`,endDate:'today'}],
    dimensions:dimensions.map(name=>({name})),
    metrics:[{name:'eventCount'},...(dimensions.length ? [] : [{name:'totalUsers'}])],
    dimensionFilter:{filter:{fieldName:'eventName',stringFilter:{matchType:'EXACT',value:'filter_capture'}}},
    limit:'10000',returnPropertyQuota:true};
}
export function readRows(report) {
  const dimensions=(report.dimensionHeaders??[]).map(x=>x.name), metrics=(report.metricHeaders??[]).map(x=>x.name);
  return (report.rows??[]).map(row=>Object.fromEntries([
    ...dimensions.map((key,i)=>[key,row.dimensionValues?.[i]?.value??'']),
    ...metrics.map((key,i)=>[key,Number(row.metricValues?.[i]?.value??0)])
  ]));
}
export function summarize(rows) {
  const counts=new Map(), dates=new Map();
  for (const row of rows) {
    const count=Number(row.eventCount), id=row['customEvent:filter_id']||'other', date=row.date;
    if (!Number.isFinite(count)||count<0||!/^\d{8}$/.test(date)) continue;
    counts.set(id,(counts.get(id)||0)+count);dates.set(date,(dates.get(date)||0)+count);
  }
  const ranking=[...counts].map(([id,count])=>({id,count,name:filters[id]?.[0]??'기타 / 미등록',color:filters[id]?.[1]??'#a6adb5'}))
    .sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
  return {ranking,dates,total:ranking.reduce((sum,row)=>sum+row.count,0)};
}
export function calendarDays(days,today) {
  const [y,m,d]=today.split('-').map(Number);const end=Date.UTC(y,m-1,d);
  return Array.from({length:days},(_,i)=>new Date(end-(days-1-i)*86400000).toISOString().slice(0,10).replaceAll('-',''));
}
export function csv(ranking,total) {
  const quote=x=>'"'+String(x).replaceAll('"','""')+'"';
  return '\uFEFF'+[['필터','촬영 성공 수','비중(%)'],...ranking.map(x=>[x.name,x.count,total?(x.count/total*100).toFixed(2):'0'])]
    .map(row=>row.map(quote).join(',')).join('\r\n');
}
