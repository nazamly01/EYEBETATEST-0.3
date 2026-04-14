function buildHeroTitleLines(lines, emIdx) {
  if (!lines || !lines.length) return '';
  return lines
    .map((line, i) => {
      const inner = i === emIdx ? `<em>${escapeHtml(line)}</em>` : escapeHtml(line);
      return i < lines.length - 1 ? inner + '<br>' : inner;
    })
    .join('');
}

function heroImageUrls(h) {
  if (!h) return [];
  if (Array.isArray(h.imageUrls) && h.imageUrls.length) return h.imageUrls.map(String).filter(Boolean);
  if (h.imageUrl) return [String(h.imageUrl)];
  return [];
}

function initHeroCarousel(mountEl) {
  const slides = mountEl.querySelectorAll('.hero-slide');
  if (slides.length <= 1) return;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) return;
  let idx = 0;
  const dots = mountEl.querySelectorAll('.hero-dot');
  const show = (j) => {
    const n = slides.length;
    idx = ((j % n) + n) % n;
    slides.forEach((s, k) => s.classList.toggle('active', k === idx));
    dots.forEach((d, k) => d.classList.toggle('active', k === idx));
  };
  dots.forEach((d, i) => {
    d.addEventListener('click', () => show(i));
  });
  setInterval(() => show(idx + 1), 6500);
}
let __homeProducts = [];
let __homeRenderToken = 0;

