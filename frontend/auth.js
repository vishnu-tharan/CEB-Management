'use strict';
let authMode='login',afterRecovery='/';
function renderAuth(mode='login'){
  authMode=mode;
  const signup=mode==='signup',recover=mode==='recover';
  $('#authContent').innerHTML=`<h2>${signup?'A fresh start for your home.':recover?'Let’s get you back in.':'Welcome home.'}</h2><p>${signup?'Create your private household account.':recover?'Use your saved recovery code to set a new password.':'Sign in to make a little more of your energy.'}</p><form id="authForm">${signup?field('Full name','name','','text','required maxlength="100" autocomplete="name"'):''}${field('Email address','email','','email','required maxlength="254" autocomplete="email" placeholder="you@example.com"')}${recover?field('Recovery code','recovery','','text','required minlength="64" maxlength="64" autocomplete="off"'):''}${field(recover?'New password':'Password','password','','password',`required ${signup||recover?'minlength="12" maxlength="72" autocomplete="new-password"':'autocomplete="current-password"'}`)}${signup||recover?field('Confirm password','confirm','','password','required minlength="12" maxlength="72" autocomplete="new-password"')+'<p class="help">Use a unique passphrase of at least 12 characters (maximum 72 UTF-8 bytes).</p>':''}<label class="check"><input id="showPassword" type="checkbox"> Show password</label>${errorBox()}<button class="button primary" type="submit">${signup?'Create account':recover?'Reset password':'Sign in'} →</button></form><div class="auth-links">${mode==='login'?'<button class="link-button" data-mode="signup">New here? Create an account</button><button class="link-button" data-mode="recover">Forgot password?</button>':'<button class="link-button" data-mode="login">← Back to sign in</button>'}</div>`;
  $('#showPassword').onchange=e=>document.querySelectorAll('[name=password],[name=confirm]').forEach(input=>input.type=e.target.checked?'text':'password');
  $('#authForm').onsubmit=submitAuth;
}
async function submitAuth(e){
  e.preventDefault();const form=e.target;if(form.dataset.busy)return;const data=Object.fromEntries(new FormData(form)),button=$('button[type=submit]',form);button.disabled=true;form.dataset.busy='true';$('.form-error',form).textContent='';
  try{
    if(authMode!=='login'&&data.password!==data.confirm)throw new Error('Passwords do not match.');
    const result=await api('/auth/'+authMode,'POST',data);
    if(result.recovery){afterRecovery=authMode==='recover'?'/login.html?recovered=1':'/';$('#recoveryCode').textContent=result.recovery;$('#recoveryDialog').showModal();}
    else location.replace('/');
  }catch(error){formError(form,error);}finally{button.disabled=false;delete form.dataset.busy;}
}
$('#authContent').addEventListener('click',e=>{const mode=e.target.closest('[data-mode]');if(mode)renderAuth(mode.dataset.mode);});
$('#recoveryDialog').addEventListener('cancel',e=>e.preventDefault());
$('#continueBtn').onclick=()=>{location.replace(afterRecovery);};
renderAuth();
const params=new URLSearchParams(location.search);
if(params.has('expired'))toast('Your session ended. Please sign in again.');
if(params.has('deleted'))toast('Your account and household data have been deleted.');
if(params.has('recovered'))toast('Password reset. Sign in with your new password.');