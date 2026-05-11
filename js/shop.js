let __shopProducts = [];
let __catIdToName = {};
let selectedSizes = [];
let __shopRenderToken = 0;
let __shopLoaderHidden = false;

function hideShopLoader() {
  if (__shopLoaderHidden) return;
  __shopLoaderHidden = true;
  const loader = document.getElementById('pageLoader');
  if (loader) loader.classList.add('hidden');
}

function toggleShopFilters(force) {
  const panel = document.getElementById('shopFiltersPanel');
  const btn = document.getElementById('shopFiltersToggle');
  const topBtn = document.getElementById('shopFiltersTopToggle');
  if (!panel || !btn) return;
  const next = typeof force === 'boolean' ? force : !panel.classList.contains('open');
  panel.classList.toggle('open', next);
  btn.classList.toggle('is-open', next);
  if (topBtn) topBtn.classList.toggle('is-open', next);
}

document.addEventListener('DOMContentLoaded', async () => {
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  // Keep loader visible until at least one product is painted.
  setTimeout(() => hideShopLoader(), 6000);
  const ok = await mountStandardShell('shop');
  if (!ok) {
    hideShopLoader();
    return;
  }

  // 1) Products first (critical path).
  __shopProducts = await EyeApi.fetchProducts();
  const priceMaxInput = document.getElementById('priceMax');
  if (priceMaxInput && __shopProducts.length) {
    const maxProductPrice = Math.max(...__shopProducts.map((p) => Number(p.price) || 0), 0);
    const safeMax = Math.max(5000, Math.ceil(maxProductPrice + maxProductPrice * 0.2));
    priceMaxInput.value = String(safeMax);
  }
  filterChange();
  toggleShopFilters(!isMobile);
  if (!__shopProducts.length) hideShopLoader();

  // 2) Non-critical UI loads after first paint.
  setTimeout(async () => {
    const categories = await EyeApi.fetchCategories();
    const pubCats = (categories || []).filter((c) => c.visibility !== 'private');
    __catIdToName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    const filters = document.getElementById('categoryFilters');
    if (filters) {
      const boxes = pubCats
        .map(
          (c) =>
            `<div class="filter-item"><input type="checkbox" class="cat-cb" id="c-${escapeHtml(
              c.id
            )}" data-cat="${escapeHtml(c.id)}" onchange="onCategoryCheckboxChange()" /><label for="c-${escapeHtml(c.id)}">${escapeHtml(
              c.name
            )}</label></div>`
        )
        .join('');
      filters.innerHTML = boxes || '<p class="filter-empty-note">No categories yet.</p>';
    }
    const params = new URLSearchParams(location.search);
    const urlCat = params.get('cat');
    const sub = document.getElementById('shopSubtitle');
    if (urlCat) {
      const box = document.getElementById('c-' + urlCat);
      if (box) box.checked = true;
      if (sub) sub.textContent = `${__catIdToName[urlCat] || urlCat} Collection`;
      filterChange();
    }
  }, 0);

  setTimeout(async () => {
    const hp = await EyeApi.fetchHomepageJson();
    const sh = hp.shop || {};
    const shopUrls =
      Array.isArray(sh.heroImageUrls) && sh.heroImageUrls.length
        ? sh.heroImageUrls.map(String).filter(Boolean)
        : sh.heroImageUrl
          ? [String(sh.heroImageUrl)]
          : [];
    const bg = document.getElementById('shopHeroBg');
    if (bg && shopUrls.length) {
      bg.innerHTML = shopUrls
        .map(
          (u, i) =>
            `<div class="shop-hero-slide${i === 0 ? ' active' : ''}" style='background-image:url(${JSON.stringify(
              String(u)
            )})'></div>`
        )
        .join('');
      if (shopUrls.length > 1 && !isMobile) {
        const root = document.getElementById('shopHeroRoot');
        const dots = document.createElement('div');
        dots.className = 'shop-hero-dots';
        dots.setAttribute('aria-hidden', 'true');
        let idx = 0;
        shopUrls.forEach((_, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'shop-hero-dot' + (i === 0 ? ' active' : '');
          b.addEventListener('click', () => {
            idx = i;
            bg.querySelectorAll('.shop-hero-slide').forEach((el, j) => el.classList.toggle('active', j === idx));
            dots.querySelectorAll('.shop-hero-dot').forEach((el, j) => el.classList.toggle('active', j === idx));
          });
          dots.appendChild(b);
        });
        root.appendChild(dots);
        setInterval(() => {
          idx = (idx + 1) % shopUrls.length;
          bg.querySelectorAll('.shop-hero-slide').forEach((el, j) => el.classList.toggle('active', j === idx));
          dots.querySelectorAll('.shop-hero-dot').forEach((el, j) => el.classList.toggle('active', j === idx));
        }, 7000);
      }
    }
    const h1 = document.querySelector('.shop-hero-content h1');
    if (h1) {
      h1.innerHTML = `${escapeHtml(sh.heroTitleLine1 || sh.heroTitle || '')} <em>${escapeHtml(sh.heroTitleEm || '')}</em>`;
    }
    const sub = document.getElementById('shopSubtitle');
    if (sub && !sub.textContent.trim()) sub.textContent = sh.defaultSubtitle || '';
  }, 40);
});

function onCategoryCheckboxChange() {
  filterChange();
}

function toggleSize(btn) {
  const s = btn.textContent;
  if (selectedSizes.includes(s)) {
    selectedSizes = selectedSizes.filter((x) => x !== s);
    btn.classList.remove('active');
  } else {
    selectedSizes.push(s);
    btn.classList.add('active');
  }
  filterChange();
}

