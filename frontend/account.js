function profile() {
  const user = state.user;
  return (
    head(
      'Your household, your details.',
      'Your name appears on your dashboard. Your email is used to sign in.'
    ) +
    `<div class="grid-2">${panel(
      'Your profile',
      'Changing email requires your current password.',
      form(
        'profile',
        field(
          'Full name',
          'name',
          user.name,
          'text',
          'required maxlength="100" autocomplete="name"'
        ) +
          field(
            'Email address',
            'email',
            user.email,
            'email',
            'required maxlength="254" autocomplete="email"'
          ) +
          field(
            'Current password (required only to change email)',
            'current_password',
            '',
            'password',
            'autocomplete="current-password"'
          ),
        'Save profile'
      )
    )}${panel(
      'Your account',
      'Private household records.',
      `<div class="security-icon">${icon('user')}</div><h2 class="wrap">${esc(user.name)}</h2><p class="wrap">${esc(user.email)}</p><p>Other accounts cannot access your appliances, meter readings or bills.</p>${link('Manage account security →', 'security')}`
    )}</div>`
  );
}

function security() {
  return (
    head('Keep your account secure.', 'Change your password or replace your recovery code.') +
    `<div class="grid-2 grid-equal">${panel(
      'Change password',
      'Changing your password signs out all previous sessions.',
      form(
        'password',
        field(
          'Current password',
          'current_password',
          '',
          'password',
          'required autocomplete="current-password"'
        ) +
          field(
            'New password',
            'password',
            '',
            'password',
            'required minlength="12" maxlength="72" autocomplete="new-password"'
          ) +
          field(
            'Confirm new password',
            'confirm',
            '',
            'password',
            'required minlength="12" maxlength="72" autocomplete="new-password"'
          ) +
          '<p class="help">Use at least 12 characters, up to 72 UTF-8 bytes.</p>',
        'Update password'
      )
    )}${panel(
      'Recovery code',
      'Use your saved code if you forget your password.',
      form(
        'recovery',
        '<p>A new code replaces the old one and is shown only once. Store it somewhere private outside this app.</p>' +
          field(
            'Current password',
            'current_password',
            '',
            'password',
            'required autocomplete="current-password"'
          ),
        'Generate new recovery code'
      )
    )}</div>` +
    panel(
      'Sign out',
      'Sessions also end after 30 minutes of inactivity or 12 hours in total.',
      button('Sign out', 'logout')
    )
  );
}
