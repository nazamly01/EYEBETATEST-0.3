document.addEventListener('DOMContentLoaded', async () => {
  try {
    const ok = await mountStandardShell('');
    if (!ok) return;

    const { data } = await EyeApi.client.auth.getSession();
    if (!data.session) {
      location.href = 'login.html?return=profile.html';
      return;
    }
    const claim = await EyeApi.claimPendingAnonymousOrder();
    if (claim.claimed) showToast('Order linked to your account.');
    else if (claim.mismatch) showToast('Sign in with the same email you used at checkout to link your order.');
    await loadProfile();
  } finally {
    initLoader();
  }
});

async function loadProfile() {
  const user = await EyeApi.fetchAccountDashboardUser();
  if (!user) {
    location.href = 'login.html?return=profile.html';
    return;
  }
  document.getElementById('profileAvatar').textContent = (user.name || '?').charAt(0);
  document.getElementById('profileName').textContent = user.name;
  document.getElementById('profileEmail').textContent = user.email || '';
  document.getElementById('editName').value = user.name;
  document.getElementById('editEmail').value = user.email || '';
  document.getElementById('editPhone').value = user.phone || '';
  document.getElementById('editAddress').value = user.address || '';
  const roleEl = document.getElementById('profileRoleBadge');
  if (roleEl) {
    roleEl.textContent = user.role === 'admin' ? 'Administrator' : 'Customer';
  }
  const adminLink = document.getElementById('profileAdminLink');
  if (adminLink) {
    adminLink.style.display = user.role === 'admin' ? 'inline-flex' : 'none';
  }

  const orders = await EyeApi.fetchOrders();
  const wishIds = await EyeApi.fetchWishlistProductIds();
  const totalSpent = orders.reduce((s, o) => s + Number(o.total), 0);

  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statSpend').textContent =
    totalSpent >= 1000 ? `EGP ${Math.round(totalSpent / 1000)}K` : formatPrice(totalSpent);
  document.getElementById('statWishlist').textContent = wishIds.length;

  const prev = orders.slice(-3).reverse();
  document.getElementById('ordersPreview').innerHTML = prev.length
    ? prev
        .map(
          (o) => `
    <div class="order-preview">
      <div class="order-preview-top">
        <div>
          <div class="order-id">${escapeHtml(o.id)}</div>
          <div class="order-date">${formatDate(o.date)}</div>
        </div>
        <span class="order-status status-${escapeHtml(o.status)}">${escapeHtml(o.status)}</span>
      </div>
      <div class="order-total">${formatPrice(o.total)}</div>
    </div>`
        )
        .join('')
    : '<p style="color:var(--gray-500);font-size:13px;text-align:center;padding:20px 0">No orders yet</p>';

  const products = await EyeApi.fetchProducts();
  const wlProducts = products.filter((p) => wishIds.some((id) => String(id) === String(p.id)));
  if (wlProducts.length) {
    document.getElementById('wishlistGrid').innerHTML = wlProducts
      .slice(0, 4)
      .map(
        (p) => `
      <div class="wishlist-item" onclick="location.href='${escapeHtml(productPublicHref(p))}'">
        <img src="${escapeHtml(p.image)}" alt="" loading="lazy" />
        <button type="button" class="wishlist-remove" onclick="event.stopPropagation();removeWishlist('${encodeURIComponent(p.id)}')">×</button>
        <div class="wishlist-item-name">${escapeHtml(p.name)}</div>
      </div>`
      )
      .join('');
    document.getElementById('wishlistEmpty').style.display = 'none';
  } else {
    document.getElementById('wishlistEmpty').style.display = 'block';
    document.getElementById('wishlistGrid').innerHTML = '';
  }
}

async function saveProfile() {
  const r = await EyeApi.saveProfileRemote({
    name: document.getElementById('editName').value,
    phone: document.getElementById('editPhone').value,
    address: document.getElementById('editAddress').value,
  });
  if (!r.ok) showToast('Could not sync profile');
  else showToast('Profile updated successfully');
  await loadProfile();
}

function cancelEdit() {
  loadProfile();
  showToast('Changes discarded');
}

async function removeWishlist(enc) {
  const id = decodeURIComponent(enc);
  await EyeApi.wishlistRemove(id);
  await Wishlist.refresh();
  loadProfile();
}

async function logout() {
  await EyeApi.client.auth.signOut();
  Wishlist._ids = new Set();
  showToast('Logging out...');
  setTimeout(() => {
    location.href = 'index.html';
  }, 600);
}
