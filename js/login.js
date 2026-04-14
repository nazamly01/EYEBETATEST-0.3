function getReturnUrl() {
  const p = new URLSearchParams(location.search).get('return');
  if (p && !p.includes('://') && p.endsWith('.html')) return p;
  return 'profile.html';
}

async function routeAfterAuth() {
  const claim = await EyeApi.claimPendingAnonymousOrder();
  if (claim.claimed) showToast('Order saved to your account — open My orders to track it.');
  else if (claim.mismatch) showToast('Sign in with the same email you used at checkout to link your order.');
  const prof = await EyeApi.fetchMyProfile();
  const ret = getReturnUrl();
  if (prof?.role === 'admin') {
    location.href = ret.indexOf('admin') !== -1 ? ret : 'admin.html';
    return;
  }
  location.href = ret === 'admin.html' ? 'profile.html' : ret;
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const ok = await mountStandardShell('');
    const reg = document.querySelector('a[href="register.html"]');
    if (reg) reg.href = 'register.html' + location.search;
    if (!ok) return;

    const { data } = await EyeApi.client.auth.getSession();
    if (data.session) {
      await routeAfterAuth();
    }
  } finally {
    initLoader();
  }
});

async function submitLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value;
  const err = document.getElementById('loginError');
  err.textContent = '';

  if (!EyeApi.isRemote()) {
    err.textContent = 'Supabase is not configured.';
    return;
  }

  const { error } = await EyeApi.client.auth.signInWithPassword({ email, password: pass });
  if (error) {
    err.textContent = error.message || 'Sign in failed';
    return;
  }
  await Wishlist.refresh();
  await routeAfterAuth();
}
