import {config} from './config.js';
import {captureReport,readRows,summarize,calendarDays,csv} from './model.mjs';
const $=id=>document.getElementById(id), fmt=n=>new Intl.NumberFormat('ko-KR').format(n);
let token=null, expiresAt=0, expiryTimer, requestID=0, current=null, loading=false;
const preferences=(()=>{try{return JSON.parse(localStorage.getItem('26graphy.dashboard.publicSettings')||'{}')}catch{return {}}})();
let propertyID=preferences.propertyID||config.propertyID, clientID=preferences.clientID||config.oauthClientID;
$('property-id').value=propertyID;$('client-id').value=clientID;
function status(title,detail,error=false){$('status').textContent=title;$('status-detail').textContent=detail;document.querySelector('.notice').classList.toggle('error',error)}
function clearData(){current=null;for(const id of ['total','filters','favorite','users'])$(id).textContent='—';$('favorite-share').textContent='촬영 횟수 기준';$('timeline').replaceChildren();$('ranking').replaceChildren();$('export').disabled=true;$('updated').textContent='조회 전'}
function disconnect(){requestID++;token=null;expiresAt=0;clearTimeout(expiryTimer);clearData();$('login').hidden=false;$('logout').hidden=true;$('refresh').disabled=true;status('연결 해제됨','분석 데이터와 인증 토큰을 화면 및 메모리에서 지웠습니다. Google 계정의 권한 해제는 계정 보안 설정에서 할 수 있습니다.');}
function login(){
 if(!/^\d+$/.test(propertyID)||!/^[-\w.]+\.apps\.googleusercontent\.com$/.test(clientID)){document.querySelector('.setup').open=true;status('연결 설정이 필요합니다','Analytics 속성 ID와 웹 OAuth 클라이언트 ID를 입력하세요.',true);return}
 if(!window.google?.accounts?.oauth2){status('Google 연결 준비 중','잠시 뒤 다시 눌러주세요. 브라우저에서 accounts.google.com 스크립트를 차단하는지도 확인하세요.',true);return}
 google.accounts.oauth2.initTokenClient({client_id:clientID,scope:'https://www.googleapis.com/auth/analytics.readonly',include_granted_scopes:false,
 callback:async response=>{if(response.error){status('Google 연결을 완료하지 못했습니다',response.error_description||response.error,true);return}
 token=response.access_token;expiresAt=Date.now()+Number(response.expires_in)*1000;clearTimeout(expiryTimer);expiryTimer=setTimeout(disconnect,Math.max(0,expiresAt-Date.now()));
 $('login').hidden=true;$('logout').hidden=false;$('refresh').disabled=false;await load();},
 error_callback:error=>status('연결이 취소되었거나 팝업이 차단됐습니다',error.type==='popup_failed_to_open'?'팝업을 허용한 뒤 다시 연결하세요.':'다시 연결하면 조회를 재개할 수 있습니다.',true)
 }).requestAccessToken({prompt:'select_account'});
}
async function report(body,activeToken){
 const response=await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyID}:runReport`,{method:'POST',headers:{Authorization:`Bearer ${activeToken}`,'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',cache:'no-store'});
 const data=await response.json();if(!response.ok){const e=new Error(data.error?.message||`HTTP ${response.status}`);e.status=response.status;throw e;}return data;
}
async function load(){
 if(loading)return;if(!token||Date.now()>=expiresAt){disconnect();return}loading=true;$('period').disabled=true;$('refresh').disabled=true;$('export').disabled=true;
 const id=++requestID, activeToken=token, days=Number($('period').value);status('촬영 데이터를 조회하는 중','Google Analytics에서 집계 보고서를 가져오고 있습니다.');
 try{
 const [detail,summary]=await Promise.all([report(captureReport(days,['date','customEvent:filter_id']),activeToken),report(captureReport(days),activeToken)]);
 if(id!==requestID)return;
 if(Number(detail.rowCount||0)>(detail.rows||[]).length)throw new Error('보고서가 조회 한도를 초과했습니다. 기간을 줄여 다시 조회하세요.');
 const aggregate=summarize(readRows(detail)), overall=readRows(summary)[0]||{eventCount:0,totalUsers:0};current={...aggregate,total:Number(overall.eventCount)||0,days,timeZone:detail.metadata?.timeZone||summary.metadata?.timeZone||'Asia/Seoul'};render(current,Number(overall.totalUsers)||0);
 const limited=detail.metadata?.subjectToThresholding||summary.metadata?.subjectToThresholding;
 status(current.total?'최신 집계 조회 완료':'조회 기간에 집계된 촬영이 없습니다',limited?'개인정보 보호 임계값이 적용되어 일부 행이 생략될 수 있습니다.':current.total?'공유 동의 사용자의 촬영 성공 기준입니다. Analytics 속성 시간대를 따릅니다.':'신규 이벤트·맞춤 측정기준은 반영까지 24–48시간이 걸릴 수 있습니다. Firebase DebugView로 수신 여부를 확인하세요.');
 }catch(error){if(id!==requestID)return;clearData();const hint=error.status===403?'계정의 Analytics 조회 권한과 Google Analytics Data API 활성화를 확인하세요.':error.status===400?'이 속성에 이벤트 범위 맞춤 측정기준 filter_id가 등록되어 있는지 확인하세요.':'연결·권한·설정을 확인한 뒤 다시 조회하세요.';status('데이터를 조회하지 못했습니다',`${hint} ${error.message}`,true);
 }finally{loading=false;$('period').disabled=false;$('refresh').disabled=!token;}
}
function render(data,users){
 $('total').textContent=fmt(data.total);$('users').textContent=fmt(users);$('filters').textContent=fmt(data.ranking.length);$('favorite').textContent=data.ranking[0]?.name||'—';$('favorite-share').textContent=data.ranking[0]?`${fmt(data.ranking[0].count)}장 · ${(data.ranking[0].count/Math.max(1,data.total)*100).toFixed(1)}%`:'촬영 횟수 기준';
 $('updated').textContent=new Date().toLocaleString('ko-KR');
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:data.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const dates=calendarDays(data.days,today), max=Math.max(1,...data.dates.values());$('timeline').replaceChildren();
 for(const [i,date] of dates.entries()){const count=data.dates.get(date)||0,day=document.createElement('div'),bar=document.createElement('div'),label=document.createElement('span');day.className='day';bar.className='bar';bar.style.height=`${count/max*Math.max(60,$('timeline').clientHeight-30)}px`;day.title=`${date.slice(4,6)}/${date.slice(6)} · ${fmt(count)}장`;day.setAttribute('aria-label',day.title);label.textContent=i===0||i===dates.length-1||i%Math.ceil(dates.length/8)===0?`${date.slice(4,6)}/${date.slice(6)}`:'';day.append(bar,label);$('timeline').append(day);}
 $('timeline').setAttribute('aria-label',`최근 ${data.days}일 일별 촬영 성공 수, 총 ${fmt(data.total)}장`);$('ranking').replaceChildren();
 for(const item of data.ranking){const tr=document.createElement('tr'),name=document.createElement('td'),cell=document.createElement('span'),swatch=document.createElement('i'),count=document.createElement('td'),share=document.createElement('td'),line=document.createElement('div'),track=document.createElement('span'),fill=document.createElement('i'),label=document.createElement('small');cell.className='filter-cell';swatch.className='swatch';swatch.style.background=item.color;cell.append(swatch,document.createTextNode(item.name));name.append(cell);count.textContent=fmt(item.count);const percent=item.count/Math.max(1,data.total)*100;line.className='share';track.className='track';fill.style.width=`${Math.min(100,percent)}%`;label.textContent=`${percent.toFixed(1)}%`;track.append(fill);line.append(track,label);share.append(line);tr.append(name,count,share);$('ranking').append(tr);}
 if(!data.ranking.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.className='empty';td.textContent='조회 기간에 촬영 데이터가 없습니다.';tr.append(td);$('ranking').append(tr)}$('export').disabled=!data.ranking.length;
}
$('login').addEventListener('click',login);$('logout').addEventListener('click',disconnect);$('refresh').addEventListener('click',load);$('period').addEventListener('change',()=>{if(token)load()});
$('save-settings').addEventListener('click',()=>{const nextProperty=$('property-id').value.trim(),nextClient=$('client-id').value.trim();if(!/^\d+$/.test(nextProperty)||!/^[-\w.]+\.apps\.googleusercontent\.com$/.test(nextClient)){status('설정 형식을 확인하세요','속성 ID는 숫자, 클라이언트 ID는 apps.googleusercontent.com으로 끝나는 웹 OAuth ID입니다.',true);return}disconnect();propertyID=nextProperty;clientID=nextClient;localStorage.setItem('26graphy.dashboard.publicSettings',JSON.stringify({propertyID,clientID}));status('연결 설정 저장 완료','Google로 연결하면 이 속성을 조회합니다. 인증 토큰이나 보고서 데이터는 저장하지 않습니다.');});
$('export').addEventListener('click',()=>{if(!current)return;const url=URL.createObjectURL(new Blob([csv(current.ranking,current.total)],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`26graphy-filters-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url)});
window.addEventListener('pagehide',()=>{token=null;current=null;clearTimeout(expiryTimer)});
