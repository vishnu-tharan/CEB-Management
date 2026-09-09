'use strict';
const renderers={dashboard,appliances,readings,usage,alerts,goals,bill,analysis,simulator,prediction,schedule:schedules,solar,ev,tips,profile,security,settings};
function render(){
  $('#pageTitle').textContent=titles[page];$('#profileName').textContent=state.user.name.split(' ')[0];$('#initials').textContent=state.user.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
  $('#nav').innerHTML=nav.map(([group,links])=>`<div class="nav-group">${group}</div>${links.map(([id,title,symbol])=>`<a href="#${id}" class="nav-link ${page===id?'active':''}" ${page===id?'aria-current="page"':''}>${icon(symbol)}<span>${title}</span>${id==='alerts'&&insights().length?`<span class="badge">${insights().length}</span>`:''}</a>`).join('')}`).join('');
  $('#content').innerHTML=renderers[page]();
  if(page==='security')loadSecurity();
}
async function load(){try{state=await api('/household');render();}catch(error){toast('Could not refresh household data. Reload the page to check your latest saved changes.');throw error;}}
async function loadSecurity(){try{const data=await api('/security');if(page!=='security')return;$('#sessionsContent').innerHTML=data.sessions.map(s=>`<div class="row"><div class="row-main"><strong>${s.current?'This browser':'Another browser'}</strong><p class="wrap">${esc(s.agent)}</p><p>Last active: ${new Date(s.last_seen).toLocaleString('en-LK',{timeZone:'Asia/Colombo'})}</p></div><span class="pill">${s.current?'CURRENT':'ACTIVE'}</span></div>`).join('');$('#eventsContent').innerHTML=data.events.map(e=>`<div class="row"><div><strong>${esc(e.action)}</strong><p>${new Date(e.created_at.replace(' ','T')+'Z').toLocaleString('en-LK',{timeZone:'Asia/Colombo'})}</p></div></div>`).join('');}catch(e){if(page==='security'){ $('#sessionsContent').textContent=e.message;$('#eventsContent').textContent='Refresh to try again.';}}}
function navigate(){page=Object.hasOwn(renderers,location.hash.slice(1))?location.hash.slice(1):'dashboard';closeMenu();if(state)render();window.scrollTo(0,0);}
function closeMenu(){$('#sidebar').classList.remove('open');$('#scrim').hidden=true;$('#menuBtn').setAttribute('aria-expanded','false');}
function modal(title,body){$('#modal').innerHTML=`<div class="dialog-head"><h2 id="dialogTitle">${title}</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="Close dialog">×</button></div>${body}`;if(!$('#modal').open)$('#modal').showModal();}
function applianceModal(a){modal(a?'Edit appliance':'Add appliance',form('appliance',`<input type="hidden" name="id" value="${a?.id||''}">${field('Appliance name','name',a?.name||'','text','required maxlength="80" placeholder="e.g. Ceiling fan"')}${field('Brand / model (optional)','brand',a?.brand||'','text','maxlength="80"')}${field('Room','room',a?.room||'Living room','text','required maxlength="50"')}<div class="form-grid">${field('Rated power (watts)','watts',a?.watts??75,'number','required min="1" max="50000" step="0.1"')}${field('Effective daily use (hours)','hours',a?.hours??8,'number','required min="0" max="24" step="0.1"')}</div><label class="check"><input type="checkbox" name="on" ${a?.on?'checked':''}> Mark as currently in use (manual record)</label>`,a?'Save appliance':'Add appliance')+(a?`<div class="dialog-actions">${button('Delete appliance','delete-appliances',a.id,'danger')}</div>`:''));}
function scheduleModal(s,applianceId){modal(s?'Edit usage plan':'Create usage plan',form('schedule',(s?'<input type="hidden" name="appliance_id" value="'+s.appliance_id+'"><p>Appliance: <strong>'+esc(s.name)+'</strong></p>':selectField('Appliance','appliance_id',state.appliances.map(a=>[a.id,a.name]),applianceId||state.appliances[0]?.id))+`<div class="form-grid">${field('Start time (Sri Lanka)','start',s?.start||'10:00','time','required')}${field('End time (Sri Lanka)','end',s?.end||'11:00','time','required')}</div><p class="help">If the end time is earlier, the plan ends the next day.</p><fieldset><legend>Days the plan starts</legend><div class="inline-checks">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>`<label class="check"><input type="checkbox" name="days" value="${i}" ${(s?.days||[0,1,2,3,4,5,6]).includes(i)?'checked':''}>${d}</label>`).join('')}</div></fieldset><label class="check"><input type="checkbox" name="enabled" ${!s||s.enabled?'checked':''}> Plan enabled</label>`,'Save plan'));}
function showRecovery(code){modal('Keep your recovery code safe',`<p>This code can reset your password. Store it in a password manager or another private place. It will not be shown again.</p><code class="recovery-code">${esc(code)}</code><p class="help">Generating another code invalidates this one.</p>${button('I have saved my code','close-modal','','primary')}`);}
$('#content').addEventListener('input',e=>{if(e.target.id==='applianceSearch'){const at=e.target.selectionStart;search=e.target.value;render();const el=$('#applianceSearch');el.focus();el.setSelectionRange(at,at);}});
$('#content').addEventListener('change',e=>{if(e.target.id==='roomFilter'){room=e.target.value;render();}if(e.target.name==='appliance_id'&&e.target.form?.dataset.form==='simulate'){const a=state.appliances.find(a=>a.id===Number(e.target.value));e.target.form.elements.hours.value=a.hours;}});
let actionBusy=false;
document.addEventListener('click',async e=>{
  const target=e.target.closest('[data-action]');if(!target)return;const action=target.dataset.action,id=Number(target.dataset.id);
  if(action==='close-modal'){$('#modal').close();return;}
  if(action==='add-appliance'||action==='edit-appliance'){applianceModal(state.appliances.find(a=>a.id===id));return;}
  if(action==='add-schedule'||action==='edit-schedule'||action==='plan-appliance'){scheduleModal(state.schedules.find(s=>action==='plan-appliance'?s.appliance_id===id:s.id===id),action==='plan-appliance'?id:undefined);return;}
  if(action==='delete-account'){modal('Delete your account permanently',form('delete-account','<p>This removes your profile and all household records. This cannot be undone.</p>'+field('Current password','current_password','','password','required autocomplete="current-password"')+field('Type DELETE to confirm','confirmation','','text','required pattern="DELETE"'),'Permanently delete account'));return;}
  if(action.startsWith('delete-')&&!confirm('Delete this saved record? This cannot be undone.'))return;
  if(actionBusy)return;actionBusy=true;target.disabled=true;
  try{
    if(action==='toggle-appliance'){const a=state.appliances.find(a=>a.id===id);await api('/appliances/'+id,'PUT',{on:!a.on});await load();toast('Planning state saved.');}
    else if(action.startsWith('delete-')){await api('/'+action.slice(7)+'/'+id,'DELETE');$('#modal').close();await load();toast('Record deleted.');}
    else if(action==='read-alerts'){await api('/alerts/read-all','PUT');await load();toast('Legacy alerts marked read.');}
    else if(action==='export'){const data=await api('/export');download('energy-saver-data-'+today()+'.json',JSON.stringify(data,null,2));toast('Your data export is ready.');}
    else if(action==='export-readings'){const cell=value=>'"'+String(value).replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';download('meter-readings-'+today()+'.csv','Date,Cumulative kWh,Note\r\n'+state.readings.map(r=>[r.date,r.value,r.note].map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
    else if(action==='revoke'){await api('/security/revoke','POST');await loadSecurity();toast('Other sessions signed out.');}
    else if(action==='logout'){await api('/auth/logout','POST');location.replace('/login.html');}
  }catch(error){toast(error.message);}finally{actionBusy=false;target.disabled=false;}
});
document.addEventListener('submit',async e=>{
  const el=e.target;if(!el.matches('[data-form]'))return;e.preventDefault();if(el.dataset.busy)return;
  const name=el.dataset.form,data=Object.fromEntries(new FormData(el)),number=k=>Number(data[k]),submit=$('button[type=submit]',el);el.dataset.busy='true';submit.disabled=true;$('.form-error',el).textContent='';
  try{
    let message='Changes saved.',changed=true;
    if(name==='appliance'){const id=data.id;delete data.id;data.watts=number('watts');data.hours=number('hours');data.on=el.elements.on.checked;await api('/appliances'+(id?'/'+id:''),id?'PUT':'POST',data);message='Appliance saved.';}
    else if(name==='reading'){await api('/readings','POST',{...data,value:number('value')});message='Meter reading saved.';}
    else if(name==='bill-record'){await api('/bills','POST',{...data,units:number('units'),amount:number('amount')});message='Bill saved.';}
    else if(name==='goal'){await api('/settings','PUT',{...data,monthly_target:number('monthly_target'),budget:number('budget')});message='Saving goal updated.';}
    else if(name==='settings'){await api('/settings','PUT',{power_limit:number('power_limit'),high_usage:el.elements.high_usage.checked,reminders:el.elements.reminders.checked});message='Preferences saved.';}
    else if(name==='profile'){await api('/users/profile','PUT',data);message='Profile updated.';}
    else if(name==='password'){if(data.password!==data.confirm)throw new Error('New passwords do not match.');const result=await api('/security/password','POST',data);csrf=result.csrf;message='Password changed. Other sessions have been signed out.';}
    else if(name==='recovery'){const result=await api('/security/recovery','POST',data);await load();showRecovery(result.recovery);changed=false;}
    else if(name==='delete-account'){await api('/users/account','DELETE',data);location.replace('/login.html?deleted=1');return;}
    else if(name==='schedule'){await api('/schedules','POST',{...data,appliance_id:number('appliance_id'),days:new FormData(el).getAll('days').map(Number),enabled:el.elements.enabled.checked});message='Usage plan saved.';}
    else if(name==='bill'){$('#billOutput').innerHTML=billResult(number('units'));changed=false;}
    else if(name==='simulate'){const a=state.appliances.find(a=>a.id===number('appliance_id')),current=Energy.daily(state.appliances)*30,next=current+a.watts*(number('hours')-a.hours)*30/1000,diff=Energy.bill(current).total-Energy.bill(Math.max(0,next)).total;$('#simOutput').innerHTML=`<span class="eyebrow">SIMULATED 30-DAY BILL</span><div class="result-total">${money(Energy.bill(Math.max(0,next)).total)}</div><div class="row"><span>Current appliance estimate</span><strong>${money(Energy.bill(current).total)}</strong></div><div class="row"><span>${diff>=0?'Potential saving':'Additional cost'}</span><strong>${money(Math.abs(diff))}</strong></div><div class="row"><span>Simulated household use</span><strong>${num(next)} kWh</strong></div><p class="details-note">${esc(a.name)}: ${num(number('hours'))} hours/day instead of ${num(a.hours)}. Your saved appliance has not changed.</p>${sourceNote()}`;changed=false;}
    else if(name==='solar'){const result=Energy.solar(number('capacity'),number('sun'),number('performance'));$('#solarOutput').innerHTML=`<span class="eyebrow">ESTIMATED MONTHLY GENERATION</span><div class="result-total">${num(result)} kWh</div><p>${num(result/30)} kWh per day across an assumed 30-day period.</p>`;changed=false;}
    else if(name==='ev'){const result=Energy.ev(number('capacity'),number('current'),number('target'),number('efficiency'),number('base'));$('#evOutput').innerHTML=`<span class="eyebrow">ENERGY DRAWN FROM THE GRID</span><div class="result-total">${num(result.energy)} kWh</div><div class="row"><span>Added domestic bill cost</span><strong>${money(result.cost)}</strong></div><p class="details-note">Includes charging losses. Crossing a tariff threshold can change the rate for earlier household units.</p>`;changed=false;}
    if(changed){$('#modal').close();await load();toast(message);}
  }catch(error){formError(el,error);}finally{delete el.dataset.busy;submit.disabled=false;}
});
window.addEventListener('hashchange',navigate);
$('#menuBtn').onclick=()=>{const open=$('#sidebar').classList.toggle('open');$('#scrim').hidden=!open;$('#menuBtn').setAttribute('aria-expanded',String(open));};$('#scrim').onclick=closeMenu;
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
$('#themeBtn').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('ceb_theme',theme);}catch{}};
$('#dateLabel').textContent=new Date().toLocaleDateString('en-LK',{timeZone:'Asia/Colombo',weekday:'short',day:'numeric',month:'short',year:'numeric'});
setInterval(()=>{if(state&&!document.hidden&&(page==='alerts'||page==='schedule')&&!$('#modal').open)render();},60000);
(async()=>{try{const session=await api('/auth/session');csrf=session.csrf;navigate();await load();}catch(error){$('#content').innerHTML=empty('We couldn’t open your household',esc(error.message))+'<p class="text-right"><a class="button" href="/">Try again</a></p>';}})();
