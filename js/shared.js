// ============================================================
// EYE — SHARED JS (layout shell, cart, helpers)
// Catalog, CMS, auth profile, orders, coupons, wishlist → Supabase (EyeApi).
// Cart → localStorage only (key eye_cart); not stored in Supabase.
// ============================================================

const CART_STORAGE_KEY = 'eye_cart';

function readCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeCartToStorage() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(__cartItems));
  } catch (_) {}
}

let __cartItems = readCartFromStorage();

let __cartPersistTimer = null;
function scheduleCartPersist() {
  clearTimeout(__cartPersistTimer);
  __cartPersistTimer = setTimeout(() => writeCartToStorage(), 200);
}

const Cart = {
  get() {
    return __cartItems.map((i) => ({ ...i }));
  },
  reloadFromStorage() {
    __cartItems = readCartFromStorage();
    this.updateBadge();
  },
  add(product, size, qty = 1) {
    const max = stockForProductSize(product, size);
    if (!Number.isFinite(max) || max < 1) {
      showToast('Out of stock');
      return false;
    }
    const key = `${product.id}-${size}`;
    const idx = __cartItems.findIndex((i) => i.key === key);
    const cur = idx > -1 ? __cartItems[idx].qty : 0;
    if (cur + qty > max) {
      showToast(`Only ${max} available`);
      return false;
    }
    if (idx > -1) __cartItems[idx].qty += qty;
    else {
      __cartItems.push({
        key,
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image || (product.images && product.images[0]) || '',
        size,
        qty,
        maxStock: max,
      });
    }
    if (idx > -1) __cartItems[idx].maxStock = max;
    this.updateBadge();
    scheduleCartPersist();
    showToast('Added to cart');
    return true;
  },
  remove(key) {
    __cartItems = __cartItems.filter((i) => i.key !== key);
    this.updateBadge();
    scheduleCartPersist();
  },
  updateQty(key, qty) {
    const item = __cartItems.find((i) => i.key === key);
    if (item) {
      const cap = Number.isFinite(item.maxStock) ? item.maxStock : Infinity;
      if (qty > cap) {
        showToast(`Only ${cap} available`);
        qty = cap;
      }
      item.qty = qty;
      if (qty <= 0) {
        this.remove(key);
        return;
      }
    }
    this.updateBadge();
    scheduleCartPersist();
  },
  syncStockFromCatalog(products) {
    const map = Object.fromEntries((products || []).map((p) => [String(p.id), p]));
    let changed = false;
    const kept = [];
    for (const item of __cartItems) {
      const p = map[String(item.productId)];
      const max = p ? stockForProductSize(p, item.size) : NaN;
      if (!p || !Number.isFinite(max) || max < 1) {
        changed = true;
        continue;
      }
      if (item.qty > max) {
        item.qty = max;
        changed = true;
      }
      item.maxStock = max;
      item.price = Number(p.price);
      kept.push(item);
    }
    if (kept.length !== __cartItems.length) changed = true;
    __cartItems = kept;
    if (changed) {
      this.updateBadge();
      writeCartToStorage();
    }
    return changed;
  },
  total() {
    return __cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  },
  count() {
    return __cartItems.reduce((s, i) => s + i.qty, 0);
  },
  updateBadge() {
    document.querySelectorAll('.cart-badge').forEach((b) => {
      b.textContent = this.count() || '';
      b.style.display = this.count() ? 'flex' : 'none';
    });
  },
  clear() {
    __cartItems = [];
    this.updateBadge();
    writeCartToStorage();
  },
};

