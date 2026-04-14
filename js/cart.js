let appliedCoupon = null;
let __couponsCache = [];
let __cartUi = {};
let __shipFree = 2000;
let __checkoutWallets = { telda: '', instapay: '' };
let __checkoutZonesCfg = { zones: [], defaultShippingEgp: 150 };
let __checkoutShipEgp = 150;
let __cartPreviewShipEgp = 150;
let __checkoutPrefetch = null;

function prefetchCheckoutContext() {
  if (!__checkoutPrefetch) {
    __checkoutPrefetch = Promise.all([
      EyeApi.fetchMyProfile().catch(() => null),
      EyeApi.getSessionUser().catch(() => null),
      EyeApi.fetchPaymentWallets().catch(() => ({ telda: '', instapay: '' })),
      EyeApi.fetchShippingZonesConfig().catch(() => ({ zones: [], defaultShippingEgp: 150 })),
    ]).then(([user, sessionUser, wallets, zonesCfg]) => ({
      user,
      sessionUser,
      wallets,
      zonesCfg,
    }));
  }
  return __checkoutPrefetch;
}

document.addEventListener('DOMContentLoaded', async () => {
  initLoader();
  renderCart();
  const ok = await mountStandardShell('');
  if (!ok) return;
  prefetchCheckoutContext();
  const hp = await EyeApi.fetchHomepageJson();
  __cartUi = hp.ui || {};
  __shipFree = await EyeApi.fetchShippingFreeThresholdEgp();
  __couponsCache = await EyeApi.fetchCoupons();
  const zc = await EyeApi.fetchShippingZonesConfig();
  __cartPreviewShipEgp = Number(zc.defaultShippingEgp) >= 0 ? Number(zc.defaultShippingEgp) : 150;
  const prods = await EyeApi.fetchProducts();
  Cart.syncStockFromCatalog(prods);
  renderCart();
});

function shipNote() {
  const t = __cartUi.shippingNoteTemplate || 'Free shipping over EGP {threshold}';
  return escapeHtml(t.replace('{threshold}', String(__shipFree)));
}

