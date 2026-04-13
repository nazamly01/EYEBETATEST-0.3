function getReturnUrl() {
  const p = new URLSearchParams(location.search).get('return');
  if (p && !p.includes('://') && p.endsWith('.html')) return p;
  return 'profile.html';
}

/** Map Supabase Auth errors to clearer English messages for the registration form. */
function formatRegisterError(error) {
  const raw = (error?.message || String(error || '')).toLowerCase();
  if (raw.includes('rate limit') || raw.includes('too many requests')) {
    return (
      'Supabase blocked this signup (rate limit): too many attempts or emails from this network. ' +
      'Wait about an hour, try another network, or in the Supabase Dashboard open Authentication and review email confirmation / rate limits. ' +
      'Your app is reaching Supabase; this block is on their side.'
    );
  }
  if (raw.includes('already registered') || raw.includes('user already exists')) {
    return 'This email already has an account — use Sign in.';
  }
  if (raw.includes('password')) {
    return error.message || 'Password does not meet requirements.';
  }
  return error.message || 'Registration failed.';
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await mountStandardShell('');
  const signIn = document.querySelector('a[href="login.html"]');
  if (signIn) signIn.href = 'login.html' + location.search;
  initLoader();
  if (!ok) return;

  const { data } = await EyeApi.client.auth.getSession();
  if (data.session) {
    const prof = await EyeApi.fetchMyProfile();
    const ret = getReturnUrl();
    if (prof?.role === 'admin') {
      location.href = ret.indexOf('admin') !== -1 ? ret : 'admin.html';
    } else {
      location.href = ret === 'admin.html' ? 'profile.html' : ret;
    }
  }
});

async function submitRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const pass = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;
  const errEl = document.getElementById('registerError');
  const okEl = document.getElementById('registerSuccess');
  const btn = document.getElementById('registerSubmit');
  errEl.textContent = '';
  okEl.textContent = '';

  if (!EyeApi.isRemote()) {
    errEl.textContent = 'Supabase is not configured.';
    return;
  }
  if (pass !== pass2) {
    errEl.textContent = 'Passwords do not match.';
    return;
  }

  btn.disabled = true;
  const { data, error } = await EyeApi.client.auth.signUp({
    email,
    password: pass,
    options: { data: { full_name: name || undefined } },
  });
  btn.disabled = false;

  if (error) {
    console.warn('EYE register signUp', error);
    errEl.textContent = formatRegisterError(error);
    return;
  }

  if (data.session) {
    await Wishlist.refresh();
    const prof = await EyeApi.fetchMyProfile();
    const ret = getReturnUrl();
    if (prof?.role === 'admin') {
      location.href = ret.indexOf('admin') !== -1 ? ret : 'admin.html';
    } else {
      location.href = ret === 'admin.html' ? 'profile.html' : ret;
    }
    return;
  }

  okEl.textContent =
    'Check your email to confirm your account, then sign in. If confirmation is disabled in Supabase, try signing in now.';
}