const Wishlist = {
  _ids: null,
  async refresh() {
    if (!EyeApi.isRemote()) {
      this._ids = new Set();
      return;
    }
    const list = await EyeApi.fetchWishlistProductIds();
    this._ids = new Set((list || []).map(String));
  },
  has(id) {
    return this._ids && this._ids.has(String(id));
  },
  async toggle(productId) {
    if (!EyeApi.isRemote()) {
      showToast('Sign in to use the wishlist');
      return;
    }
    const sid = String(productId);
    if (this._ids == null) await this.refresh();
    if (this._ids.has(sid)) {
      const r = await EyeApi.wishlistRemove(productId);
      if (r.ok) {
        this._ids.delete(sid);
        showToast('Removed from wishlist');
      }
    } else {
      const r = await EyeApi.wishlistAdd(productId);
      if (r.error === 'auth') {
        showToast('Sign in to use the wishlist');
        return;
      }
      if (r.ok) {
        this._ids.add(sid);
        showToast('Added to wishlist');
      }
    }
  },
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

function formatPrice(p) {
  return `EGP ${Number(p).toLocaleString()}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function slugifyProductName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseProductJsonMap(val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) return { ...val };
  if (typeof val === 'string' && val.trim()) {
    try {
      const o = JSON.parse(val);
      return o && typeof o === 'object' && !Array.isArray(o) ? { ...o } : {};
    } catch {
      return {};
    }
  }
  return {};
}

function productPublicHref(p) {
  if (!p) return 'shop.html';
  const s = p.slug != null ? String(p.slug).trim() : '';
  if (s) return `product.html?slug=${encodeURIComponent(s)}`;
  return `product.html?id=${encodeURIComponent(p.id)}`;
}

function stockForProductSize(p, size) {
  if (!p) return 0;
  const ss = p.sizeStocks;
  const k = String(size);
  if (ss && typeof ss === 'object' && !Array.isArray(ss) && Object.prototype.hasOwnProperty.call(ss, k)) {
    const n = Number(ss[k]);
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  const fallback = Number(p.stock);
  return Number.isFinite(fallback) ? Math.max(0, Math.floor(fallback)) : 0;
}

function productHasBuyableStock(p) {
  if (!p) return false;
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  if (!sizes.length) return stockForProductSize(p, '') >= 1;
  return sizes.some((s) => stockForProductSize(p, s) >= 1);
}

function firstBuyableSize(p) {
  const sizes = Array.isArray(p.sizes) ? p.sizes : [];
  if (!sizes.length) return '';
  const ok = sizes.find((s) => stockForProductSize(p, s) >= 1);
  return ok != null ? ok : '';
}

/** Shipping EGP for governorate + optional area (same rules as checkout). */
function computeShippingEgpForLocation(zonesCfg, govId, areaId) {
  const cfg = zonesCfg || { zones: [], defaultShippingEgp: 150 };
  const def = Number(cfg.defaultShippingEgp) >= 0 ? Number(cfg.defaultShippingEgp) : 150;
  if (!govId) return def;
  const z = (cfg.zones || []).find((x) => String(x.id) === String(govId));
  if (!z) return def;
  let ship = Number(z.shippingEgp) >= 0 ? Number(z.shippingEgp) : def;
  if (areaId && Array.isArray(z.areas)) {
    const a = z.areas.find((x) => String(x.id) === String(areaId));
    if (a && Number(a.shippingEgp) >= 0) ship = Number(a.shippingEgp);
  }
  return ship;
}

function linkActive(l, activePage) {
  const href = l.href || '';
  const base = href.split('?')[0].replace(/^\.\//, '');
  if (activePage === 'home' && (base === 'index.html' || href === 'index.html')) return true;
  if (activePage === 'shop' && base === 'shop.html') return true;
  if (activePage === 'contact' && base === 'contact.html') return true;
  return false;
}

function renderNavbar(activePage, links, brandWordmark, isAdmin) {
  const items = (links || []).filter((l) => l.zone === 'primary_nav');
  const lis = items
    .map((l) => {
      const active = linkActive(l, activePage) ? ' active' : '';
      return `<li><a href="${escapeHtml(l.href)}" class="${active}">${escapeHtml(l.label)}</a></li>`;
    })
    .join('');
  const adminLi = isAdmin ? '<li><a href="admin.html">Admin</a></li>' : '';
  const word = "𝐄𝐘𝐄ᵀᴹ";
  return `
  <nav class="navbar" id="navbar">
    <div class="nav-left">
      <button class="nav-icon menu-trigger" type="button" title="Menu" onclick="toggleSidebar(true)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <a href="index.html" class="nav-logo">${word}</a>
    </div>
    <ul class="nav-links">
      ${lis}
      ${adminLi}
    </ul>
    <div class="nav-actions">
      <button class="nav-icon" onclick="location.href='shop.html'" type="button" title="Search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      </button>
      <button class="nav-icon" onclick="location.href='profile.html'" type="button" title="Profile">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </button>
      <button class="nav-icon" onclick="location.href='cart.html'" type="button" title="Cart" style="position:relative">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        <span class="cart-badge">0</span>
      </button>
    </div>
  </nav>
  ${renderMobileSidebar(activePage, isAdmin, word)}
  `;
}

function renderMobileSidebar(activePage, isAdmin, brand) {
  const links = [
    { label: 'Home', href: 'index.html', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { label: 'Shop', href: 'shop.html', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' },
    { label: 'Contact', href: 'contact.html', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
    { label: 'Feedback', href: 'feedbacks.html', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' },
    { label: 'Policy', href: 'Return and Exchange Policy.html', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' },
  ];
  if (isAdmin) {
    links.push({ label: 'Admin', href: 'admin.html', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' });
  }

  const itemsHtml = links.map(l => {
    const active = linkActive(l, activePage) ? 'active' : '';
    return `
    <a href="${l.href}" class="sidebar-item ${active}">
      <span class="sidebar-item-icon">${l.icon}</span>
      <span class="sidebar-item-label">${l.label}</span>
    </a>`;
  }).join('');

  return `
  <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar(false)"></div>
  <aside class="sidebar-panel" id="sidebarPanel">
    <div class="sidebar-header">
      <button class="sidebar-close" onclick="toggleSidebar(false)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="sidebar-title">${brand}</div>
    </div>
    <div class="sidebar-nav">
      ${itemsHtml}
    </div>
    <div class="sidebar-footer">
      <p>© ${new Date().getFullYear()} ${brand}</p>
    </div>
  </aside>`;
}

function toggleSidebar(open) {
  const panel = document.getElementById('sidebarPanel');
  const overlay = document.getElementById('sidebarOverlay');
  if (!panel || !overlay) return;
  if (open) {
    panel.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  } else {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function zoneTitle(zone, hp) {
  const cols = hp?.footer?.columns;
  if (cols && Array.isArray(cols)) {
    const c = cols.find((x) => x.zone === zone);
    if (c && c.title) return c.title;
  }
  if (zone === 'footer_shop') return 'Shop';
  if (zone === 'footer_account') return 'Account';
  if (zone === 'footer_info') return 'Information';
  if (zone === 'footer_social') return 'Social';
  return zone.replace(/^footer_/, '').replace(/_/g, ' ');
}

function renderFooter(navRows, hp) {
  const tagline = escapeHtml(hp?.footer?.tagline || '');
  const copy = escapeHtml(hp?.footer?.copyright || '');
  const brand = escapeHtml(hp?.brand?.wordmark || 'eye');
  const zones = ['footer_shop', 'footer_account', 'footer_info', 'footer_social'];
  const colsHtml = zones
    .map((zone) => {
      const links = (navRows || []).filter((l) => l.zone === zone);
      if (!links.length) return '';
      const title = escapeHtml(zoneTitle(zone, hp));
      const lis = links
        .map((l) => `<li><a href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a></li>`)
        .join('');
      return `<div class="footer-col"><h4>${title}</h4><ul>${lis}</ul></div>`;
    })
    .join('');
  return `
  <footer>
    <div class="footer-grid">
      <div class="footer-brand">
        <a href="index.html" class="nav-logo">${brand}</a>
        <p>${tagline}</p>
      </div>
      ${colsHtml}
    </div>
    <div class="footer-bottom">
      <div class="footer-bottom-inner">
        <p>${copy}</p>
        <a href="https://makeurwebsite.vercel.app" target="_blank" class="made-by-badge">
          Made by <span>makeurwebsite</span>
        </a>
      </div>
    </div>
  </footer>`;
}

function renderBackendMissingBanner() {

  if (!sessionStorage.getItem("backend_refresh")) {

    sessionStorage.setItem("backend_refresh", "true");

    setTimeout(() => {
      location.reload();
    }, 2000);

  }

  return `
    <div class="navbar" style="justify-content:center;padding:20px;">
      Reconnecting...
    </div>
  `;
}

async function mountStandardShell(activePage) {
  await EyeApi.init();
  const navEl = document.getElementById('navbar-container');
  const footEl = document.getElementById('footer-container');
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!EyeApi.isRemote()) {
    if (navEl) navEl.innerHTML = renderBackendMissingBanner();
    if (footEl) footEl.innerHTML = '';
    return false;
  }
  await injectMarquee();
  const [navRows, hp, session] = await Promise.all([
    EyeApi.fetchNavigationLinks(),
    EyeApi.fetchHomepageJson(),
    EyeApi.getSessionUser(),
  ]);
  const isAdmin = session ? await EyeApi.isAdminUid(session.id) : false;
  const brand = hp?.brand?.wordmark || 'eye';
  if (navEl) navEl.innerHTML = renderNavbar(activePage, navRows, brand, isAdmin);
  if (footEl) footEl.innerHTML = renderFooter(navRows, hp);
  initNavbar();
  Cart.reloadFromStorage();
  if (session) {
    await Wishlist.refresh().catch(() => {});
  } else {
    Wishlist._ids = new Set();
  }
  Cart.updateBadge();
  
  if (typeof EyeAnalytics !== 'undefined') {
    EyeAnalytics.trackPageView(activePage || 'unknown');
  }
  
  return true;
}

function initNavbar() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const onScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  Cart.updateBadge();
}

function initLoader() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;
  const start = Date.now();
  const hide = () => {
    const elapsed = Date.now() - start;
    const min = 1500; // Stay for at least 1.5s
    const delay = Math.max(0, min - elapsed);
    setTimeout(() => {
      loader.classList.add('hidden');
      setTimeout(() => { loader.style.display = 'none'; }, 800);
    }, delay);
  };
  if (document.readyState === 'complete') hide();
  else window.addEventListener('load', hide, { once: true });
  // Fallback
  setTimeout(hide, 4000);
}

async function injectMarquee() {
  let segments = [];
  await EyeApi.init();
  if (EyeApi.isRemote()) {
    const rows = await EyeApi.fetchAnnouncements();
    if (rows && rows.length) {
      segments = rows.map((r) => ({ text: r.message, href: r.link_url || null }));
    }
    if (!segments.length) {
      const t = await EyeApi.getSiteSetting('marquee_text');
      if (t && String(t).trim()) {
        String(t)
          .split('·')
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((text) => segments.push({ text, href: null }));
      }
    }
  }
  if (!segments.length) return;

  const bar = document.createElement('div');
  bar.className = 'marquee-bar';
  bar.setAttribute('aria-label', 'Announcements');
  const inner = document.createElement('div');
  inner.className = 'marquee-bar-inner';
  const parts = segments.map((seg) => {
    const safe = escapeHtml(seg.text);
    if (seg.href) {
      const h = escapeHtml(seg.href);
      return `<a href="${h}" class="marquee-link">${safe}</a>`;
    }
    return `<span>${safe}</span>`;
  });
  const chunk = parts.join('<span> · </span>') + '<span> · </span>';
  inner.innerHTML = (chunk + chunk + chunk + chunk).repeat(2);
  bar.appendChild(inner);
  document.body.insertBefore(bar, document.body.firstChild);
  document.body.classList.add('has-marquee');
}

document.addEventListener('DOMContentLoaded', () => {
  Cart.updateBadge();
});