function renderCart() {
  const items = Cart.get();
  const container = document.getElementById('cartContent');
  if (!container) return;
  document.getElementById('cartMeta').textContent = `${Cart.count()} item${Cart.count() !== 1 ? 's' : ''}`;

  if (!items.length) {
    const t = __cartUi.cartEmptyTitle || '';
    const b = __cartUi.cartEmptyBody || '';
    const cta = __cartUi.cartEmptyCtaLabel || '';
    const href = escapeHtml(__cartUi.cartEmptyCtaHref || 'shop.html');
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">∅</div>
        <h2>${escapeHtml(t)}</h2>
        <p>${escapeHtml(b)}</p>
        <a href="${href}" class="btn btn-primary">${escapeHtml(cta)}</a>
      </div>`;
    return;
  }

  const subtotal = Cart.total();
  const discount = appliedCoupon
    ? appliedCoupon.type === 'percent'
      ? Math.round((subtotal * appliedCoupon.value) / 100)
      : appliedCoupon.value
    : 0;
  const shipping = subtotal >= __shipFree ? 0 : __cartPreviewShipEgp;
  const total = subtotal - discount + shipping;

  const sumTitle = escapeHtml(__cartUi.summaryTitle || '');
  const couponPh = escapeHtml(__cartUi.couponPlaceholder || '');
  const applyLbl = escapeHtml(__cartUi.couponApplyLabel || 'Apply');
  const secure = escapeHtml(__cartUi.secureNote || '');

  container.innerHTML = `
    <div class="cart-layout">
      <div class="cart-items">
        <div class="cart-header"><span>Product</span><span>Price</span><span>Quantity</span><span></span></div>
        ${items
          .map((item, i) => {
            const k = JSON.stringify(item.key);
            return `
          <div class="cart-item" style="animation-delay:${i * 0.08}s">
            <div class="cart-item-product">
              <img class="cart-item-img" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />
              <div class="cart-item-details">
                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                <div class="cart-item-size">Size: ${escapeHtml(item.size)}</div>
              </div>
            </div>
            <div class="cart-item-price">${formatPrice(item.price)}</div>
            <div class="qty-control">
              <button type="button" class="qty-btn" onclick='changeQty(${k}, -1)'>−</button>
              <span class="qty-num">${item.qty}</span>
              <button type="button" class="qty-btn" onclick='changeQty(${k}, 1)'>+</button>
            </div>
            <button type="button" class="remove-btn" onclick='removeItem(${k})'>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>`;
          })
          .join('')}
        <div style="margin-top:24px">
          <a href="shop.html" class="btn btn-ghost" style="font-size:11px;letter-spacing:.2em">← Continue Shopping</a>
        </div>
      </div>

      <div class="cart-summary">
        <div class="summary-title">${sumTitle}</div>
        <div class="coupon-form">
          <input class="coupon-input" id="couponInput" type="text" placeholder="${couponPh}" />
          <button type="button" class="btn btn-primary" onclick="applyCoupon()" style="padding:12px 20px;font-size:11px;">${applyLbl}</button>
        </div>
        <div id="couponMsg"></div>
        <div class="summary-row"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
        ${discount > 0 ? `<div class="summary-row" style="color:#8fd9a8"><span>Discount (${escapeHtml(appliedCoupon.code)})</span><span>−${formatPrice(discount)}</span></div>` : ''}
        <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? 'Free' : formatPrice(shipping)}</span></div>
        ${shipping > 0 ? `<div style="font-size:10px;letter-spacing:.1em;color:var(--gray-500);margin:-8px 0 16px;text-align:right">${shipNote()}</div>` : ''}
        <div class="summary-divider"></div>
        <div class="summary-row total"><span>Total</span><span>${formatPrice(total)}</span></div>
        <button type="button" class="btn btn-primary checkout-btn" onclick="openCheckoutModal()">Proceed to Checkout</button>
        <p class="secure-note">${secure}</p>
      </div>
    </div>`;
}

function changeQty(key, delta) {
  const item = Cart.get().find((i) => i.key === key);
  if (!item) return;
  Cart.updateQty(key, item.qty + delta);
  renderCart();
}

function removeItem(key) {
  Cart.remove(key);
  renderCart();
  showToast('Item removed from cart');
}

async function applyCoupon() {
  const code = document.getElementById('couponInput').value.trim().toUpperCase();
  const coupons = (await EyeApi.fetchCoupons()) || __couponsCache;
  __couponsCache = coupons;
  const coupon = coupons.find((c) => c.code === code);
  const msg = document.getElementById('couponMsg');
  if (!coupon) {
    msg.textContent = 'Invalid coupon code.';
    msg.className = 'error';
    return;
  }
  if (new Date(coupon.expiry) < new Date()) {
    msg.textContent = 'This coupon has expired.';
    msg.className = 'error';
    return;
  }
  if (coupon.uses >= coupon.maxUses) {
    msg.textContent = 'Coupon usage limit reached.';
    msg.className = 'error';
    return;
  }
  appliedCoupon = coupon;
  const discText = coupon.type === 'percent' ? `${coupon.value}% off` : `EGP ${coupon.value} off`;
  msg.textContent = `✓ Coupon applied — ${discText}`;
  msg.className = 'success';
  renderCart();
}

function computeTotals() {
  const subtotal = Cart.total();
  const discount = appliedCoupon
    ? appliedCoupon.type === 'percent'
      ? Math.round((subtotal * appliedCoupon.value) / 100)
      : appliedCoupon.value
    : 0;
  const shipping = subtotal >= __shipFree ? 0 : __cartPreviewShipEgp;
  const total = subtotal - discount + shipping;
  return { subtotal, discount, shipping, total };
}

function computeCheckoutModalTotals() {
  const subtotal = Cart.total();
  const discount = appliedCoupon
    ? appliedCoupon.type === 'percent'
      ? Math.round((subtotal * appliedCoupon.value) / 100)
      : appliedCoupon.value
    : 0;
  const shipping = subtotal >= __shipFree ? 0 : __checkoutShipEgp;
  const total = subtotal - discount + shipping;
  return { subtotal, discount, shipping, total };
}

function syncCheckoutShipFromSelection() {
  const gsel = document.getElementById('chkGov');
  const asel = document.getElementById('chkArea');
  const govId = gsel && gsel.value ? gsel.value : '';
  const areaId = asel && asel.value ? asel.value : '';
  __checkoutShipEgp = computeShippingEgpForLocation(__checkoutZonesCfg, govId, areaId);
}

function fillCheckoutAreas() {
  const gsel = document.getElementById('chkGov');
  const asel = document.getElementById('chkArea');
  if (!gsel || !asel) return;
  const z = (__checkoutZonesCfg.zones || []).find((x) => String(x.id) === String(gsel.value));
  const areas = z && Array.isArray(z.areas) ? z.areas : [];
  asel.innerHTML = areas
    .map((a) => `<option value="${escapeHtml(String(a.id))}">${escapeHtml(a.name || a.id)}</option>`)
    .join('');
}

function refreshCheckoutPaymentHint() {
  const box = document.getElementById('chkWalletBox');
  const txt = document.getElementById('chkWalletText');
  if (!box || !txt) return;
  const pay = document.getElementById('chkPayMethod')?.value || '';
  if (pay === 'Telda' && __checkoutWallets.telda) {
    box.style.display = 'block';
    txt.textContent = __checkoutWallets.telda;
    return;
  }
  if (pay === 'InstaPay' && __checkoutWallets.instapay) {
    box.style.display = 'block';
    txt.textContent = __checkoutWallets.instapay;
    return;
  }
  box.style.display = 'none';
  txt.textContent = '';
}

function refreshCheckoutTotalsDisplay() {
  const t = computeCheckoutModalTotals();
  const sub = document.getElementById('chkSubDisplay');
  const tot = document.getElementById('chkTotalDisplay');
  const ship = document.getElementById('chkShipDisplay');
  const shipSub = document.getElementById('chkShipSub');
  const discWrap = document.getElementById('chkDiscWrap');
  const discAmt = document.getElementById('chkDiscDisplay');
  const discLbl = document.getElementById('chkDiscLabel');
  const zones = __checkoutZonesCfg.zones || [];
  const g = document.getElementById('chkGov');
  const a = document.getElementById('chkArea');
  const govName = g?.selectedOptions[0]?.text?.trim() || '';
  const areaName = a?.selectedOptions[0]?.text?.trim() || '';
  if (sub) sub.textContent = formatPrice(t.subtotal);
  if (tot) tot.textContent = formatPrice(t.total);
  if (ship) {
    if (zones.length) {
      const rate = Number(__checkoutShipEgp) || 0;
      if (t.shipping === 0 && rate > 0) {
        ship.textContent = 'Free';
        if (shipSub) {
          shipSub.style.display = 'block';
          const loc = areaName ? `${govName} · ${areaName}` : govName || 'Zone';
          shipSub.textContent = `Zone rate ${formatPrice(rate)} (${loc}) — waived (orders over ${formatPrice(__shipFree)}).`;
        }
      } else if (t.shipping === 0 && rate === 0) {
        ship.textContent = 'Free';
        if (shipSub) {
          shipSub.style.display = 'block';
          shipSub.textContent = areaName ? `Delivery: ${govName} · ${areaName}` : govName || '';
        }
      } else {
        ship.textContent = formatPrice(t.shipping);
        if (shipSub) {
          shipSub.style.display = 'block';
          const loc = areaName ? `${govName} · ${areaName}` : govName || '';
          shipSub.textContent = loc ? `Delivery: ${loc}` : `Zone rate ${formatPrice(rate)}`;
        }
      }
    } else {
      ship.textContent = t.shipping === 0 ? 'Free' : formatPrice(t.shipping);
      if (shipSub) {
        shipSub.style.display = 'none';
        shipSub.textContent = '';
      }
    }
  }
  if (discWrap && discAmt && discLbl) {
    if (t.discount > 0 && appliedCoupon) {
      discWrap.style.display = '';
      discLbl.textContent = `Discount (${appliedCoupon.code})`;
      discAmt.textContent = `−${formatPrice(t.discount)}`;
    } else {
      discWrap.style.display = 'none';
    }
  }
}

function readCheckoutAddress() {
  const zones = __checkoutZonesCfg.zones || [];
  if (!zones.length) {
    return document.getElementById('chkAddress')?.value.trim() || '';
  }
  const g = document.getElementById('chkGov');
  const a = document.getElementById('chkArea');
  const d = document.getElementById('chkDetail');
  const govName = g?.selectedOptions[0]?.text?.trim() || '';
  const areaName = a?.selectedOptions[0]?.text?.trim() || '';
  const detail = d?.value.trim() || '';
  if (!detail) return '';
  return [govName, areaName, detail].filter(Boolean).join(' — ');
}

async function openCheckoutModal() {
  if (!Cart.count()) return;
  const { user, sessionUser, wallets, zonesCfg } = await prefetchCheckoutContext();
  const isGuestCheckout = !user;
  __checkoutWallets = wallets;
  __checkoutZonesCfg = zonesCfg;
  const zones = __checkoutZonesCfg.zones || [];
  if (zones.length) {
    __checkoutShipEgp = Number(zones[0].shippingEgp) >= 0 ? Number(zones[0].shippingEgp) : Number(__checkoutZonesCfg.defaultShippingEgp) || 150;
  } else {
    __checkoutShipEgp = Number(__checkoutZonesCfg.defaultShippingEgp) || 150;
  }

  const chkTitle = escapeHtml(__cartUi.checkoutTitle || 'Checkout');
  const chkLead = escapeHtml(__cartUi.checkoutLead || '');
  const placeLbl = escapeHtml(__cartUi.checkoutSubmitLabel || 'Place order');
  const cancelLbl = escapeHtml(__cartUi.checkoutCancelLabel || 'Cancel');
  const contactBlock = isGuestCheckout
    ? `<div class="form-row">
        <label for="chkGuestUsername">Username *</label>
        <input id="chkGuestUsername" type="text" required autocomplete="username" placeholder="How we should address you" />
      </div>
      <div class="form-row">
        <label for="chkGuestPhone">Phone number *</label>
        <input id="chkGuestPhone" type="tel" required placeholder="01xxxxxxxxx" />
      </div>
      <div class="form-row">
        <label for="chkGuestEmail">Email *</label>
        <input id="chkGuestEmail" type="email" required placeholder="you@example.com" />
      </div>`
    : `<div class="form-row">
        <label for="chkPhone">Phone number *</label>
        <input id="chkPhone" type="tel" required placeholder="01xxxxxxxxx" value="${escapeHtml(user.phone || '')}" />
      </div>`;

  const govBlock =
    zones.length > 0
      ? `<div class="form-row">
          <label for="chkGov">Governorate *</label>
          <select id="chkGov" required>${zones
            .map((z) => `<option value="${escapeHtml(String(z.id))}">${escapeHtml(z.name || z.id)}</option>`)
            .join('')}</select>
        </div>
        <div class="form-row">
          <label for="chkArea">Area *</label>
          <select id="chkArea" required></select>
        </div>
        <div class="form-row">
          <label for="chkDetail">Street, building, phone for courier *</label>
          <textarea id="chkDetail" required placeholder="Building, floor, landmark, phone…"></textarea>
        </div>`
      : `<div class="form-row">
          <label for="chkAddress">Full delivery address *</label>
          <textarea id="chkAddress" required placeholder="Street, building, city, phone for courier"></textarea>
        </div>`;

  const old = document.getElementById('checkoutOverlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'checkoutOverlay';
  overlay.className = 'modal-overlay-checkout';
  overlay.innerHTML = `
      <div class="checkout-modal checkout-modal-wide" role="dialog" aria-labelledby="chkTitle">
        <h2 id="chkTitle">${chkTitle}</h2>
        <p class="checkout-lead">${chkLead}</p>
        ${contactBlock}
        ${govBlock}
        <div class="form-row">
          <label for="chkPayMethod">Payment Method *</label>
          <select id="chkPayMethod" class="payment-select" required>
            <option value="">— Select payment method —</option>
            <option value="InstaPay">💸 InstaPay</option>
            <option value="Telda">💳 Telda</option>
            <option value="Cash on Delivery">📦 Cash on Delivery (COD)</option>
          </select>
        </div>
        <div id="chkWalletBox" class="checkout-wallet-box" style="display:none">
          <div class="checkout-wallet-label">Send payment to</div>
          <div id="chkWalletText" class="checkout-wallet-num"></div>
        </div>
        <div class="checkout-order-totals">
          <div class="summary-row"><span>Subtotal</span><span id="chkSubDisplay" style="font-family:var(--font-serif)"></span></div>
          <div id="chkDiscWrap" class="summary-row" style="display:none;color:#8fd9a8;justify-content:space-between;width:100%"><span id="chkDiscLabel"></span><span id="chkDiscDisplay" style="font-family:var(--font-serif)"></span></div>
          <div class="summary-row chk-ship-main"><span>Shipping</span><div class="chk-ship-value-col"><span id="chkShipDisplay" style="font-family:var(--font-serif)"></span><div id="chkShipSub" class="checkout-ship-sub"></div></div></div>
          <div class="summary-divider"></div>
          <div class="summary-row total"><span>Total</span><span id="chkTotalDisplay" style="font-family:var(--font-serif)"></span></div>
        </div>
        <div style="display:flex;gap:12px;margin-top:28px">
          <button type="button" class="btn btn-primary" style="flex:1" id="chkPlaceBtn">${placeLbl}</button>
          <button type="button" class="btn btn-outline" id="chkCancelBtn">${cancelLbl}</button>
        </div>
      </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCheckoutModal();
  });
  document.getElementById('chkCancelBtn').onclick = closeCheckoutModal;
  document.getElementById('chkPlaceBtn').onclick = () => submitCheckout();

  if (zones.length) {
    fillCheckoutAreas();
    syncCheckoutShipFromSelection();
    const govEl = document.getElementById('chkGov');
    const areaEl = document.getElementById('chkArea');
    govEl.addEventListener('change', () => {
      fillCheckoutAreas();
      syncCheckoutShipFromSelection();
      refreshCheckoutTotalsDisplay();
    });
    areaEl.addEventListener('change', () => {
      syncCheckoutShipFromSelection();
      refreshCheckoutTotalsDisplay();
    });
    document.getElementById('chkDetail').value = user?.address || '';
  } else {
    document.getElementById('chkAddress').value = user?.address || '';
  }
  if (isGuestCheckout && sessionUser?.email) {
    const ge = document.getElementById('chkGuestEmail');
    if (ge && !ge.value) ge.value = sessionUser.email;
  }

  document.getElementById('chkPayMethod')?.addEventListener('change', refreshCheckoutPaymentHint);
  refreshCheckoutPaymentHint();
  refreshCheckoutTotalsDisplay();
  overlay.classList.add('open');
}

