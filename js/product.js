let __pdProduct = null;
let __pdIndex = 0;
let __pdTouchStartX = 0;
let __pdSelectedSize = '';
let __pdZonesCfg = null;
let __pdShipFree = 2000;

function pdLoadSlideImage(idx) {
  const img = document.querySelector(`.pd-gallery-slide[data-i="${idx}"] img[data-src]`);
  if (!img) return;
  const src = img.getAttribute('data-src');
  if (!src) return;
  img.setAttribute('src', src);
  img.removeAttribute('data-src');
}

function pdFillAreas() {
  const gsel = document.getElementById('pdGov');
  const asel = document.getElementById('pdArea');
  if (!gsel || !asel) return;
  const z = (__pdZonesCfg.zones || []).find((x) => String(x.id) === String(gsel.value));
  const areas = z && Array.isArray(z.areas) ? z.areas : [];
  asel.innerHTML = areas
    .map((a) => `<option value="${escapeHtml(String(a.id))}">${escapeHtml(a.name || a.id)}</option>`)
    .join('');
}

function pdSyncShipDisplay() {
  const priceEl = document.getElementById('pdShipPrice');
  const noteEl = document.getElementById('pdShipNote');
  if (!priceEl || !__pdProduct) return;
  const gsel = document.getElementById('pdGov');
  const asel = document.getElementById('pdArea');
  const govId = gsel && gsel.value ? gsel.value : '';
  const areaId = asel && asel.value ? asel.value : '';
  const baseShip = computeShippingEgpForLocation(__pdZonesCfg || { zones: [], defaultShippingEgp: 150 }, govId, areaId);
  const sub = Number(__pdProduct.price) || 0;
  const ship = sub >= __pdShipFree ? 0 : baseShip;
  priceEl.textContent = ship === 0 ? 'Free' : formatPrice(ship);
  if (noteEl) {
    if (sub >= __pdShipFree && baseShip > 0) {
      noteEl.textContent = `Zone rate ${formatPrice(baseShip)} — waived: single-item price over ${formatPrice(__pdShipFree)} (full cart rules apply at checkout).`;
    } else if (sub >= __pdShipFree) {
      noteEl.textContent = 'Eligible for free-shipping threshold (checkout uses full cart total).';
    } else {
      noteEl.textContent = `Free shipping on orders over ${formatPrice(__pdShipFree)} (cart total). Zone rate shown above.`;
    }
  }
}

function pdRenderSizeSpecs(size) {
  const el = document.getElementById('pdSizeSpecs');
  if (!el || !__pdProduct) return;
  const sizes = Array.isArray(__pdProduct.sizes) ? __pdProduct.sizes : [];
  const rows = sizes
    .map((sz) => {
      const specs = (__pdProduct.sizeSpecs && __pdProduct.sizeSpecs[sz]) || {};
      const kgRaw = specs.weight_kg != null ? specs.weight_kg : specs.length_cm;
      const kg = kgRaw != null ? String(kgRaw).trim() : '';
      return `<tr>
        <th>${escapeHtml(sz)}${sz === size ? ' (selected)' : ''}</th>
        <td>${kg ? `${escapeHtml(kg)} kg` : '—'}</td>
      </tr>`;
    })
    .join('');
  if (!rows) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.innerHTML = `
    <div class="pd-specs-title">Size details</div>
    <table class="pd-specs-table">
      <tr><th>Size</th><th>Weight</th></tr>
      ${rows}
    </table>`;
}

function pdSyncBuyRow(selectedSize) {
  if (!__pdProduct) return;
  const st = stockForProductSize(__pdProduct, selectedSize);
  const out = !Number.isFinite(st) || st < 1;
  const av = document.getElementById('pdAvail');
  const addBtn = document.getElementById('pdAddCart');
  const pu = window.__pdUiCopy || {};
  if (av) {
    av.className = 'pd-availability ' + (out ? 'pd-availability-out' : 'pd-availability-in');
    av.textContent = out ? 'Currently unavailable in this size' : 'Available';
  }
  if (addBtn) {
    addBtn.disabled = out;
    addBtn.textContent = out ? 'Out of stock' : pu.addToCartLabel || 'Add to cart';
  }
  pdRenderSizeSpecs(selectedSize);
}

