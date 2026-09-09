(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Energy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const tariff = {effective:'11 May 2026', source:'https://www.pucsl.gov.lk/wp-content/uploads/2026/05/Full-Final_Decision-on-Electricity-Tariffs-May-2026.pdf', cycle:30};
  function nonnegative(value) { if (!Number.isFinite(value) || value < 0) throw new Error('Enter a valid non-negative number.'); return value; }
  // PUCSL Annex 2: domestic block tariff, exactly 30 days. Fixed charge is selected once.
  function bill(units) {
    nonnegative(units);
    const lines=[];
    let fixed;
    const add=(quantity,rate)=>{if(quantity>0)lines.push({quantity,rate,amount:quantity*rate});};
    if(units<=60){add(Math.min(30,units),5);add(Math.max(0,units-30),9);fixed=units<=30?80:210;}
    else if(units<=180){add(60,14);add(Math.min(units-60,30),20);add(Math.max(0,Math.min(units-90,30)),28);add(Math.max(0,units-120),44);fixed=units<=90?400:units<=120?1000:1500;}
    else{add(180,32.5);add(units-180,100);fixed=2500;}
    const energy=lines.reduce((s,l)=>s+l.amount,0);
    return {units,lines,energy,fixed,total:Math.round((energy+fixed)*100)/100};
  }
  const daily=appliances=>appliances.reduce((s,a)=>s+a.watts*a.hours/1000,0);
  function intervals(readings) {
    const sorted=[...readings].sort((a,b)=>a.date.localeCompare(b.date));
    return sorted.slice(1).map((r,i)=>{const previous=sorted[i],days=(Date.parse(r.date)-Date.parse(previous.date))/86400000,units=r.value-previous.value;return {from:previous.date,to:r.date,days,units,average:units/days};}).filter(i=>i.days>0&&i.units>=0);
  }
  function forecast(readings,appliances) {
    const recent=intervals(readings).slice(-7);
    const days=recent.reduce((s,r)=>s+r.days,0);
    const average=days?recent.reduce((s,r)=>s+r.units,0)/days:daily(appliances);
    return {daily:average,monthly:average*30,source:days?'meter':'appliance',days};
  }
  function ev(capacity,current,target,efficiency,baseUnits) {
    if(![capacity,current,target,efficiency,baseUnits].every(Number.isFinite)||!(capacity>0&&capacity<=300&&current>=0&&target<=100&&target>current&&efficiency>=50&&efficiency<=100))throw new Error('Check the battery size, charge levels and efficiency. Target must exceed current charge.');
    const energy=capacity*(target-current)/100/(efficiency/100);
    return {energy,cost:bill(nonnegative(baseUnits)+energy).total-bill(baseUnits).total};
  }
  function solar(capacity,sun,performance) {
    if(!(capacity>=0&&capacity<=100&&sun>0&&sun<=12&&performance>=1&&performance<=100))throw new Error('Check the solar capacity, sun hours and performance ratio.');
    return capacity*sun*30*performance/100;
  }
  function scheduleActive(schedule,date=new Date()) {
    if(!schedule.enabled)return false;
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const part=t=>parts.find(p=>p.type===t).value;
    const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday')),time=part('hour')+':'+part('minute');
    if(schedule.start<schedule.end)return schedule.days.includes(day)&&time>=schedule.start&&time<schedule.end;
    return (schedule.days.includes(day)&&time>=schedule.start)||(schedule.days.includes((day+6)%7)&&time<schedule.end);
  }
  return {tariff,bill,daily,intervals,forecast,ev,solar,scheduleActive};
});
