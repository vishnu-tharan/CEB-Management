'use strict';
const $ = (selector, root=document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('en-LK',{style:'currency',currency:'LKR',maximumFractionDigits:2}).format(value);
const num = value => new Intl.NumberFormat('en-LK',{maximumFractionDigits:1}).format(value);
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let csrf = '';
// Remove obsolete browser-stored bearer credentials from earlier versions.
try {localStorage.removeItem('ceb_token');localStorage.removeItem('ceb_user');if(localStorage.getItem('ceb_theme')==='dark')document.documentElement.dataset.theme='dark';}catch{}
async function api(path,method='GET',body) {
  const headers={'X-Requested-With':'CEBEnergySaver'};
  if(method!=='GET'){headers['Content-Type']='application/json';if(csrf)headers['X-CSRF-Token']=csrf;}
  let response;
  try {response=await fetch('/api'+path,{method,credentials:'same-origin',headers,body:method==='GET'?undefined:JSON.stringify(body || {}),signal:AbortSignal.timeout(15000)});}
  catch {throw new Error('Cannot reach the server. Check your connection. If you were saving, refresh to check whether it completed before retrying.');}
  const result=await response.json();
  if(!response.ok){if(response.status===401&&!location.pathname.endsWith('login.html'))location.replace('/login.html?expired=1');throw new Error(result.error || 'The request could not be completed.');}
  return result;
}
let toastTimer;
function toast(message) {const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),6000);}
function download(name,data,type='application/json') {const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function field(label,name,value='',type='text',extra='') {return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function selectField(label,name,options,value) {return `<label>${label}<select name="${name}">${options.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`;}).join('')}</select></label>`;}
function formError(form,error) {const el=$('.form-error',form);if(el){el.textContent=error.message;el.focus();}else toast(error.message);}
function errorBox(){return '<p class="form-error" role="alert" tabindex="-1"></p>';}
