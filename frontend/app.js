'use strict';

const renderers = {
  dashboard,
  appliances,
  readings,
  usage,
  bill,
  bills: billHistory,
  profile,
  security,
};

function renderPage() {
  $('#pageTitle').textContent = titles[page];
  $('#profileName').textContent = state.user.name.split(' ')[0];
  $('#initials').textContent = state.user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  $('#nav').innerHTML = nav
    .map(
      ([id, title, symbol]) =>
        `<a href="#${id}" class="nav-link ${page === id ? 'active' : ''}" ${page === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span></a>`
    )
    .join('');
  $('#content').innerHTML = renderers[page]();
}

async function loadHousehold() {
  state = await api('/household');
  renderPage();
}

function closeMenu() {
  $('#sidebar').classList.remove('open');
  $('#scrim').hidden = true;
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}

function navigate() {
  const requestedPage = location.hash.slice(1);
  page = Object.hasOwn(renderers, requestedPage) ? requestedPage : 'dashboard';
  closeMenu();
  if (state) renderPage();
  window.scrollTo(0, 0);
}

function showDialog(title, body) {
  $('#modal').innerHTML =
    `<div class="dialog-head"><h2 id="dialogTitle">${title}</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="Close dialog">×</button></div>${body}`;
  if (!$('#modal').open) $('#modal').showModal();
}

function editAppliance(appliance) {
  showDialog(
    appliance ? 'Edit appliance' : 'Add appliance',
    form(
      'appliance',
      `<input type="hidden" name="id" value="${appliance?.id || ''}">` +
        field(
          'Appliance name',
          'name',
          appliance?.name || '',
          'text',
          'required maxlength="80" placeholder="e.g. Ceiling fan"'
        ) +
        field('Room', 'room', appliance?.room || 'Living room', 'text', 'required maxlength="50"') +
        `<div class="form-grid">${field('Rated power (watts)', 'watts', appliance?.watts ?? 75, 'number', 'required min="1" max="50000" step="0.1"')}${field('Effective daily use (hours)', 'hours', appliance?.hours ?? 8, 'number', 'required min="0" max="24" step="0.1"')}</div>`,
      appliance ? 'Save appliance' : 'Add appliance'
    ) +
      (appliance
        ? `<div class="dialog-actions">${button('Delete appliance', 'delete-appliances', appliance.id, 'danger')}</div>`
        : '')
  );
}

function showRecoveryCode(code) {
  showDialog(
    'Keep your recovery code safe',
    `<p>This code can reset your password. Store it privately outside this app; it will not be shown again.</p><code class="recovery-code">${esc(code)}</code>${button('I have saved my code', 'close-modal', '', 'primary')}`
  );
}

$('#content').addEventListener('input', (event) => {
  if (event.target.id !== 'applianceSearch') return;
  const cursor = event.target.selectionStart;
  search = event.target.value;
  renderPage();
  $('#applianceSearch').focus();
  $('#applianceSearch').setSelectionRange(cursor, cursor);
});
$('#content').addEventListener('change', (event) => {
  if (event.target.id === 'roomFilter') {
    room = event.target.value;
    renderPage();
  }
});

let actionBusy = false;
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = Number(target.dataset.id);
  if (action === 'close-modal') return $('#modal').close();
  if (action === 'add-appliance' || action === 'edit-appliance') {
    editAppliance(state.appliances.find((appliance) => appliance.id === id));
    return;
  }
  const deleting = /^delete-(appliances|readings|bills)$/.test(action);
  if (deleting && !confirm('Delete this saved record? This cannot be undone.')) return;
  if (actionBusy) return;
  actionBusy = true;
  target.disabled = true;
  try {
    if (deleting) {
      await api('/' + action.slice(7) + '/' + id, 'DELETE');
      $('#modal').close();
      await loadHousehold();
      toast('Record deleted.');
    } else if (action === 'logout') {
      await api('/auth/logout', 'POST');
      location.replace('/login.html');
    }
  } catch (error) {
    toast(error.message);
  } finally {
    actionBusy = false;
    target.disabled = false;
  }
});

async function saveForm(formElement, data) {
  switch (formElement.dataset.form) {
    case 'appliance': {
      const id = data.id;
      await api('/appliances' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', {
        name: data.name,
        room: data.room,
        watts: Number(data.watts),
        hours: Number(data.hours),
      });
      break;
    }
    case 'reading':
      await api('/readings', 'POST', { ...data, value: Number(data.value) });
      break;
    case 'bill-record':
      await api('/bills', 'POST', {
        ...data,
        units: Number(data.units),
        amount: Number(data.amount),
      });
      break;
    case 'profile':
      await api('/users/profile', 'PUT', data);
      break;
    case 'password': {
      if (data.password !== data.confirm) throw new Error('New passwords do not match.');
      const session = await api('/security/password', 'POST', data);
      csrf = session.csrf;
      break;
    }
    default:
      throw new Error('Unknown form. Reload the page and try again.');
  }
}

document.addEventListener('submit', async (event) => {
  const formElement = event.target;
  if (!formElement.matches('[data-form]')) return;
  event.preventDefault();
  if (formElement.dataset.busy) return;
  const data = Object.fromEntries(new FormData(formElement));
  const submitButton = $('button[type=submit]', formElement);
  formElement.dataset.busy = 'true';
  submitButton.disabled = true;
  $('.form-error', formElement).textContent = '';
  try {
    if (formElement.dataset.form === 'bill') {
      $('#billOutput').innerHTML = billResult(Number(data.units));
      return;
    }
    if (formElement.dataset.form === 'recovery') {
      const result = await api('/security/recovery', 'POST', data);
      await loadHousehold();
      showRecoveryCode(result.recovery);
      return;
    }
    await saveForm(formElement, data);
    $('#modal').close();
    await loadHousehold();
    toast('Changes saved.');
  } catch (error) {
    formError(formElement, error);
  } finally {
    delete formElement.dataset.busy;
    submitButton.disabled = false;
  }
});

window.addEventListener('hashchange', navigate);
$('#menuBtn').onclick = () => {
  const open = $('#sidebar').classList.toggle('open');
  $('#scrim').hidden = !open;
  $('#menuBtn').setAttribute('aria-expanded', String(open));
};
$('#scrim').onclick = closeMenu;
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});
$('#themeBtn').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem('ceb_theme', theme);
  } catch {}
};
$('#dateLabel').textContent = new Date().toLocaleDateString('en-LK', {
  timeZone: 'Asia/Colombo',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
(async () => {
  try {
    const session = await api('/auth/session');
    csrf = session.csrf;
    navigate();
    await loadHousehold();
  } catch (error) {
    $('#content').innerHTML =
      empty('We couldn’t open your household', esc(error.message)) +
      '<p><a class="button" href="/">Try again</a></p>';
  }
})();