function renderFeaturedProgressive(list) {
  const gridEl = document.getElementById('featuredGrid');
  if (!gridEl) return;
  __homeRenderToken += 1;
  const token = __homeRenderToken;
  if (!list.length) {
    gridEl.innerHTML =
      '<p style="grid-column:1/-1;text-align:center;color:var(--gray-500);padding:40px">No products in the database yet. Add products in Supabase or the admin panel.</p>';
    return;
  }
  gridEl.innerHTML = '';
  const chunk = window.matchMedia('(max-width: 768px)').matches ? 2 : 4;
  let i = 0;
  const step = () => {
    if (token !== __homeRenderToken) return;
    const end = Math.min(i + chunk, list.length);
    gridEl.insertAdjacentHTML('beforeend', list.slice(i, end).map(renderProductCard).join(''));
    i = end;
    if (i < list.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderHero(h) {
  if (!h) return '';
  const urls = heroImageUrls(h);
  const pre = escapeHtml(h.pre || '');
  const title = buildHeroTitleLines(h.titleLines || [], h.titleEmLineIndex);
  const sub = escapeHtml(h.sub || '');
  const scroll = escapeHtml(h.scrollLabel || '');
  const ctas = (h.ctas || [])
    .map(
      (c) =>
        `<a href="${escapeHtml(c.href || '#')}" class="btn ${c.style === 'outline' ? 'btn-outline' : 'btn-primary'}">${escapeHtml(
          c.label || ''
        )}</a>`
    )
    .join('');
  const imgs = urls.length ? urls : [];
  const slidesHtml = imgs
    .map(
      (u, i) =>
        `<div class="hero-slide${i === 0 ? ' active' : ''}"><img src="${escapeHtml(u)}" alt="" /></div>`
    )
    .join('');
  const dotsHtml =
    imgs.length > 1
      ? `<div class="hero-carousel-dots" aria-hidden="true">${imgs
          .map((_, i) => `<button type="button" class="hero-dot${i === 0 ? ' active' : ''}" aria-label="Slide ${i + 1}"></button>`)
          .join('')}</div>`
      : '';
  const bgBlock =
    imgs.length > 0
      ? `<div class="hero-bg hero-bg-slides">${slidesHtml}</div>`
      : `<div class="hero-bg"></div>`;
  return `
  ${bgBlock}
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <p class="hero-pre">${pre}</p>
    <h1 class="hero-title">${title}</h1>
    <p class="hero-sub">${sub}</p>
    <div class="hero-actions">${ctas}</div>
    ${dotsHtml}
  </div>
  <div class="hero-scroll">
    <svg width="16" height="24" viewBox="0 0 16 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="1" y="1" width="14" height="22" rx="7"/><path d="M8 5v5"/></svg>
    ${scroll}
  </div>`;
}

function renderCategoryGrid(categories) {
  const list = categories || [];
  return list
    .map((c) => {
      const img = escapeHtml(c.image_url || '');
      const name = escapeHtml(c.name || '');
      const href = `shop.html?cat=${encodeURIComponent(c.id)}`;
      return `
    <div class="cat-item" onclick="location.href='${href}'">
      <img src="${img}" alt="${name}" loading="lazy" />
      <div class="cat-overlay">
        <div class="cat-label">${name}</div>
        <a href="${href}" class="cat-link">Shop Now</a>
      </div>
    </div>`;
    })
    .join('');
}

function renderProductCard(p) {
  const href = productPublicHref(p);
  const out = !productHasBuyableStock(p);
  const btnLabel = out ? 'Out of stock' : 'Add to Cart';
  const encHref = escapeHtml(href);
  const btnClick = out ? '' : `onclick="event.stopPropagation();quickAddFromCard('${encodeURIComponent(p.id)}')"`;
  const btnAttrs = out ? ' type="button" class="btn" disabled' : ` type="button" class="btn" ${btnClick}`;
  const priceHtml = p.comparePrice
    ? `<span class="product-price-old">${formatPrice(p.comparePrice)}</span><span class="product-price-new">${formatPrice(p.price)}</span>`
    : formatPrice(p.price);
  return `
    <div class="product-card" data-product-id="${p.id}" onclick="location.href='${encHref}'">
      <div class="product-img-wrap">
        ${p.badge ? `<div style="position:absolute;top:12px;left:12px;z-index:2;background:var(--white);color:var(--black);font-size:9px;letter-spacing:.15em;text-transform:uppercase;padding:4px 10px;">${escapeHtml(p.badge)}</div>` : ''}
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" />
        <div class="product-overlay">
          <button${btnAttrs}>${btnLabel}</button>
        </div>
      </div>
      <div class="product-info">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="product-price">${priceHtml}</div>
      </div>
    </div>`;
}

async function quickAddFromCard(encodedId) {
  const id = decodeURIComponent(encodedId);
  const products = __homeProducts.length ? __homeProducts : await EyeApi.fetchProducts();
  const p = products.find((x) => String(x.id) === String(id));
  const sz = p ? firstBuyableSize(p) : '';
  if (p && sz !== undefined && sz !== null && String(sz) !== '') Cart.add(p, sz);
}

async function handleNewsletter(e) {
  e.preventDefault();
  const input = e.target.querySelector('input[type="email"]');
  const email = input && input.value.trim();
  if (!email) return;
  const r = await EyeApi.newsletterSubscribe(email);
  if (r.ok) showToast('Thank you for subscribing.');
  else showToast('Could not subscribe — try again later.');
  e.target.reset();
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const ok = await mountStandardShell('home');
    initLoader();
    if (!ok) {
      const grid = document.getElementById('featuredGrid');
      if (grid) {
        grid.innerHTML =
          '<p style="grid-column:1/-1;text-align:center;color:var(--gray-500);padding:48px 24px">Connect Supabase in <strong>js/config.js</strong> and run the SQL in <strong>supabase/</strong> to load products and content.</p>';
      }
      return;
    }

    const hpPromise = EyeApi.fetchHomepageJson();
    const categoriesPromise = EyeApi.fetchCategories();
    const productsPromise = EyeApi.fetchProducts();

    // 1) Hero first.
    const hp = await hpPromise;

    const heroEl = document.getElementById('homeHeroMount');
    if (heroEl) {
      heroEl.innerHTML = renderHero(hp.hero);
      initHeroCarousel(heroEl);
    }

    // 2) Categories next.
    const categories = await categoriesPromise;
    const catHdr = document.getElementById('categorySectionHeader');
    if (catHdr) {
      const ch = hp.categories || {};
      const titleBlock = ch.titleHtml ? `<h2 class="section-title">${ch.titleHtml}</h2>` : '';
      catHdr.innerHTML = `<p class="section-label">${escapeHtml(ch.sectionLabel || '')}</p>${titleBlock}`;
    }
    const catGrid = document.getElementById('categoryGridMount');
    if (catGrid) {
      const pubCats = (categories || []).filter((c) => c.visibility !== 'private');
      catGrid.innerHTML = renderCategoryGrid(pubCats);
    }

    const feat = hp.featured || {};
    const featHdr = document.getElementById('featuredSectionHeader');
    if (featHdr) {
      featHdr.innerHTML = `
      <p class="section-label">${escapeHtml(feat.sectionLabel || '')}</p>
      <h2 class="section-title">${escapeHtml(feat.sectionTitle || '')}<em>${escapeHtml(feat.sectionTitleEm || '')}</em></h2>`;
    }
    // 3) Featured products after that.
    const products = await productsPromise;
    __homeProducts = products || [];
    const configuredLimit = Number(feat.limit) > 0 ? Number(feat.limit) : 4;
    const limit = isMobile ? Math.min(configuredLimit, 3) : configuredLimit;
    const featured = __homeProducts.slice(0, limit);
    renderFeaturedProgressive(featured);

    const fCta = feat.cta || { label: 'View All Products', href: 'shop.html', style: 'outline' };
    const ctaWrap = document.getElementById('featuredCtaWrap');
    if (ctaWrap) {
      ctaWrap.innerHTML = `<a href="${escapeHtml(fCta.href || 'shop.html')}" class="btn btn-outline">${escapeHtml(
        fCta.label || 'View All'
      )}</a>`;
    }

    const sp = hp.split || {};
    const splitMount = document.getElementById('splitSectionMount');
    if (splitMount) {
      const cta = sp.cta || { label: '', href: 'shop.html' };
      const splitUrls =
        Array.isArray(sp.imageUrls) && sp.imageUrls.length
          ? sp.imageUrls.map(String).filter(Boolean)
          : sp.imageUrl
            ? [String(sp.imageUrl)]
            : [];
      const splitImgs =
        splitUrls.length > 1
          ? `<div class="split-img split-img-grid" style="animation:fadeUp 1s ease both">${splitUrls
              .map((u) => `<div class="split-img-cell"><img src="${escapeHtml(u)}" alt="" loading="lazy" /></div>`)
              .join('')}</div>`
          : `<div class="split-img" style="animation:fadeUp 1s ease both">
        <img src="${escapeHtml(splitUrls[0] || '')}" alt="" loading="lazy" />
      </div>`;
      splitMount.innerHTML = `
      ${splitImgs}
      <div class="split-text">
        <p class="section-label">${escapeHtml(sp.label || '')}</p>
        <h2 class="section-title">${escapeHtml(sp.titleLine1 || '')}<br><em>${escapeHtml(sp.titleLine2Em || '')}</em></h2>
        <div class="divider"></div>
        ${(sp.paragraphs || []).map((t) => `<p>${escapeHtml(t)}</p>`).join('')}
        <a href="${escapeHtml(cta.href || '#')}" class="btn btn-primary">${escapeHtml(cta.label || '')}</a>
      </div>`;
    }

    const stats = hp.stats || [];
    const statsEl = document.getElementById('statsRowMount');
    if (statsEl) {
      statsEl.innerHTML = stats
        .map(
          (s) => `
      <div class="stat-item">
        <div class="stat-number">${escapeHtml(s.number || '')}</div>
        <div class="stat-label">${escapeHtml(s.label || '')}</div>
      </div>`
        )
        .join('');
    }

    const nl = hp.newsletter || {};
    const nlEl = document.getElementById('newsletterSectionMount');
    if (nlEl) {
      nlEl.innerHTML = `
      <p class="section-label">${escapeHtml(nl.sectionLabel || '')}</p>
      <h2 class="section-title">${escapeHtml(nl.titleLine1 || '')}<em>${escapeHtml(nl.titleEm || '')}</em></h2>
      <p>${escapeHtml(nl.body || '')}</p>
      <form class="newsletter-form" onsubmit="handleNewsletter(event)">
        <input type="email" class="newsletter-input" placeholder="${escapeHtml(nl.placeholder || '')}" required />
        <button type="submit" class="btn btn-primary" style="white-space:nowrap">${escapeHtml(nl.buttonLabel || '')}</button>
      </form>`;
    }

    if (!isMobile) {
      const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.style.opacity = '1';
            e.target.style.transform = 'translateY(0)';
          }
        });
      },
        { threshold: 0.1 }
      );
      document.querySelectorAll('.product-card, .stat-item, .split-section').forEach((el) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
        observer.observe(el);
      });
    }
  } catch (err) {
    console.error('EYE index:', err);
    const grid = document.getElementById('featuredGrid');
    if (grid) {
      grid.innerHTML =
        '<p style="grid-column:1/-1;text-align:center;color:var(--gray-500);padding:48px">Something went wrong loading the page. Check the browser console and your Supabase configuration.</p>';
    }
  } finally {}
});