document.addEventListener('DOMContentLoaded', async () => {
  initLoader();
  const ok = await mountStandardShell('shop');
  if (!ok) return;

  const params = new URLSearchParams(location.search);
  const slugQ = params.get('slug');
  const idQ = params.get('id');
  if (!slugQ && !idQ) {
    location.href = 'shop.html';
    return;
  }

  const [productOne, hp, zonesCfg, shipFree] = await Promise.all([
    EyeApi.fetchProductBySlugOrId({ slug: slugQ, id: idQ }),
    EyeApi.fetchHomepageJson(),
    EyeApi.fetchShippingZonesConfig(),
    EyeApi.fetchShippingFreeThresholdEgp(),
  ]);
  __pdZonesCfg = zonesCfg || { zones: [], defaultShippingEgp: 150 };
  __pdShipFree = shipFree;
  const brandBadge = escapeHtml(hp?.brand?.productBadge || '');
  const pu = hp.product || {};
  window.__pdUiCopy = pu;

  __pdProduct = productOne;

  if (!__pdProduct) {
    document.getElementById('productRoot').innerHTML =
      '<p style="padding:120px 24px;text-align:center;font-family:var(--font-serif);font-size:28px;color:var(--gray-500)">Product not found</p>';
    return;
  }

  if (__pdProduct.slug && idQ && !slugQ) {
    try {
      const next = new URLSearchParams();
      next.set('slug', String(__pdProduct.slug).trim());
      history.replaceState({}, '', 'product.html?' + next.toString());
    } catch (_) {}
  }

  const sizes = Array.isArray(__pdProduct.sizes) ? __pdProduct.sizes : [];
  __pdSelectedSize = firstBuyableSize(__pdProduct);
  if (!__pdSelectedSize && sizes.length) __pdSelectedSize = sizes[0];

  const imgs = __pdProduct.images && __pdProduct.images.length ? __pdProduct.images : [__pdProduct.image].filter(Boolean);

  const metaBadge = __pdProduct.badge
    ? `<div class="pd-meta">${escapeHtml(__pdProduct.badge)}</div>`
    : brandBadge
      ? `<div class="pd-meta">${brandBadge}</div>`
      : '<div class="pd-meta"></div>';

  const zones = __pdZonesCfg.zones || [];

  document.getElementById('productRoot').innerHTML = `
    <div class="product-detail-grid">
      <div class="pd-left-col">
        <div class="pd-gallery ${imgs.length > 1 ? 'multi' : ''}" id="pdGallery">
          <div class="pd-gallery-track" id="pdTrack">
            ${imgs
              .map(
                (src, i) =>
                  `<div class="pd-gallery-slide" data-i="${i}"><img ${
                    i === 0 ? `src="${escapeHtml(src)}"` : `data-src="${escapeHtml(src)}"`
                  } alt="" loading="lazy" decoding="async" /></div>`
              )
              .join('')}
          </div>
          ${imgs.length > 1 ? `<button type="button" class="pd-arrow prev" id="pdPrev" aria-label="Previous image">‹</button>
          <button type="button" class="pd-arrow next" id="pdNext" aria-label="Next image">›</button>
          <div class="pd-dots" id="pdDots"></div>` : ''}
        </div>
        <div class="pd-size-specs" id="pdSizeSpecs" style="display:none"></div>
      </div>
      <div class="pd-info">
        ${metaBadge}
        <h1>${escapeHtml(__pdProduct.name)}</h1>
        <div class="pd-price">${
          __pdProduct.comparePrice
            ? `<span class="pd-price-old">${formatPrice(__pdProduct.comparePrice)}</span><span class="pd-price-new">${formatPrice(
                __pdProduct.price
              )}</span>`
            : formatPrice(__pdProduct.price)
        }</div>
        <p class="pd-desc">${escapeHtml(__pdProduct.description || '')}</p>
        <div class="pd-label">${escapeHtml(pu.selectSizeLabel || '')}</div>
        <div class="pd-sizes" id="pdSizes"></div>
        <p class="pd-availability pd-availability-in" id="pdAvail">Available</p>
        <div class="pd-actions">
          <button type="button" class="btn btn-primary" id="pdAddCart">${escapeHtml(pu.addToCartLabel || '')}</button>
          <button type="button" class="btn btn-outline" id="pdWishlist">${escapeHtml(pu.wishlistLabel || '')}</button>
        </div>
        <a href="shop.html" class="pd-back">${escapeHtml(pu.backToShopLabel || '')}</a>
      </div>
    </div>`;

  const sizesEl = document.getElementById('pdSizes');
  sizes.forEach((s) => {
    const st = stockForProductSize(__pdProduct, s);
    const dead = !Number.isFinite(st) || st < 1;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pd-size' + (s === __pdSelectedSize ? ' selected' : '') + (dead ? ' pd-size-na' : '');
    b.textContent = dead ? `${s} (0)` : s;
    b.disabled = dead;
    if (!dead) {
      b.onclick = () => {
        __pdSelectedSize = s;
        sizesEl.querySelectorAll('.pd-size').forEach((x) => x.classList.toggle('selected', x === b));
        pdSyncBuyRow(__pdSelectedSize);
      };
    }
    sizesEl.appendChild(b);
  });

  pdSyncBuyRow(__pdSelectedSize);

  document.getElementById('pdAddCart').onclick = () => {
    if (!__pdSelectedSize) {
      showToast('Please select a size');
      return;
    }
    if (stockForProductSize(__pdProduct, __pdSelectedSize) < 1) return;
    Cart.add(__pdProduct, __pdSelectedSize);
  };

  await Wishlist.refresh();
  const wlBtn = document.getElementById('pdWishlist');
  const wlOn = () => Wishlist.has(__pdProduct.id);
  const syncWlLabel = () => {
    wlBtn.textContent = wlOn() ? pu.savedLabel || 'Saved' : pu.wishlistLabel || 'Wishlist';
  };
  syncWlLabel();
  wlBtn.onclick = async () => {
    await Wishlist.toggle(__pdProduct.id);
    syncWlLabel();
  };

  if (imgs.length > 1) {
    const track = document.getElementById('pdTrack');
    const dots = document.getElementById('pdDots');
    function goSlide(i) {
      const n = imgs.length;
      __pdIndex = ((i % n) + n) % n;
      track.style.transform = `translateX(-${__pdIndex * 100}%)`;
      pdLoadSlideImage(__pdIndex);
      pdLoadSlideImage(__pdIndex + 1);
      pdLoadSlideImage(__pdIndex - 1);
      dots.querySelectorAll('.pd-dot').forEach((dot, j) => dot.classList.toggle('active', j === __pdIndex));
    }
    imgs.forEach((_, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'pd-dot' + (i === 0 ? ' active' : '');
      d.onclick = () => goSlide(i);
      dots.appendChild(d);
    });
    document.getElementById('pdPrev').onclick = () => goSlide(__pdIndex - 1);
    document.getElementById('pdNext').onclick = () => goSlide(__pdIndex + 1);
    pdLoadSlideImage(0);
    pdLoadSlideImage(1);

    const g = document.getElementById('pdGallery');
    g.addEventListener(
      'touchstart',
      (e) => {
        __pdTouchStartX = e.changedTouches[0].screenX;
      },
      { passive: true }
    );
    g.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].screenX - __pdTouchStartX;
      if (dx < -40) goSlide(__pdIndex + 1);
      if (dx > 40) goSlide(__pdIndex - 1);
    });
  }
});
