// Optional UI suite. Install Playwright locally or supply PLAYWRIGHT_MODULE_PATH.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
process.env.DB_PATH=':memory:';process.env.NODE_ENV='test';
const {app}=require('../server');const db=require('../db');
const output=path.resolve(__dirname,'../../artifacts');fs.mkdirSync(output,{recursive:true});
const password='Private-household-passphrase-2026';
(async()=>{
  await db.migrate();const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  const base='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
    const context=await browser.newContext({viewport:{width:1440,height:1080}});const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('dialog',d=>d.accept());
    await page.goto(base+'/login.html');await page.screenshot({path:path.join(output,'sign-in-desktop.png'),fullPage:true});
    await page.getByRole('button',{name:'New here? Create an account'}).click();
    await page.getByLabel('Full name').fill('Nethmi Perera');await page.getByLabel('Email address',{exact:true}).fill('nethmi@example.com');
    await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Create account'}).click();await page.getByRole('button',{name:'I have saved my code'}).waitFor();
    const recovery=await page.locator('#recoveryCode').textContent();assert.equal(recovery.length,64);
    await page.getByRole('button',{name:'I have saved my code'}).click();await page.getByRole('heading',{name:'Your home, in balance.'}).waitFor();
    assert.match(await page.locator('#content').innerText(),/A clearer picture starts/);
    async function go(hash,heading){await page.goto(base+'/#'+hash);await page.getByRole('heading',{name:heading,exact:true}).waitFor();}
    async function submit(name){await page.getByRole('button',{name,exact:true}).click();await page.locator('#toast.show').waitFor();}
    await go('appliances','Know what powers your home.');
    for(const [name,watts,hours,room] of [['Air conditioner',1200,4,'Bedroom'],['Refrigerator',150,8,'Kitchen'],['Ceiling fan',75,8,'Living room'],['Washing machine',500,0.8,'Laundry']]){
      await page.getByRole('button',{name:'+ Add appliance',exact:true}).click();await page.getByLabel('Appliance name',{exact:true}).fill(name);
      await page.getByLabel('Rated power (watts)',{exact:true}).fill(String(watts));await page.getByLabel('Effective daily use (hours)',{exact:true}).fill(String(hours));await page.getByLabel('Room',{exact:true}).fill(room);
      await page.getByRole('button',{name:'Add appliance',exact:true}).click();await page.getByRole('heading',{name,exact:true}).waitFor();
    }
    await page.getByLabel('Search appliances').fill('refrigerator');assert.equal(await page.locator('.appliance-card').count(),1);await page.getByLabel('Search appliances').fill('');
    await page.locator('.appliance-card').filter({has:page.getByRole('heading',{name:'Ceiling fan',exact:true})}).getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByLabel('Effective daily use (hours)').fill('0');await page.getByRole('button',{name:'Save appliance',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
    await page.reload();await page.getByRole('heading',{name:'Ceiling fan',exact:true}).waitFor();assert.match(await page.locator('.appliance-card').filter({has:page.getByRole('heading',{name:'Ceiling fan',exact:true})}).innerText(),/0 h/);
    await page.locator('.appliance-card').filter({has:page.getByRole('heading',{name:'Washing machine',exact:true})}).getByRole('button',{name:'Plan',exact:true}).click();
    await page.getByLabel('Start time (Sri Lanka)').fill('23:00');await page.getByLabel('End time (Sri Lanka)').fill('01:00');await page.getByRole('button',{name:'Save plan',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
    await go('schedule','Make room for a better routine.');assert.match(await page.locator('#content').innerText(),/23:00–01:00 \(next day\)/);
    await go('readings','A habit that adds up.');
    const now=new Date();const dates=Array.from({length:7},(_,i)=>{const date=new Date(now);date.setUTCDate(date.getUTCDate()-14+i*2);return date.toISOString().slice(0,10);});
    for(let i=0;i<dates.length;i++){await page.getByLabel('Reading date',{exact:true}).fill(dates[i]);await page.getByLabel('Cumulative meter value (kWh)',{exact:true}).fill(String(12500+[0,11,26,38,49,63,74][i]));await page.getByRole('button',{name:'Save reading',exact:true}).click();await page.getByRole('cell',{name:dates[i],exact:true}).waitFor();}
    await go('goals','Give your savings a direction.');await page.getByLabel('Goal name',{exact:true}).fill('A lighter footprint');await page.getByLabel('Target consumption (kWh / 30 days)').fill('180');await submit('Save goal');await page.reload();await page.getByLabel('Goal name',{exact:true}).waitFor();assert.equal(await page.getByLabel('Goal name',{exact:true}).inputValue(),'A lighter footprint');
    await go('bill','Less guesswork. More clarity.');await page.getByLabel('Expected 30-day consumption (kWh)').fill('200');await page.getByRole('button',{name:'Calculate estimate',exact:true}).click();assert.match(await page.locator('#billOutput').innerText(),/10,350/);
    await go('analysis','Keep your bills in perspective.');await page.getByLabel('Billing month',{exact:true}).fill('2025-12');await page.getByLabel('Billed consumption (kWh)').fill('180');await page.getByLabel('Actual bill amount (LKR)').fill('6420');await page.getByRole('button',{name:'Save bill',exact:true}).click();await page.getByRole('cell',{name:'2025-12',exact:true}).waitFor();
    await go('simulator','What could a small change do?');await page.getByLabel('New effective daily usage (hours)').fill('0');await page.getByRole('button',{name:'Run simulation',exact:true}).click();assert.match(await page.locator('#simOutput').innerText(),/SIMULATED 30-DAY BILL/);
    await go('solar','Explore the potential of daylight.');await page.getByRole('button',{name:'Estimate generation',exact:true}).click();assert.match(await page.locator('#solarOutput').innerText(),/302.4/);
    await go('ev','Plan your next charge.');await page.getByRole('button',{name:'Calculate charging impact',exact:true}).click();assert.match(await page.locator('#evOutput').innerText(),/26.7/);
    await go('profile','Your household, your details.');await page.getByLabel('Sri Lankan phone (optional)').fill('0771234567');await page.getByLabel('District (optional)').selectOption('Colombo');await page.getByLabel('Household address (optional)').fill('12 Temple Road');await submit('Save profile');await page.reload();await page.getByLabel('Sri Lankan phone (optional)').waitFor();assert.equal(await page.getByLabel('Sri Lankan phone (optional)').inputValue(),'0771234567');
    await go('settings','Make it work for your household.');await page.getByLabel('Show meter-reading and active-plan reminders').uncheck();await submit('Save preferences');
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download my data',exact:true}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/energy-saver-data/);
    await go('security','A more secure place for your home.');await page.getByText('This browser',{exact:true}).waitFor();
    const passwordForm=page.locator('form[data-form="password"]');
    await passwordForm.getByLabel('Current password',{exact:true}).fill(password);
    await passwordForm.getByLabel('New password',{exact:true}).fill(password+'-new');
    await passwordForm.getByLabel('Confirm new password',{exact:true}).fill(password+'-new');
    await passwordForm.getByRole('button',{name:'Update password',exact:true}).click();
    await page.getByText('Password changed; all old sessions revoked',{exact:true}).waitFor();
    // Stored HTML payload must remain inert and display as text.
    await go('appliances','Know what powers your home.');await page.getByRole('button',{name:'+ Add appliance',exact:true}).click();await page.getByLabel('Appliance name',{exact:true}).fill('<img src=x onerror=alert(1)>');await page.getByRole('button',{name:'Add appliance',exact:true}).click();await page.getByRole('heading',{name:'<img src=x onerror=alert(1)>',exact:true}).waitFor();assert.equal(await page.locator('.appliance-card img').count(),0);
    await page.locator('.appliance-card').filter({has:page.getByRole('heading',{name:'<img src=x onerror=alert(1)>',exact:true})}).getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'Delete appliance',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
    await go('dashboard','Your home, in balance.');await page.locator('#toast').evaluate(el=>el.classList.remove('show'));await page.screenshot({path:path.join(output,'dashboard-desktop.png'),fullPage:true});
    const allPages=['dashboard','appliances','readings','usage','alerts','goals','bill','analysis','simulator','prediction','schedule','solar','ev','tips','profile','security','settings'];
    for(const id of allPages){await page.goto(base+'/#'+id);await page.locator('#content h1').waitFor();assert.equal(await page.locator('#content h1').count(),1,id);}
    await page.setViewportSize({width:390,height:844});
    for(const id of allPages){await page.goto(base+'/#'+id);await page.locator('#content h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Mobile overflow on ${id}`);}
    await go('dashboard','Your home, in balance.');await page.screenshot({path:path.join(output,'dashboard-mobile.png'),fullPage:true});
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('link',{name:'My profile',exact:true}).click();await page.getByRole('heading',{name:'Your household, your details.',exact:true}).waitFor();assert.equal(await page.locator('#scrim').isVisible(),false);
    await page.getByRole('button',{name:'Switch colour theme',exact:true}).click();await page.screenshot({path:path.join(output,'profile-mobile-dark.png'),fullPage:true});
    await go('security','A more secure place for your home.');await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Welcome home.',exact:true}).waitFor();
    await page.getByLabel('Email address',{exact:true}).fill('nethmi@example.com');await page.getByLabel('Password',{exact:true}).fill(password+'-new');await page.getByRole('button',{name:'Sign in →',exact:true}).click();await page.getByRole('heading',{name:'Your home, in balance.',exact:true}).waitFor();
    assert.deepEqual(errors,[],'No browser runtime, resource or CSP errors');
    console.log('PASS: registration, login/logout, recovery display, appliance CRUD/XSS, meter history, schedules, goals, bill records, calculators, profile, preferences, exports, 17 desktop/mobile pages, dark mode; no browser errors.');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
