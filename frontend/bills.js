function bill() {
  return (
    head(
      'Less guesswork. More clarity.',
      'An itemised estimate for the 30-day domestic block tariff.'
    ) +
    `<div class="grid-2 grid-equal">${panel('Estimate your electricity bill', 'All amounts are in Sri Lankan rupees.', form('bill', field('Expected 30-day consumption (kWh)', 'units', Math.round(projection().monthly), 'number', 'required min="0" max="1000000" step="0.01"') + '<p class="help">For standard domestic block accounts. Time-of-use and historical tariffs are not included.</p>', 'Calculate estimate') + sourceNote())}<section class="panel result-panel" id="billOutput" aria-live="polite">${billResult(Math.round(projection().monthly))}</section></div>`
  );
}

function billResult(units) {
  const b = Energy.bill(units);
  return `<span class="eyebrow">ESTIMATED 30-DAY BILL</span><div class="result-total">${money(b.total)}</div><div class="breakdown">${b.lines.map((l) => `<div class="row"><span>${num(l.quantity)} kWh × ${money(l.rate)}</span><strong>${money(l.amount)}</strong></div>`).join('')}<div class="row"><span>Fixed charge</span><strong>${money(b.fixed)}</strong></div></div><p class="help">Crossing 60 or 180 kWh changes the calculation for earlier units too. Zero use still includes a fixed charge.</p>`;
}

function billHistory() {
  const b = state.bills,
    compare =
      b.length > 1
        ? `<div class="notice">Latest bill vs previous: ${money(b[0].amount - b[1].amount)} and ${num(b[0].units - b[1].units)} kWh change.${b[1].amount > 0 ? ' Amount change: ' + num(((b[0].amount - b[1].amount) / b[1].amount) * 100) + '%.' : ' A percentage is unavailable when the previous amount is zero.'} Billing periods and tariff changes also affect the amount.</div>`
        : '';
  return (
    head(
      'Keep your bills in perspective.',
      'Save actual billed amounts and consumption for comparison.'
    ) +
    `<div class="grid-2 grid-equal">${panel('Record a bill', 'Enter details from your electricity bill.', form('bill-record', field('Billing month', 'month', today().slice(0, 7), 'month', `required min="2000-01" max="${today().slice(0, 7)}"`) + field('Billed consumption (kWh)', 'units', '', 'number', 'required min="0" max="1000000" step="0.01"') + field('Actual bill amount (LKR)', 'amount', '', 'number', 'required min="0" max="100000000" step="0.01"'), 'Save bill'))}${panel('A useful point of comparison', 'Saved bills are actual records, not estimates.', compare + (b.length ? `<div class="row"><span>Most recent bill</span><strong>${esc(b[0].month)}</strong></div><div class="result-total">${money(b[0].amount)}</div><p>${num(b[0].units)} kWh recorded.</p>` : empty('Your history starts here', 'Add a bill for each month. Two bills unlock a comparison.')))}</div>` +
    panel(
      'Your bill archive',
      'One bill per month. Delete and re-enter to correct a record.',
      b.length
        ? table(
            ['Month', 'Consumption', 'Actual amount', ''],
            b.map(
              (r) =>
                `<tr><td>${r.month}</td><td>${num(r.units)} kWh</td><td>${money(r.amount)}</td><td>${button('Delete', 'delete-bills', r.id)}</td></tr>`
            )
          )
        : empty('No bills saved yet', 'Your entries will be stored here.')
    )
  );
}
