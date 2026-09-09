function bad(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
function text(value, label, max = 100, required = true) {
  if (typeof value !== 'string') bad(`${label} must be text.`);
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(cleaned)) bad(`${label} must be ${required ? '1' : '0'}–${max} characters.`);
  return cleaned;
}
function number(value, label, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) bad(`${label} must be between ${min} and ${max}.`);
  return value;
}
function email(value) { const result = text(value, 'Email', 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) bad('Enter a valid email address.'); return result; }
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value, 'utf8') > 72) bad('Use a password with at least 12 characters and at most 72 UTF-8 bytes.');
  return value;
}
function bool(value, label) { if (typeof value !== 'boolean') bad(`${label} must be true or false.`); return value ? 1 : 0; }
function id(value) { if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) bad('Invalid record ID.'); return Number(value); }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) bad('Enter a valid date.');
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if (value > today || value < '2000-01-01') bad('Reading date must be between 2000 and today.');
  return value;
}
module.exports = { bad, text, number, email, password, bool, id, date };
