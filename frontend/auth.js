const API_URL = 'http://localhost:3000/api';

const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const showSignup = document.getElementById('showSignup');
const showLogin = document.getElementById('showLogin');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');

// Theme check
if(localStorage.getItem('ceb_dark') === 'true') {
  document.body.classList.add('dark');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function toggleForms(show) {
  if (show === 'signup') {
    loginForm.style.display = 'none';
    signupForm.style.display = 'flex';
    authTitle.textContent = 'Create Account';
    authSubtitle.textContent = 'Start saving energy today';
  } else {
    loginForm.style.display = 'flex';
    signupForm.style.display = 'none';
    authTitle.textContent = 'Welcome Back';
    authSubtitle.textContent = 'Sign in to manage your energy';
  }
}

showSignup.onclick = () => toggleForms('signup');
showLogin.onclick = () => toggleForms('login');

loginForm.onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.style.display = 'block';
      return;
    }
    
    // Store token and redirect
    localStorage.setItem('ceb_token', data.token);
    localStorage.setItem('ceb_user', JSON.stringify(data.user));
    window.location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = 'Network error. Is the server running?';
    errorEl.style.display = 'block';
  }
};

signupForm.onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const errorEl = document.getElementById('signupError');
  
  try {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      errorEl.textContent = data.error || 'Signup failed';
      errorEl.style.display = 'block';
      return;
    }
    
    // Store token and redirect
    localStorage.setItem('ceb_token', data.token);
    localStorage.setItem('ceb_user', JSON.stringify(data.user));
    window.location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = 'Network error. Is the server running?';
    errorEl.style.display = 'block';
  }
};