function getSelectedCategories() {
  const cats = [];
  document.querySelectorAll('.cat-cb:checked').forEach((cb) => cats.push(cb.dataset.cat));
  return cats.length ? cats : null;
}

function clearFilters() {
  document.querySelectorAll('.cat-cb').forEach((cb) => {
    cb.checked = false;
  });
  document.getElementById('priceMin').value = 0;
  const pmax = document.getElementById('priceMax');
  if (pmax && __shopProducts.length) {
    const maxProductPrice = Math.max(...__shopProducts.map((p) => Number(p.price) || 0), 0);
    pmax.value = String(Math.max(5000, Math.ceil(maxProductPrice + maxProductPrice * 0.2)));
  }
  document.getElementById('searchInput').value = '';
  document.getElementById('sortSelect').value = 'newest';
  selectedSizes = [];
  document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
  filterChange();
}

function filterChange() {
  const products = __shopProducts || [];
  const cats = getSelectedCategories();
  const minP = Number(document.getElementById('priceMin').value) || 0;
  const rawMax = Number(document.getElementById('priceMax').value);
  const maxP = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 999999;
  const upper = maxP < minP ? 999999 : maxP;
  const search = document.getElementById('searchInput').value.toLowerCase();
  const sort = document.getElementById('sortSelect').value;

  let filtered = products.filter((p) => {
    if (cats && !cats.includes(p.category)) return false;
    if (p.price < minP || p.price > upper) return false;
    if (search && !p.name.toLowerCase().includes(search)) return false;
    if (selectedSizes.length && !selectedSizes.some((s) => p.sizes.includes(s))) return false;
    return true;
  });

  if (sort === 'price-asc') filtered.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);

  document.getElementById('resultsCount').textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;
  renderProducts(filtered);

  const af = document.getElementById('activeFilters');
  af.innerHTML = '';
  if (cats)
    cats.forEach((c) => {
      const label = escapeHtml(__catIdToName[c] || c);
      const enc = encodeURIComponent(c);
      af.innerHTML += `<div class="filter-tag">${label} <button type="button" onclick="removeCatFilter('${enc}')">×</button></div>`;
    });
  if (selectedSizes.length)
    selectedSizes.forEach((s) => {
      const enc = encodeURIComponent(s);
      af.innerHTML += `<div class="filter-tag">Size: ${escapeHtml(s)} <button type="button" onclick="removeSizeFilter('${enc}')">×</button></div>`;
    });
  if (search) af.innerHTML += `<div class="filter-tag">Search: ${escapeHtml(search)} <button type="button" onclick="clearSearch()">×</button></div>`;
}

function removeCatFilter(enc) {
  const cat = decodeURIComponent(enc);
  const box = document.getElementById('c-' + cat);
  if (box) box.checked = false;
  filterChange();
}

function removeSizeFilter(enc) {
  const s = decodeURIComponent(enc);
  selectedSizes = selectedSizes.filter((x) => x !== s);
  document.querySelectorAll('.size-btn').forEach((b) => {
    if (b.textContent === s) b.classList.remove('active');
  });
  filterChange();
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  filterChange();
}

function renderProducts(list) {
  const grid = document.getElementById('productsGrid');
  __shopRenderToken += 1;
  const myToken = __shopRenderToken;
  if (!list.length) {
    grid.innerHTML = `<div class="no-results"><p>No items found</p></div>`;
    hideShopLoader();
    return;
  }
  grid.innerHTML = '';
  const chunk = window.matchMedia('(max-width: 768px)').matches ? 4 : 10;
  let i = 0;
  const makeCard = (p) => {
    const href = productPublicHref(p);
    const encHref = escapeHtml(href);
    const out = !productHasBuyableStock(p);
    const btnLabel = out ? 'Out of stock' : 'Add to Cart';
    const btnAttrs = out
      ? ' type="button" class="btn" disabled'
      : ` type="button" class="btn" onclick="event.stopPropagation();addToCartShop('${encodeURIComponent(p.id)}')"`;
    return `
      <div class="product-card" onclick="location.href='${encHref}'">
        <div class="product-img-wrap">
          ${p.badge ? `<div style="position:absolute;top:12px;left:12px;z-index:2;background:var(--white);color:var(--black);font-size:9px;letter-spacing:.15em;text-transform:uppercase;padding:4px 10px;">${escapeHtml(
            p.badge
          )}</div>` : ''}
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" />
          <div class="product-overlay">
            <button${btnAttrs}>${btnLabel}</button>
          </div>
        </div>
        <div class="product-info">
          <div class="product-name">${escapeHtml(p.name)}</div>
          <div class="product-price">${
            p.comparePrice
              ? `<span class="product-price-old">${formatPrice(p.comparePrice)}</span><span class="product-price-new">${formatPrice(
                  p.price
                )}</span>`
              : formatPrice(p.price)
          }</div>
        </div>
      </div>`;
  };
  const paint = () => {
    if (myToken !== __shopRenderToken) return;
    const end = Math.min(i + chunk, list.length);
    const html = list.slice(i, end).map(makeCard).join('');
    grid.insertAdjacentHTML('beforeend', html);
    if (i === 0 && end > 0) hideShopLoader();
    i = end;
    if (i < list.length) requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
}

function addToCartShop(encodedId) {
  const id = decodeURIComponent(encodedId);
  const p = __shopProducts.find((x) => String(x.id) === String(id));
  const sz = p ? firstBuyableSize(p) : '';
  if (!p) return;
  if (sz === undefined || sz === null || String(sz) === '') {
    showToast('This size is out of stock');
    return;
  }
  Cart.add(p, sz);
}