function closeCheckoutModal() {
  const overlay = document.getElementById('checkoutOverlay');
  if (overlay) overlay.classList.remove('open');
}

async function submitCheckout() {
  const addr = readCheckoutAddress();
  if (!addr) {
    showToast('Please complete your delivery address');
    return;
  }
  const pay = document.getElementById('chkPayMethod')?.value || '';
  if (!pay) {
    showToast('Please select a payment method');
    return;
  }
  const user = await EyeApi.fetchMyProfile();
  const isGuest = !user;
  const guestUsername = document.getElementById('chkGuestUsername')?.value.trim() || '';
  const guestPhone = document.getElementById('chkGuestPhone')?.value.trim() || '';
  const guestEmail = document.getElementById('chkGuestEmail')?.value.trim() || '';
  const memberPhone = document.getElementById('chkPhone')?.value.trim() || user?.phone || '';
  const phone = isGuest ? guestPhone : memberPhone;
  if (isGuest && !guestUsername) {
    showToast('Username is required');
    return;
  }
  if (!phone) {
    showToast('Phone number is required');
    return;
  }
  if (isGuest && !guestEmail) {
    showToast('Email is required for guest checkout');
    return;
  }

  const live = await EyeApi.fetchProducts();
  const byId = Object.fromEntries(live.map((p) => [String(p.id), p]));
  for (const i of Cart.get()) {
    const p = byId[String(i.productId)];
    if (!p) {
      showToast('A product in your cart is no longer available. Update your cart.');
      return;
    }
    const st = stockForProductSize(p, i.size);
    if (!Number.isFinite(st) || st < 1 || i.qty > st) {
      showToast(`Not enough stock for ${p.name || 'an item'}`);
      return;
    }
  }

  const { subtotal, discount, shipping, total } = computeCheckoutModalTotals();
  const items = Cart.get();
  const newOrder = {
    date: new Date().toISOString().split('T')[0],
    status: 'Pending',
    payment_method: pay,
    payment_status: 'Pending',
    items: items.map((i) => ({
      productId: i.productId,
      name: i.name,
      price: i.price,
      qty: i.qty,
      size: i.size,
      image: i.image || '',
    })),
    subtotal,
    discount,
    shipping,
    total,
    coupon_code: appliedCoupon ? appliedCoupon.code : null,
    address: `${isGuest ? `Username: ${guestUsername} | ` : ''}Phone: ${phone}${isGuest ? ` | Email: ${guestEmail}` : ''} | Address: ${addr}`,
  };

  const res = await EyeApi.saveOrder(newOrder);
  if (!res.ok) {
    const errMsg = String(res.error?.message || res.error || 'Could not place order');
    if (/Anonymous sign-ins are disabled/i.test(errMsg)) {
      showToast('Guest checkout is disabled in Supabase. Enable Anonymous sign-ins in Auth settings.');
      return;
    }
    showToast(errMsg);
    return;
  }

  // Discord webhook notification on new order
  try {
    const itemsList = items.map(i => `• ${i.name} (Size: ${i.size}) - ${i.qty} x ${formatPrice(i.price)}`).join('\n');
    const webhookData = {
      content: '@everyone 🛍️ **NEW ORDER PLACED!** 🛍️',
      embeds: [{
        title: `📦 Order Details`,
        color: 0x00ff00,
        fields: [
          { name: '👤 Customer', value: isGuest ? guestUsername || 'Guest' : user?.name || 'Member', inline: true },
          { name: '📞 Phone', value: phone || 'N/A', inline: true },
          { name: '📧 Email', value: isGuest ? guestEmail || 'N/A' : user?.email || 'N/A', inline: true },
          { name: '📍 Address', value: addr, inline: false },
          { name: '💰 Payment', value: pay, inline: true },
          { name: '📅 Date', value: newOrder.date, inline: true },
          { name: '📦 Items', value: itemsList || 'No items', inline: false },
          { name: '💵 Subtotal', value: formatPrice(subtotal), inline: true },
          { name: '🏷️ Discount', value: discount > 0 ? `-${formatPrice(discount)}` : 'None', inline: true },
          { name: '🚚 Shipping', value: shipping === 0 ? 'Free' : formatPrice(shipping), inline: true },
          { name: '🔢 TOTAL', value: formatPrice(total), inline: true },
          { name: '🎫 Coupon', value: appliedCoupon ? appliedCoupon.code : 'None', inline: true }
        ],
        footer: { text: `Order ID: ${res.orderId || 'N/A'}` },
        timestamp: new Date().toISOString()
      }]
    };
    
    await fetch('https://discord.com/api/webhooks/1493248672044154901/z5sWU2B7WlkuIEQs1ULcHAiHkKOcEy_WnrAY9k7M7c8vyxKNA2sbW_qGSDCzqTDdRoZi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookData)
    });
  } catch (webhookErr) {
    console.warn('Webhook notification failed:', webhookErr);
  }

  if (user && user.address !== addr) {
    await EyeApi.saveProfileRemote({ name: user.name, phone, address: addr });
  }

  const { data: postSess } = await EyeApi.client.auth.getSession();
  const postUser = postSess.session?.user;
  const isAnonSession =
    postUser &&
    (postUser.is_anonymous === true ||
      (postUser.app_metadata && postUser.app_metadata.provider === 'anonymous'));
  if (isAnonSession && res.orderId && res.userId) {
    EyeApi.savePendingOrderClaim(res.orderId, res.userId);
  }

  Cart.clear();
  appliedCoupon = null;
  closeCheckoutModal();
  showToast(
    isAnonSession
      ? 'Order placed. Sign in with the same email you used at checkout to save it to your account and track it.'
      : 'Order placed'
  );
  setTimeout(() => {
    location.href = 'orders.html';
  }, 900);
}