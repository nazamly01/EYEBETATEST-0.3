let editingProductId = null;
let productImages = [];
let _adminOrdersCache = [];

function adminLogout() {
  EyeApi.client.auth.signOut().then(() => (location.href = 'index.html'));
}

function showPage(name, el) {
  document.querySelectorAll('.admin-page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item').forEach((i) => i.classList.remove('active'));
  document.getElementById('page-' + name)?.classList.add('active');
  el.classList.add('active');
  if (name === 'dashboard') initDashboard();
  if (name === 'products') renderProductsTable();
  if (name === 'orders') renderOrdersTable('all');
  if (name === 'users') renderUsersTable();
  if (name === 'coupons') renderCouponsTable();
  if (name === 'accounting') initAccounting();
  if (name === 'shipping') initShippingPage();
  if (name === 'analytics') initAnalytics();
  if (name === 'contact-admin') initContactAdmin();
  if (name === 'settings') initSettings();
}

function statusBadge(s) {
  const map = { Pending: 'yellow', Processing: 'blue', Shipped: 'green', Delivered: 'gray', Returned: 'red' };
  return `<span class="badge badge-${map[s] || 'gray'}">${escapeHtml(s)}</span>`;
}

function paymentBadge(s) {
  const k = (s || 'pending').toLowerCase().replace(/\s+/g, '');
  const cls =
    k === 'paid' ? 'pay-paid' : k === 'failed' ? 'pay-failed' : k === 'refunded' ? 'pay-refunded' : 'pay-pending';
  return `<span class="pay-status ${cls}">${escapeHtml(s || 'Pending')}</span>`;
}

function paymentMethodPill(m) {
  const v = String(m || '').toLowerCase();
  if (v.includes('telda')) return '<span class="pay-method pay-method-telda">Telda</span>';
  if (v.includes('insta')) return '<span class="pay-method pay-method-insta">InstaPay</span>';
  if (v.includes('cash')) return '<span class="pay-method pay-method-cod">COD</span>';
  return `<span class="pay-method pay-method-other">${escapeHtml(m || '—')}</span>`;
}

function closeOrderDetailModal() {
  document.getElementById('orderDetailOverlay')?.remove();
}

function openOrderDetailModal(orderId) {
  closeOrderDetailModal();
  const o = _adminOrdersCache.find((x) => String(x.id) === String(orderId));
  if (!o) return;
  const items = Array.isArray(o.items) ? o.items : [];
  const lines = items
    .map((it) => {
      const img = it.image || it.imageUrl || '';
      const nm = it.name || 'Item';
      return `<div class="order-detail-line">
        <div class="order-detail-line-img">${img ? `<img src="${escapeHtml(img)}" alt="" />` : '<span class="order-detail-ph">—</span>'}</div>
        <div class="order-detail-line-body">
          <div class="order-detail-line-name">${escapeHtml(nm)}</div>
          <div class="order-detail-line-meta">${escapeHtml(it.size || '')} · Qty ${escapeHtml(String(it.qty || 0))} · ${formatPrice(it.price)}</div>
        </div>
      </div>`;
    })
    .join('');
  const wrap = document.createElement('div');
  wrap.id = 'orderDetailOverlay';
  wrap.className = 'modal-overlay modal-overlay-top open';
  wrap.innerHTML = `<div class="modal modal-order-detail" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title">Order ${escapeHtml(o.id)}</div>
      <button type="button" class="modal-close" onclick="closeOrderDetailModal()">✕</button>
    </div>
    <div class="order-detail-body">
      <div class="order-detail-grid">
        <div><span class="od-label">Date</span><span class="od-val">${escapeHtml(formatDate(o.date || o.created_at))}</span></div>
        <div><span class="od-label">Payment</span><span class="od-val">${paymentMethodPill(o.payment_method)} ${paymentBadge(o.payment_status)}</span></div>
        <div><span class="od-label">Status</span><span class="od-val">${statusBadge(o.status)}</span></div>
      </div>
      <div class="order-detail-totals">
        <div class="od-total-row"><span>Subtotal</span><span>${formatPrice(Number(o.subtotal != null ? o.subtotal : o.total) || 0)}</span></div>
        ${
          Number(o.discount) > 0
            ? `<div class="od-total-row od-total-disc"><span>Discount</span><span>−${formatPrice(Number(o.discount))}</span></div>`
            : ''
        }
        <div class="od-total-row"><span>Shipping</span><span>${Number(o.shipping) === 0 ? 'Free' : formatPrice(Number(o.shipping || 0))}</span></div>
        <div class="od-total-row od-total-grand"><span>Total</span><span>${formatPrice(o.total)}</span></div>
      </div>
      <div class="od-label" style="margin:20px 0 10px">Shipping address</div>
      <div class="order-detail-address">${escapeHtml(o.address || '—')}</div>
      <div class="od-label" style="margin:20px 0 10px">Line items</div>
      <div class="order-detail-lines">${lines || '<p style="color:var(--gray-500)">No line items</p>'}</div>
    </div>
  </div>`;
  wrap.onclick = () => closeOrderDetailModal();
  wrap.querySelector('.modal').onclick = (e) => e.stopPropagation();
  document.body.appendChild(wrap);
}

function last6MonthBuckets() {
  const labels = [];
  const keys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    labels.push(d.toLocaleString('en-GB', { month: 'short' }));
  }
  return { keys, labels };
}

function revenueByMonth(orders) {
  const { keys, labels } = last6MonthBuckets();
  const vals = keys.map(() => 0);
  (orders || []).forEach((o) => {
    const raw = o.date || o.created_at;
    if (!raw) return;
    const d = new Date(raw);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const idx = keys.indexOf(k);
    if (idx >= 0) vals[idx] += Number(o.total) || 0;
  });
  return { labels, vals };
}

async function initDashboard() {
  document.getElementById('dashDate').textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const orders = await EyeApi.fetchOrders();
  const users = await EyeApi.fetchUsers();
  const products = await EyeApi.fetchProducts();
  const totalRev = orders.reduce((s, o) => s + (o.total || 0), 0);
  const expenses = await EyeApi.fetchExpenses();
  const totalCost = expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Total Revenue</div><div class="stat-card-value">${formatPrice(totalRev)}</div><div class="stat-card-delta">—</div></div>
    <div class="stat-card"><div class="stat-card-label">Net Profit</div><div class="stat-card-value">${formatPrice(totalRev - totalCost)}</div><div class="stat-card-delta">—</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Orders</div><div class="stat-card-value">${orders.length}</div><div class="stat-card-delta">—</div></div>
    <div class="stat-card"><div class="stat-card-label">Profiles</div><div class="stat-card-value">${users.filter((u) => u.status === 'active').length}</div><div class="stat-card-delta">—</div></div>`;
  const { labels, vals } = revenueByMonth(orders);
  const maxV = Math.max(...vals, 1);
  document.getElementById('revenueChart').innerHTML = `<div class="chart-bars">${labels
    .map(
      (m, i) => `<div class="chart-bar-wrap"><div class="chart-bar-val">${vals[i] >= 1000 ? (vals[i] / 1000).toFixed(1) + 'K' : Math.round(vals[i])}</div><div class="chart-bar" style="height:${(vals[i] / maxV) * 100}%"></div><div class="chart-bar-label">${m}</div></div>`
    )
    .join('')}</div>`;
  const recent = [...orders].reverse().slice(0, 5);
  document.getElementById('recentOrdersTable').innerHTML = `<table><thead><tr><th>Order ID</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead><tbody>${recent
    .map(
      (o) =>
        `<tr><td style="font-weight:500;color:var(--white)">${escapeHtml(o.id)}</td><td>${statusBadge(o.status)}</td><td>${paymentBadge(o.payment_status)}</td><td style="font-family:var(--font-serif);color:var(--white)">${formatPrice(o.total)}</td></tr>`
    )
    .join('')}</tbody></table>`;
  document.getElementById('bestSellersTable').innerHTML = `<thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th></tr></thead><tbody>${products
    .slice(0, 5)
    .map(
      (p) =>
        `<tr><td><div style="display:flex;align-items:center;gap:12px"><img src="${escapeHtml(p.image || p.images?.[0])}" class="product-thumb" /><span style="font-family:var(--font-serif);font-size:14px;color:var(--white)">${escapeHtml(p.name)}</span></div></td><td><span class="badge badge-gray">${escapeHtml(p.category)}</span></td><td>${formatPrice(p.price)}</td><td><span class="badge ${p.stock <= 5 ? 'badge-red' : 'badge-green'}">${p.stock}</span></td></tr>`
    )
    .join('')}</tbody>`;
}

async function renderProductsTable(search = '') {
  let products = await EyeApi.fetchProducts();
  if (search) products = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  document.getElementById('productCount').textContent = `${products.length} Products`;
  document.getElementById('productsTable').innerHTML = `
    <thead><tr><th>Image</th><th>Name</th><th>Slug</th><th>Category</th><th>Price</th><th>Cost</th><th>Unit profit</th><th>Stock</th><th>Vis</th><th>Images</th><th>Actions</th></tr></thead>
    <tbody>${products
      .map(
        (p) => `
      <tr>
        <td><img src="${escapeHtml(p.image || p.images?.[0])}" class="product-thumb" /></td>
        <td style="font-family:var(--font-serif);font-size:15px;color:var(--white)">${escapeHtml(p.name)}</td>
        <td style="font-size:11px;color:var(--gray-500);max-width:120px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.slug || '—')}</td>
        <td><span class="badge badge-gray">${escapeHtml(p.category)}</span></td>
        <td style="color:var(--white)">${p.comparePrice ? `<span style="text-decoration:line-through;opacity:.6;margin-right:6px">${formatPrice(p.comparePrice)}</span><span>${formatPrice(p.price)}</span>` : formatPrice(p.price)}</td>
        <td style="color:var(--gray-500);font-size:13px">${formatPrice(p.cost ?? 0)}</td>
        <td style="color:var(--gray-500);font-size:13px">${formatPrice(
          p.unitProfit != null ? p.unitProfit : Number(p.price) - Number(p.cost || 0)
        )}</td>
        <td><span class="badge ${p.stock <= 5 ? 'badge-red' : 'badge-green'}">${p.stock}</span></td>
        <td><span class="badge ${p.visibility === 'private' ? 'badge-yellow' : 'badge-green'}">${escapeHtml(p.visibility === 'private' ? 'Private' : 'Public')}</span></td>
        <td style="font-size:11px;color:var(--gray-500)">${(p.images || [p.image]).filter(Boolean).length} photo${(p.images || [p.image]).filter(Boolean).length !== 1 ? 's' : ''}</td>
        <td><div style="display:flex;gap:8px">
          <button class="action-btn action-btn-edit" onclick='openProductModal(${JSON.stringify(p.id)})'>Edit</button>
          <button class="action-btn action-btn-del" onclick='deleteProduct(${JSON.stringify(p.id)})'>Delete</button>
        </div></td>
      </tr>`
      )
      .join('')}</tbody>`;
}

function searchProducts(v) {
  renderProductsTable(v);
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  const r = await EyeApi.adminDeleteProduct(id);
  if (!r.ok) {
    showToast('Delete failed');
    return;
  }
  renderProductsTable();
  showToast('Product deleted');
}

function onAdminSizesBlur() {
  renderProductPerSizeInputs(window.__adminProdModalRef);
}

function capturePerSizeDraftFromDom() {
  const stocks = {};
  const specs = {};
  document.querySelectorAll('[data-ps-idx]').forEach((row) => {
    const idx = row.getAttribute('data-ps-idx');
    const sz = row.getAttribute('data-ps-size');
    if (idx == null || !sz) return;
    const q = document.getElementById(`psq-${idx}`);
    const kg = document.getElementById(`pskg-${idx}`);
    if (q) stocks[sz] = Number(q.value) || 0;
    specs[sz] = {
      weight_kg: kg && kg.value.trim() ? kg.value.trim() : '',
    };
  });
  return { stocks, specs };
}

function renderProductPerSizeInputs(p) {
  const mount = document.getElementById('pPerSizeMount');
  if (!mount) return;
  const draft = capturePerSizeDraftFromDom();
  const rawSizes = document.getElementById('pSizes')?.value || '';
  const sizes = rawSizes.split(',').map((s) => s.trim()).filter(Boolean);
  const baseStocks = { ...((p && p.sizeStocks) || {}), ...draft.stocks };
  const baseSpecs = { ...((p && p.sizeSpecs) || {}), ...draft.specs };
  if (!sizes.length) {
    mount.innerHTML =
      '<label class="form-label">Per-size stock &amp; weight</label><p style="font-size:11px;color:var(--gray-500);line-height:1.5">Add sizes above, then tab out to set stock and optional weight (kg) per size. If per-size stock is empty, the main Stock field is used for all sizes.</p>';
    return;
  }
  mount.innerHTML = `<label class="form-label">Per-size stock &amp; weight (kg)</label>
    <div class="admin-per-size-wrap">${sizes
      .map((s, i) => {
        const st = baseStocks[s] != null && baseStocks[s] !== '' ? Number(baseStocks[s]) : '';
        const sp = baseSpecs[s] || {};
        const kg = sp.weight_kg != null ? escapeHtml(String(sp.weight_kg)) : '';
        return `<div class="admin-per-size-row" data-ps-idx="${i}" data-ps-size="${escapeHtml(s)}">
          <div class="admin-per-size-label">${escapeHtml(s)}</div>
          <div class="admin-per-size-fields">
            <div class="form-field" style="min-width:0"><label class="form-label">Stock</label><input class="form-input" id="psq-${i}" type="number" min="0" step="1" value="${st === '' ? '' : escapeHtml(String(st))}" placeholder="Qty" /></div>
            <div class="form-field" style="min-width:0"><label class="form-label">Weight</label><input class="form-input" id="pskg-${i}" type="text" value="${kg}" placeholder="kg" /></div>
          </div>
        </div>`;
      })
      .join('')}</div>`;
}

async function adminUniqueProductSlug(base, excludeId) {
  let s = slugifyProductName(base) || 'product';
  const all = await EyeApi.fetchProducts();
  const taken = (cand) =>
    all.some((pr) => {
      if (String(pr.slug || '').toLowerCase() !== String(cand).toLowerCase()) return false;
      if (!excludeId) return true;
      return String(pr.id) !== String(excludeId);
    });
  let cand = s;
  let n = 0;
  while (taken(cand)) {
    n += 1;
    cand = `${s}-${n}`;
  }
  return cand;
}

async function openProductModal(id) {
  editingProductId = id || null;
  const [products, categories] = await Promise.all([EyeApi.fetchProducts(), EyeApi.fetchCategories()]);
  const p = id ? products.find((x) => String(x.id) === String(id)) : null;
  productImages = p ? [...(p.images || [p.image].filter(Boolean))] : [];

  const catOpts = categories
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}" ${p && String(p.category) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    )
    .join('');

  document.getElementById('modalTitle').textContent = p ? 'Edit Product' : 'Add Product';
  document.getElementById('modalBody').innerHTML = `
    <div class="admin-form">
      <div class="form-field full">
        <label class="form-label">Product Name</label>
        <input class="form-input" id="pName" value="${escapeHtml(p?.name || '')}" placeholder="Product name" />
      </div>
      <div class="form-field full">
        <label class="form-label">URL slug (clean link; auto-filled from name if empty)</label>
        <input class="form-input" id="pSlug" value="${escapeHtml(p?.slug || '')}" placeholder="e.g. silk-evening-dress" />
      </div>
      <div class="form-field">
        <label class="form-label">Price (EGP)</label>
        <input class="form-input" id="pPrice" type="number" value="${p?.price ?? ''}" placeholder="0" />
      </div>
      <div class="form-field">
        <label class="form-label">Old price (EGP, optional for sale)</label>
        <input class="form-input" id="pOldPrice" type="number" value="${p?.comparePrice ?? ''}" placeholder="Leave empty if no sale" />
      </div>
      <div class="form-field">
        <label class="form-label">Stock</label>
        <input class="form-input" id="pStock" type="number" value="${p?.stock ?? ''}" placeholder="0" />
      </div>
      <div class="form-field">
        <label class="form-label">Cost (EGP)</label>
        <input class="form-input" id="pCost" type="number" step="0.01" value="${p != null && p.cost != null ? Number(p.cost) : 0}" placeholder="0" />
      </div>
      <div class="form-field">
        <label class="form-label">Visibility</label>
        <select class="form-select" id="pVis">
          <option value="public" ${p?.visibility !== 'private' ? 'selected' : ''}>Public (storefront)</option>
          <option value="private" ${p?.visibility === 'private' ? 'selected' : ''}>Private (admin only)</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Category</label>
        <select class="form-select" id="pCat">${catOpts}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Badge (optional)</label>
        <input class="form-input" id="pBadge" value="${escapeHtml(p?.badge || '')}" placeholder="New, Sale, etc." />
      </div>
      <div class="form-field full">
        <label class="form-label">Sizes (comma separated)</label>
        <input class="form-input" id="pSizes" value="${escapeHtml(p?.sizes?.join(', ') || '')}" placeholder="XS, S, M, L, XL" onblur="onAdminSizesBlur()" />
      </div>
      <div class="form-field full">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="pDesc" placeholder="Product description...">${escapeHtml(p?.description || '')}</textarea>
      </div>
      <div class="form-field full" id="pPerSizeMount"></div>
      <div class="form-field full">
        <label class="form-label">Product Images (URLs, one per line or comma-separated)</label>
        <textarea class="form-textarea" id="pImagesInput" placeholder="https://..." onchange="updateImagePreviews()">${productImages.join('\n')}</textarea>
        <button type="button" class="btn btn-outline" onclick="updateImagePreviews()" style="margin-top:8px;padding:8px 16px;font-size:10px">Preview Images</button>
      </div>
      <div class="form-field full">
        <label class="form-label">Upload photos (browser converts to JPEG, max width ~1400px)</label>
        <input type="file" class="form-input" id="pImageFiles" accept="image/*" multiple onchange="handleProductImageFiles(event)" />
        <p style="font-size:11px;color:var(--gray-500);margin-top:6px;line-height:1.5">Uses Supabase Storage bucket <code>product-images</code> (run project SQL). If upload fails, paste image URLs above.</p>
      </div>
      <div class="images-preview" id="imagesPreview"></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-gold" onclick="saveProduct()">Save Product</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`;

  document.getElementById('modalOverlay').classList.add('open');
  if (productImages.length) updateImagePreviews();
  window.__adminProdModalRef = p;
  renderProductPerSizeInputs(p);
}

async function compressImageFileToJpeg(file, maxW = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('load'));
    };
    img.src = url;
  });
}

async function handleProductImageFiles(ev) {
  const input = ev.target;
  const files = input.files;
  if (!files || !files.length) return;
  const ta = document.getElementById('pImagesInput');
  const existing = (ta?.value || '')
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let i = 0; i < files.length; i++) {
    try {
      const blob = await compressImageFileToJpeg(files[i]);
      const r = await EyeApi.uploadProductImageBlob(blob, 'image/jpeg');
      if (r.ok) existing.push(r.url);
      else showToast(String(r.error || 'Upload failed'));
    } catch {
      showToast('Could not process an image');
    }
  }
  if (ta) ta.value = existing.join('\n');
  updateImagePreviews();
  input.value = '';
  showToast('Images ready — save product to keep');
}

function updateImagePreviews() {
  const raw = document.getElementById('pImagesInput')?.value || '';
  productImages = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const preview = document.getElementById('imagesPreview');
  if (!preview) return;
  preview.innerHTML = productImages
    .map(
      (url, i) => `
    <div class="img-preview-item">
      <img src="${escapeHtml(url)}" onerror="this.style.opacity=.3" />
      <button class="img-remove" onclick="removeImagePreview(${i})">×</button>
    </div>`
    )
    .join('');
}

function removeImagePreview(idx) {
  productImages.splice(idx, 1);
  document.getElementById('pImagesInput').value = productImages.join('\n');
  updateImagePreviews();
}

async function saveProduct() {
  const raw = document.getElementById('pImagesInput')?.value || '';
  const imgs = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const sizes = document
    .getElementById('pSizes')
    .value.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const sizeStocks = {};
  const sizeSpecs = {};
  sizes.forEach((sz, i) => {
    const q = document.getElementById(`psq-${i}`);
    const kg = document.getElementById(`pskg-${i}`);
    if (q && q.value.trim() !== '') sizeStocks[sz] = Math.max(0, Math.floor(Number(q.value) || 0));
    const w = kg && kg.value.trim();
    if (w) sizeSpecs[sz] = { weight_kg: w };
  });
  const oldPriceRaw = Number(document.getElementById('pOldPrice')?.value);
  const livePrice = Number(document.getElementById('pPrice').value);
  if (Number.isFinite(oldPriceRaw) && oldPriceRaw > livePrice) {
    sizeSpecs.__meta = { ...(sizeSpecs.__meta || {}), compare_price: oldPriceRaw };
  } else if (sizeSpecs.__meta) {
    delete sizeSpecs.__meta.compare_price;
    if (!Object.keys(sizeSpecs.__meta).length) delete sizeSpecs.__meta;
  }
  const slugInput = document.getElementById('pSlug')?.value.trim() || '';
  const slugFinal = await adminUniqueProductSlug(slugInput || document.getElementById('pName').value || 'item', editingProductId);
  const data = {
    id: editingProductId,
    name: document.getElementById('pName').value,
    slug: slugFinal,
    price: Number(document.getElementById('pPrice').value),
    stock: Number(document.getElementById('pStock').value),
    cost: Number(document.getElementById('pCost')?.value) || 0,
    visibility: document.getElementById('pVis')?.value === 'private' ? 'private' : 'public',
    category: document.getElementById('pCat').value,
    badge: document.getElementById('pBadge').value || null,
    description: document.getElementById('pDesc').value,
    sizes,
    sizeStocks,
    sizeSpecs,
    images: imgs,
    image: imgs[0] || '',
  };
  const r = await EyeApi.adminSaveProduct(data, imgs);
  if (!r.ok) {
    showToast('Save failed');
    return;
  }
  closeModal();
  renderProductsTable();
  showToast(editingProductId ? 'Product updated' : 'Product added');
}

async function renderOrdersTable(filter, tabEl) {
  if (tabEl) {
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
    tabEl.classList.add('active');
  }
  let orders = await EyeApi.fetchOrders();
  if (filter !== 'all') orders = orders.filter((o) => o.status === filter);
  _adminOrdersCache = orders;
  const users = await EyeApi.fetchUsers();
  document.getElementById('ordersTable').innerHTML = `
    <thead><tr><th></th><th>Order ID</th><th>Date</th><th>Customer</th><th>Total</th><th>Method</th><th>Fulfillment</th><th>Payment</th></tr></thead>
    <tbody>${orders
      .map((o) => {
        const u = users.find((x) => String(x.id) === String(o.userId || o.user_id));
        const oid = JSON.stringify(o.id);
        return `<tr>
        <td><button type="button" class="order-detail-icon" title="View details" aria-label="View order" onclick='openOrderDetailModal(${JSON.stringify(o.id)})'>◇</button></td>
        <td style="font-weight:500;color:var(--white)">${escapeHtml(o.id)}</td>
        <td>${formatDate(o.date || o.created_at)}</td>
        <td>${escapeHtml(u?.name || '—')}</td>
        <td style="font-family:var(--font-serif);color:var(--white)">${formatPrice(o.total)}</td>
        <td>${paymentMethodPill(o.payment_method)}</td>
        <td>
          <select class="status-select" style="font-size:10px" onchange='updateOrderRow(${oid},"status",this.value)'>
            ${['Pending', 'Processing', 'Shipped', 'Delivered', 'Returned']
              .map((s) => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`)
              .join('')}
          </select>
        </td>
        <td>
          <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-start">
            ${paymentBadge(o.payment_status)}
            <select class="status-select" style="font-size:10px" onchange='updateOrderRow(${oid},"payment_status",this.value)'>
              ${['Pending', 'Paid', 'Failed', 'Refunded']
                .map((s) => `<option ${(o.payment_status || 'Pending') === s ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </div>
        </td>
      </tr>`;
      })
      .join('')}</tbody>`;
}

function filterAdminOrders(val, btn) {
  renderOrdersTable(val, btn);
}

async function updateOrderRow(id, field, value) {
  if (field === 'status') await EyeApi.updateOrderStatus(id, value);
  else await EyeApi.updateOrderPayment(id, value, null);
  showToast('Order updated');
}

async function renderUsersTable() {
  const users = await EyeApi.fetchUsers();
  const orders = await EyeApi.fetchOrders();
  document.getElementById('usersTable').innerHTML = `
    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Orders</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${users
      .map(
        (u) => `
      <tr>
        <td style="font-weight:500;color:var(--white)">${escapeHtml(u.name)}</td>
        <td style="color:var(--gray-500)">${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-yellow' : 'badge-gray'}">${escapeHtml(u.role)}</span></td>
        <td>${orders.filter((o) => String(o.userId || o.user_id) === String(u.id)).length}</td>
        <td><span class="badge ${u.status === 'active' ? 'badge-green' : 'badge-red'}">${escapeHtml(u.status)}</span></td>
        <td><div style="display:flex;gap:6px">
          <button class="action-btn action-btn-edit" onclick='toggleUserRole(${JSON.stringify(u.id)})'>${u.role === 'admin' ? '→ Customer' : '→ Admin'}</button>
          <button class="action-btn action-btn-del" disabled title="Manage blocks in Supabase Auth">Block</button>
        </div></td>
      </tr>`
      )
      .join('')}</tbody>`;
}

async function toggleUserRole(id) {
  const users = await EyeApi.fetchUsers();
  const u = users.find((x) => String(x.id) === String(id));
  if (!u) return;
  const next = u.role === 'admin' ? 'customer' : 'admin';
  await EyeApi.adminSetUserRole(id, next);
  renderUsersTable();
  showToast('Role updated');
}

async function renderCouponsTable() {
  const coupons = await EyeApi.fetchCoupons();
  document.getElementById('couponsTable').innerHTML = `
    <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Expiry</th><th>Usage</th><th>Actions</th></tr></thead>
    <tbody>${coupons
      .map(
        (c) => `
      <tr>
        <td style="font-weight:600;letter-spacing:.1em;color:var(--gold)">${escapeHtml(c.code)}</td>
        <td><span class="badge badge-gray">${escapeHtml(c.type)}</span></td>
        <td style="color:var(--white)">${c.type === 'percent' ? c.value + '%' : 'EGP ' + c.value}</td>
        <td>${formatDate(c.expiry)}</td>
        <td>${c.uses}/${c.maxUses || c.max_uses}</td>
        <td><button class="action-btn action-btn-del" onclick='deleteCoupon(${JSON.stringify(c.id)})'>Delete</button></td>
      </tr>`
      )
      .join('')}</tbody>`;
}

async function deleteCoupon(remoteId) {
  if (!remoteId) return;
  await EyeApi.adminDeleteCoupon(remoteId);
  renderCouponsTable();
  showToast('Coupon deleted');
}

function openCouponModal() {
  document.getElementById('modalTitle').textContent = 'Create Coupon';
  document.getElementById('modalBody').innerHTML = `
    <div class="admin-form">
      <div class="form-field"><label class="form-label">Coupon Code</label><input class="form-input" id="cCode" placeholder="SUMMER20" style="text-transform:uppercase" /></div>
      <div class="form-field"><label class="form-label">Type</label><select class="form-select" id="cType"><option value="percent">Percentage</option><option value="fixed">Fixed Amount</option></select></div>
      <div class="form-field"><label class="form-label">Value</label><input class="form-input" id="cVal" type="number" placeholder="20" /></div>
      <div class="form-field"><label class="form-label">Max Uses</label><input class="form-input" id="cMax" type="number" placeholder="100" /></div>
      <div class="form-field full"><label class="form-label">Expiry Date</label><input class="form-input" id="cExpiry" type="date" /></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-gold" onclick="saveCoupon()">Create Coupon</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function saveCoupon() {
  const row = {
    code: document.getElementById('cCode').value.toUpperCase(),
    type: document.getElementById('cType').value,
    value: Number(document.getElementById('cVal').value),
    expiry: document.getElementById('cExpiry').value,
    uses: 0,
    maxUses: Number(document.getElementById('cMax').value),
  };
  await EyeApi.adminSaveCoupon(row);
  closeModal();
  renderCouponsTable();
  showToast('Coupon created');
}

async function initAccounting() {
  const orders = await EyeApi.fetchOrders();
  const expenses = await EyeApi.fetchExpenses();
  const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('accountingStats').innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Total Revenue</div><div class="stat-card-value">${formatPrice(revenue)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Total Expenses</div><div class="stat-card-value" style="color:#E05C6A">${formatPrice(totalExp)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Net Profit</div><div class="stat-card-value" style="color:var(--gold)">${formatPrice(revenue - totalExp)}</div></div>`;
  const { labels, vals } = revenueByMonth(orders);
  const maxV = Math.max(...vals, 1);
  document.getElementById('revenueChart2').innerHTML = `<div class="chart-bars">${labels
    .map(
      (m, i) => `<div class="chart-bar-wrap"><div class="chart-bar-val">${vals[i] >= 1000 ? (vals[i] / 1000).toFixed(1) + 'K' : Math.round(vals[i])}</div><div class="chart-bar" style="height:${(vals[i] / maxV) * 100}%"></div><div class="chart-bar-label">${m}</div></div>`
    )
    .join('')}</div>`;
  const cats = {};
  expenses.forEach((e) => {
    cats[e.category] = (cats[e.category] || 0) + e.amount;
  });
  const catMax = Math.max(...Object.values(cats), 1);
  document.getElementById('expenseChart').innerHTML = `<div class="chart-bars">${Object.entries(cats)
    .map(
      ([c, v]) =>
        `<div class="chart-bar-wrap"><div class="chart-bar-val" style="font-size:10px">${formatPrice(v)}</div><div class="chart-bar" style="height:${(v / catMax) * 100}%;background:#E05C6A"></div><div class="chart-bar-label">${escapeHtml(c)}</div></div>`
    )
    .join('')}</div>`;
  document.getElementById('expensesTable').innerHTML = `<thead><tr><th>Category</th><th>Description</th><th>Amount</th><th>Date</th><th></th></tr></thead><tbody>${expenses
    .map(
      (e) =>
        `<tr><td><span class="badge badge-gray">${escapeHtml(e.category)}</span></td><td style="color:var(--white)">${escapeHtml(e.label)}</td><td style="color:#E05C6A">${formatPrice(e.amount)}</td><td>${formatDate(e.date)}</td><td><button class="action-btn action-btn-del" onclick='deleteExpense(${JSON.stringify(e.id)})'>×</button></td></tr>`
    )
    .join('')}</tbody>`;
}

async function deleteExpense(id) {
  if (!id) return;
  await EyeApi.adminDeleteExpense(id);
  initAccounting();
  showToast('Expense deleted');
}

function openExpenseModal() {
  document.getElementById('modalTitle').textContent = 'Add Expense';
  document.getElementById('modalBody').innerHTML = `
    <div class="admin-form">
      <div class="form-field"><label class="form-label">Category</label><select class="form-select" id="ecat"><option>ads</option><option>production</option><option>shipping</option><option>other</option></select></div>
      <div class="form-field"><label class="form-label">Amount (EGP)</label><input class="form-input" id="eamt" type="number" placeholder="0" /></div>
      <div class="form-field full"><label class="form-label">Description</label><input class="form-input" id="elbl" placeholder="Expense description" /></div>
      <div class="form-field full"><label class="form-label">Date</label><input class="form-input" id="edate" type="date" value="${new Date().toISOString().split('T')[0]}" /></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-gold" onclick="saveExpense()">Add Expense</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function saveExpense() {
  const row = {
    category: document.getElementById('ecat').value,
    label: document.getElementById('elbl').value,
    amount: Number(document.getElementById('eamt').value),
    date: document.getElementById('edate').value,
  };
  await EyeApi.adminSaveExpense(row);
  closeModal();
  initAccounting();
  showToast('Expense added');
}

async function renderAnnouncementsAdmin() {
  const rows = await EyeApi.fetchAnnouncementsAdmin();
  const el = document.getElementById('announcementsAdminTable');
  if (!el) return;
  el.innerHTML = `<table><thead><tr><th>Order</th><th>Message</th><th>Link</th><th>Active</th><th></th></tr></thead><tbody>${rows
    .map(
      (r) => `<tr>
    <td>${r.sort_order}</td>
    <td>${escapeHtml(r.message)}</td>
    <td style="font-size:11px">${escapeHtml(r.link_url || '')}</td>
    <td>${r.is_active ? 'yes' : 'no'}</td>
    <td><button class="action-btn action-btn-edit" onclick='openAnnouncementModal(${JSON.stringify(r.id)})'>Edit</button>
    <button class="action-btn action-btn-del" onclick='deleteAnnouncementRow(${JSON.stringify(r.id)})'>Del</button></td>
  </tr>`
    )
    .join('')}</tbody></table>`;
}

async function openAnnouncementModal(id) {
  const rows = await EyeApi.fetchAnnouncementsAdmin();
  const r = id ? rows.find((x) => String(x.id) === String(id)) : null;
  document.getElementById('modalTitle').textContent = r ? 'Edit announcement' : 'Add announcement';
  document.getElementById('modalBody').innerHTML = `
    <div class="admin-form">
      <div class="form-field full"><label class="form-label">Message</label><textarea class="form-textarea" id="anMsg">${escapeHtml(r?.message || '')}</textarea></div>
      <div class="form-field full"><label class="form-label">Link URL (optional)</label><input class="form-input" id="anLink" value="${escapeHtml(r?.link_url || '')}" /></div>
      <div class="form-field"><label class="form-label">Sort order</label><input class="form-input" id="anSort" type="number" value="${r?.sort_order ?? 0}" /></div>
      <div class="form-field"><label class="form-label">Active</label><select class="form-select" id="anActive"><option value="true" ${r?.is_active !== false ? 'selected' : ''}>Yes</option><option value="false" ${r?.is_active === false ? 'selected' : ''}>No</option></select></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-gold" onclick="saveAnnouncementFromModal(${r ? JSON.stringify(r.id) : 'null'})">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function saveAnnouncementFromModal(existingId) {
  const row = {
    id: existingId && existingId !== 'null' ? existingId : undefined,
    message: document.getElementById('anMsg').value.trim(),
    link_url: document.getElementById('anLink').value.trim() || null,
    sort_order: Number(document.getElementById('anSort').value) || 0,
    is_active: document.getElementById('anActive').value === 'true',
  };
  const r = await EyeApi.adminUpsertAnnouncement(row);
  if (!r.ok) {
    showToast('Save failed');
    return;
  }
  closeModal();
  await renderAnnouncementsAdmin();
  showToast('Saved');
}

async function deleteAnnouncementRow(id) {
  if (!confirm('Delete?')) return;
  await EyeApi.adminDeleteAnnouncement(id);
  await renderAnnouncementsAdmin();
}

async function renderNavAdmin() {
  const rows = await EyeApi.fetchNavigationLinks();
  const el = document.getElementById('navLinksAdminTable');
  if (!el) return;
  el.innerHTML = `<table><thead><tr><th>Zone</th><th>Label</th><th>Href</th><th>Sort</th><th></th></tr></thead><tbody>${rows
    .map(
      (r) => `<tr>
    <td>${escapeHtml(r.zone)}</td>
    <td>${escapeHtml(r.label)}</td>
    <td style="font-size:11px">${escapeHtml(r.href)}</td>
    <td>${r.sort_order}</td>
    <td><button class="action-btn action-btn-edit" onclick='openNavModal(${JSON.stringify(r.id)})'>Edit</button>
    <button class="action-btn action-btn-del" onclick='deleteNavRow(${JSON.stringify(r.id)})'>Del</button></td>
  </tr>`
    )
    .join('')}</tbody></table>`;
}

async function openNavModal(id) {
  const rows = await EyeApi.fetchNavigationLinks();
  const r = id ? rows.find((x) => String(x.id) === String(id)) : null;
  document.getElementById('modalTitle').textContent = r ? 'Edit nav link' : 'Add nav link';
  document.getElementById('modalBody').innerHTML = `
    <div class="admin-form">
      <div class="form-field"><label class="form-label">Zone</label><input class="form-input" id="nvZone" value="${escapeHtml(r?.zone || 'primary_nav')}" placeholder="primary_nav, footer_shop, ..." /></div>
      <div class="form-field"><label class="form-label">Label</label><input class="form-input" id="nvLabel" value="${escapeHtml(r?.label || '')}" /></div>
      <div class="form-field full"><label class="form-label">Href</label><input class="form-input" id="nvHref" value="${escapeHtml(r?.href || '')}" /></div>
      <div class="form-field"><label class="form-label">Sort</label><input class="form-input" id="nvSort" type="number" value="${r?.sort_order ?? 0}" /></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-gold" onclick="saveNavModal(${r ? JSON.stringify(r.id) : 'null'})">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function saveNavModal(existingId) {
  const row = {
    id: existingId && existingId !== 'null' ? existingId : undefined,
    zone: document.getElementById('nvZone').value.trim(),
    label: document.getElementById('nvLabel').value.trim(),
    href: document.getElementById('nvHref').value.trim(),
    sort_order: Number(document.getElementById('nvSort').value) || 0,
  };
  const r = await EyeApi.adminUpsertNavigationLink(row);
  if (!r.ok) {
    showToast('Save failed');
    return;
  }
  closeModal();
  await renderNavAdmin();
  showToast('Saved');
}

async function deleteNavRow(id) {
  if (!confirm('Delete?')) return;
  await EyeApi.adminDeleteNavigationLink(id);
  await renderNavAdmin();
}

async function renderCategoriesAdmin() {
  const cats = await EyeApi.fetchCategories();
  const el = document.getElementById('categoriesAdminTable');
  if (!el) return;
  el.innerHTML = `<table><thead><tr><th>ID</th><th>Name</th><th>Visibility</th><th>Sort</th><th>Image</th><th></th></tr></thead><tbody>${cats
    .map(
      (c) => `<tr>
    <td>${escapeHtml(c.id)}</td>
    <td>${escapeHtml(c.name)}</td>
    <td><span class="badge ${c.visibility === 'private' ? 'badge-yellow' : 'badge-green'}">${escapeHtml(c.visibility === 'private' ? 'Private' : 'Public')}</span></td>
    <td>${c.sort_order}</td>
    <td style="font-size:10px;max-width:180px;overflow:hidden">${escapeHtml(c.image_url || '')}</td>
    <td><button class="action-btn action-btn-edit" onclick='openCategoryModal(${JSON.stringify(c.id)})'>Edit</button></td>
  </tr>`
    )
    .join('')}</tbody></table>`;
}

async function openCategoryModal(cid) {
  const cats = await EyeApi.fetchCategories();
  const c = cid ? cats.find((x) => String(x.id) === String(cid)) : null;
  document.getElementById('modalTitle').textContent = c ? 'Edit category' : 'Add category';
  document.getElementById('modalBody').innerHTML = `
    <div class="admin-form">
      <div class="form-field"><label class="form-label">ID (slug)</label><input class="form-input" id="catId" value="${escapeHtml(c?.id || '')}" ${c ? 'readonly' : ''} /></div>
      <div class="form-field"><label class="form-label">Name</label><input class="form-input" id="catName" value="${escapeHtml(c?.name || '')}" /></div>
      <div class="form-field"><label class="form-label">Sort</label><input class="form-input" id="catSort" type="number" value="${c?.sort_order ?? 0}" /></div>
      <div class="form-field full"><label class="form-label">Image URL</label><input class="form-input" id="catImg" value="${escapeHtml(c?.image_url || '')}" /></div>
      <div class="form-field full">
        <label class="form-label">Upload category image</label>
        <input class="form-input" type="file" id="catImgFile" accept="image/*" onchange="handleCategoryImageUpload(event)" />
        <p style="font-size:11px;color:var(--gray-500);margin-top:6px;line-height:1.5">Upload image then save category.</p>
      </div>
      <div class="form-field full"><label class="form-label">Excerpt</label><input class="form-input" id="catEx" value="${escapeHtml(c?.excerpt || '')}" /></div>
      <div class="form-field full">
        <label class="form-label">Visibility</label>
        <select class="form-select" id="catVis">
          <option value="public" ${c?.visibility !== 'private' ? 'selected' : ''}>Public (shown on site)</option>
          <option value="private" ${c?.visibility === 'private' ? 'selected' : ''}>Private (hidden from customers)</option>
        </select>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-gold" onclick="saveCategoryModal()">Save</button>
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
    </div>`;
  document.getElementById('modalOverlay').classList.add('open');
}

async function handleCategoryImageUpload(ev) {
  const input = ev?.target;
  const file = input?.files && input.files[0];
  if (!file) return;
  const r = await EyeApi.uploadSiteImageBlob(file, file.type || 'image/jpeg');
  if (!r.ok) {
    showToast(r.error || 'Upload failed');
    return;
  }
  const img = document.getElementById('catImg');
  if (img) img.value = r.url;
  showToast('Image uploaded');
  input.value = '';
}

async function saveCategoryModal() {
  const row = {
    id: document.getElementById('catId').value.trim(),
    name: document.getElementById('catName').value.trim(),
    sort_order: Number(document.getElementById('catSort').value) || 0,
    image_url: document.getElementById('catImg').value.trim() || null,
    excerpt: document.getElementById('catEx').value.trim() || null,
    visibility: document.getElementById('catVis')?.value === 'private' ? 'private' : 'public',
  };
  const r = await EyeApi.adminUpsertCategory(row);
  if (!r.ok) {
    showToast('Save failed');
    return;
  }
  closeModal();
  await renderCategoriesAdmin();
  showToast('Category saved');
}

function linesFromTextarea(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  return String(el.value || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fillImageLinesFromHomepage(hp) {
  const h = hp && typeof hp === 'object' ? hp : {};
  const heroUrls =
    Array.isArray(h.hero?.imageUrls) && h.hero.imageUrls.length
      ? h.hero.imageUrls
      : h.hero?.imageUrl
        ? [h.hero.imageUrl]
        : [];
  const shopUrls =
    Array.isArray(h.shop?.heroImageUrls) && h.shop.heroImageUrls.length
      ? h.shop.heroImageUrls
      : h.shop?.heroImageUrl
        ? [h.shop.heroImageUrl]
        : [];
  const splitUrls =
    Array.isArray(h.split?.imageUrls) && h.split.imageUrls.length
      ? h.split.imageUrls
      : h.split?.imageUrl
        ? [h.split.imageUrl]
        : [];
  const a = document.getElementById('heroImageUrlsLines');
  const b = document.getElementById('shopHeroImageUrlsLines');
  const c = document.getElementById('splitImageUrlsLines');
  if (a) a.value = heroUrls.join('\n');
  if (b) b.value = shopUrls.join('\n');
  if (c) c.value = splitUrls.join('\n');
}

function mergeHomepageImageListsIntoJson() {
  const ta = document.getElementById('homepageJson');
  if (!ta) return false;
  let hp;
  try {
    hp = JSON.parse(ta.value || '{}');
  } catch {
    showToast('Invalid JSON in homepage field');
    return false;
  }
  const heroLines = linesFromTextarea('heroImageUrlsLines');
  const shopLines = linesFromTextarea('shopHeroImageUrlsLines');
  const splitLines = linesFromTextarea('splitImageUrlsLines');
  if (heroLines.length) {
    hp.hero = hp.hero || {};
    hp.hero.imageUrls = heroLines;
    hp.hero.imageUrl = heroLines[0];
  }
  if (shopLines.length) {
    hp.shop = hp.shop || {};
    hp.shop.heroImageUrls = shopLines;
    hp.shop.heroImageUrl = shopLines[0];
  }
  if (splitLines.length) {
    hp.split = hp.split || {};
    hp.split.imageUrls = splitLines;
    hp.split.imageUrl = splitLines[0];
  }
  ta.value = JSON.stringify(hp, null, 2);
  showToast('JSON updated from image lists');
  return true;
}

async function initContactAdmin() {
  const cpRaw = await EyeApi.getSiteSetting('contact_page');
  const cp = document.getElementById('contactPageJson');
  if (cp) {
    try {
      cp.value = JSON.stringify(JSON.parse(cpRaw || '{}'), null, 2);
    } catch {
      cp.value = cpRaw || '';
    }
  }
  const rows = await EyeApi.fetchContactMessages();
  const mnt = document.getElementById('contactMessagesTable');
  if (mnt) {
    mnt.innerHTML = rows.length
      ? `<table><thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Message</th></tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr><td>${formatDate(r.created_at)}</td><td style="color:var(--white)">${escapeHtml(r.name || '—')}</td><td>${escapeHtml(
                r.email || '—'
              )}</td><td style="max-width:420px;white-space:normal;line-height:1.6">${escapeHtml(r.message || '')}</td></tr>`
          )
          .join('')}</tbody></table>`
      : '<p style="color:var(--gray-500);font-size:12px">No messages yet. (Requires `contact_messages` table in Supabase.)</p>';
  }
}

function revenueRollingDays(orders, n) {
  const now = new Date();
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  const map = Object.fromEntries(keys.map((k) => [k, 0]));
  (orders || []).forEach((o) => {
    const raw = o.date || o.created_at;
    if (!raw) return;
    const k = new Date(raw).toISOString().slice(0, 10);
    if (map[k] !== undefined) map[k] += Number(o.total) || 0;
  });
  const vals = keys.map((k) => map[k]);
  const labels = keys.map((k, i) => (i % 7 === 0 || i === keys.length - 1 ? k.slice(8) + '/' + k.slice(5, 7) : ''));
  return { vals, labels, keys };
}

function orderStatusCounts(orders) {
  const m = {};
  (orders || []).forEach((o) => {
    const s = o.status || 'Unknown';
    m[s] = (m[s] || 0) + 1;
  });
  return m;
}

function paymentMethodCounts(orders) {
  const m = {};
  (orders || []).forEach((o) => {
    const p = o.payment_method || '—';
    m[p] = (m[p] || 0) + 1;
  });
  return m;
}

function topSellingByRevenue(orders, limit) {
  const acc = {};
  (orders || []).forEach((o) => {
    (o.items || []).forEach((it) => {
      const name = it.name || String(it.productId || 'Item');
      acc[name] = (acc[name] || 0) + Number(it.qty || 0) * Number(it.price || 0);
    });
  });
  return Object.entries(acc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

async function initAnalytics() {
  const orders = await EyeApi.fetchOrders();
  const now = new Date();
  const ms30 = 30 * 86400000;
  const orders30 = orders.filter((o) => {
    const raw = o.date || o.created_at;
    if (!raw) return false;
    return now - new Date(raw) <= ms30;
  });
  const rev30 = orders30.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const revAll = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avgOrder = orders.length ? revAll / orders.length : 0;

  const statsEl = document.getElementById('analyticsStats');
  if (statsEl) {
    statsEl.innerHTML = `
    <div class="stat-card"><div class="stat-card-label">Revenue (30 days)</div><div class="stat-card-value">${formatPrice(rev30)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Orders (30 days)</div><div class="stat-card-value">${orders30.length}</div></div>
    <div class="stat-card"><div class="stat-card-label">All-time revenue</div><div class="stat-card-value">${formatPrice(revAll)}</div></div>
    <div class="stat-card"><div class="stat-card-label">Avg. order value</div><div class="stat-card-value">${formatPrice(avgOrder)}</div></div>`;
  }

  const { vals, labels } = revenueRollingDays(orders, 30);
  const maxV = Math.max(...vals, 1);
  const chart30 = document.getElementById('analyticsRevenue30');
  if (chart30) {
    chart30.innerHTML = `<div class="chart-bars chart-bars-wide">${vals
      .map(
        (v, i) =>
          `<div class="chart-bar-wrap"><div class="chart-bar-val">${v >= 1000 ? (v / 1000).toFixed(1) + 'K' : Math.round(v)}</div><div class="chart-bar" style="height:${(v / maxV) * 100}%"></div><div class="chart-bar-label">${labels[i] || '·'}</div></div>`
      )
      .join('')}</div>`;
  }

  const st = orderStatusCounts(orders);
  const stVals = Object.values(st);
  const stMax = Math.max(1, ...stVals, 0);
  const stEl = document.getElementById('analyticsStatusChart');
  if (stEl) {
    stEl.innerHTML = Object.keys(st).length
      ? `<div class="chart-bars">${Object.entries(st)
          .map(
            ([k, v]) =>
              `<div class="chart-bar-wrap"><div class="chart-bar-val">${v}</div><div class="chart-bar" style="height:${(v / stMax) * 100}%;background:linear-gradient(180deg,var(--gold),#6a5a32)"></div><div class="chart-bar-label">${escapeHtml(k)}</div></div>`
          )
          .join('')}</div>`
      : '<p style="padding:24px;color:var(--gray-500);font-size:13px">No orders yet.</p>';
  }

  const pm = paymentMethodCounts(orders);
  const pmVals = Object.values(pm);
  const pmMax = Math.max(1, ...pmVals, 0);
  const pmEl = document.getElementById('analyticsPaymentChart');
  if (pmEl) {
    pmEl.innerHTML = Object.keys(pm).length
      ? `<div class="chart-bars">${Object.entries(pm)
          .map(
            ([k, v]) =>
              `<div class="chart-bar-wrap"><div class="chart-bar-val">${v}</div><div class="chart-bar" style="height:${(v / pmMax) * 100}%;background:#4a6fa5"></div><div class="chart-bar-label" style="font-size:8px">${escapeHtml(k)}</div></div>`
          )
          .join('')}</div>`
      : '<p style="padding:24px;color:var(--gray-500);font-size:13px">No payment data yet.</p>';
  }

  const top = topSellingByRevenue(orders, 12);
  const tpEl = document.getElementById('analyticsTopProducts');
  if (tpEl) {
    tpEl.innerHTML = `<thead><tr><th>Product</th><th>Revenue (est.)</th></tr></thead><tbody>${top
      .map(
        ([name, amt]) =>
          `<tr><td style="color:var(--white);font-size:13px">${escapeHtml(name)}</td><td style="font-family:var(--font-serif)">${formatPrice(amt)}</td></tr>`
      )
      .join('')}</tbody>`;
    if (!top.length) tpEl.innerHTML = '<tbody><tr><td colspan="2" style="color:var(--gray-500);padding:16px">No line items on orders yet.</td></tr></tbody>';
  }
}

async function siteImageUpload(ev, which) {
  const files = ev.target.files;
  if (!files?.length) return;
  const taId =
    which === 'hero' ? 'heroImageUrlsLines' : which === 'shop' ? 'shopHeroImageUrlsLines' : 'splitImageUrlsLines';
  const ta = document.getElementById(taId);
  if (!ta) return;
  for (const f of files) {
    const r = await EyeApi.uploadSiteImageBlob(f, f.type);
    if (!r.ok) {
      showToast(r.error || 'Upload failed');
      continue;
    }
    ta.value = ta.value.trim() ? `${ta.value.trim()}\n${r.url}` : r.url;
  }
  ev.target.value = '';
  showToast('Uploaded — URLs added to the list');
}

async function mergeHomepageImageListsAndSave() {
  if (!mergeHomepageImageListsIntoJson()) return;
  const ta = document.getElementById('homepageJson');
  const r = await EyeApi.adminSetSiteSetting('homepage', ta.value);
  if (!r.ok) showToast('Save failed');
  else showToast('Homepage images saved');
}

async function initSettings() {
  const hpRaw = await EyeApi.getSiteSetting('homepage');
  const ta = document.getElementById('homepageJson');
  if (ta) {
    try {
      const hp = JSON.parse(hpRaw || '{}');
      ta.value = JSON.stringify(hp, null, 2);
      fillImageLinesFromHomepage(hp);
    } catch {
      ta.value = hpRaw || '';
    }
  }
  const lrRaw = await EyeApi.getSiteSetting('legal_returns');
  const lr = document.getElementById('legalReturnsJson');
  if (lr) {
    try {
      const legalObj = JSON.parse(lrRaw || '{}');
      lr.value = JSON.stringify(legalObj, null, 2);
      const simple = document.getElementById('legalReturnsBodySimple');
      if (simple) {
        const html = String(legalObj.bodyHtml || '');
        const text = html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<[^>]+>/g, '')
          .trim();
        simple.value = text;
      }
    } catch {
      lr.value = lrRaw || '';
    }
  }
  const ship = await EyeApi.getSiteSetting('shipping_free_threshold_egp');
  const st = document.getElementById('shipThreshold');
  if (st) st.value = ship || '2000';
  const mq = document.getElementById('marqueeText');
  if (mq) mq.value = (await EyeApi.fetchMarqueeText()) || '';
  const w = await EyeApi.fetchPaymentWallets();
  const wt = document.getElementById('walletTelda');
  const wi = document.getElementById('walletInsta');
  if (wt) wt.value = w.telda || '';
  if (wi) wi.value = w.instapay || '';
  await renderAnnouncementsAdmin();
  await renderNavAdmin();
  await renderCategoriesAdmin();
}

async function saveHomepageJson() {
  const raw = document.getElementById('homepageJson').value;
  let hp;
  try {
    hp = JSON.parse(raw);
  } catch {
    showToast('Invalid JSON');
    return;
  }
  fillImageLinesFromHomepage(hp);
  const r = await EyeApi.adminSetSiteSetting('homepage', raw);
  if (!r.ok) showToast('Save failed');
  else showToast('Homepage JSON saved');
}

async function saveContactPageJson() {
  const raw = document.getElementById('contactPageJson')?.value;
  if (raw == null) return;
  try {
    JSON.parse(raw);
  } catch {
    showToast('Invalid JSON');
    return;
  }
  const r = await EyeApi.adminSetSiteSetting('contact_page', raw);
  if (!r.ok) showToast('Save failed');
  else showToast('Contact page saved');
}

async function saveLegalReturnsJson() {
  const raw = document.getElementById('legalReturnsJson').value;
  try {
    JSON.parse(raw);
  } catch {
    showToast('Invalid JSON');
    return;
  }
  const r = await EyeApi.adminSetSiteSetting('legal_returns', raw);
  if (!r.ok) showToast('Save failed');
  else showToast('Legal JSON saved');
}

async function saveLegalReturnsBodySimple() {
  const simple = document.getElementById('legalReturnsBodySimple');
  const jsonTa = document.getElementById('legalReturnsJson');
  if (!simple || !jsonTa) return;
  let legalObj = {};
  try {
    legalObj = JSON.parse(jsonTa.value || '{}');
  } catch {
    showToast('Fix JSON first');
    return;
  }
  const lines = String(simple.value || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  legalObj.bodyHtml = lines.map((l) => `<p class="policy-text">${escapeHtml(l)}</p>`).join('');
  jsonTa.value = JSON.stringify(legalObj, null, 2);
  const r = await EyeApi.adminSetSiteSetting('legal_returns', jsonTa.value);
  if (!r.ok) showToast('Save failed');
  else showToast('Policy text saved');
}

async function saveShippingAndMarquee() {
  const ship = document.getElementById('shipThreshold').value;
  const mq = document.getElementById('marqueeText').value;
  await EyeApi.adminSetSiteSetting('shipping_free_threshold_egp', ship);
  await EyeApi.setMarqueeText(mq);
  showToast('Saved');
}

async function savePaymentWallets() {
  const telda = document.getElementById('walletTelda')?.value.trim() || '';
  const instapay = document.getElementById('walletInsta')?.value.trim() || '';
  const r = await EyeApi.adminSetSiteSetting('payment_wallets_json', JSON.stringify({ telda, instapay }));
  if (!r.ok) showToast('Save failed');
  else showToast('Payment numbers saved');
}

let __shipEditorCfg = null;

async function initShippingPage() {
  const zc = await EyeApi.fetchShippingZonesConfig();
  __shipEditorCfg = {
    defaultShippingEgp: Number(zc.defaultShippingEgp) >= 0 ? Number(zc.defaultShippingEgp) : 150,
    zones: Array.isArray(zc.zones) ? JSON.parse(JSON.stringify(zc.zones)) : [],
  };
  const ta = document.getElementById('shippingZonesJson');
  if (ta) {
    try {
      ta.value = JSON.stringify(__shipEditorCfg, null, 2);
    } catch (_) {
      ta.value = '';
    }
  }
  renderShippingVisualEditor();
}

function shipEditorAreaRow(zi, ai, a) {
  const eg =
    a.shippingEgp != null && Number(a.shippingEgp) >= 0 ? String(Number(a.shippingEgp)) : '';
  return `<tr data-azi="${zi}" data-aai="${ai}">
    <td><input class="form-input ship-a-id" value="${escapeHtml(a.id || '')}" /></td>
    <td><input class="form-input ship-a-name" value="${escapeHtml(a.name || '')}" /></td>
    <td><input class="form-input ship-a-egp" type="number" step="1" value="${escapeHtml(eg)}" placeholder="zone" /></td>
    <td><button type="button" class="action-btn action-btn-del" onclick="shippingEditorRemoveArea(${zi},${ai})">×</button></td>
  </tr>`;
}

function shipEditorZoneHtml(zone, zi) {
  const areas = Array.isArray(zone.areas) ? zone.areas : [];
  const zeg = zone.shippingEgp != null && Number(zone.shippingEgp) >= 0 ? String(Number(zone.shippingEgp)) : '';
  return `<div class="ship-editor-zone" data-zidx="${zi}">
    <div class="ship-editor-zone-head">
      <div class="ship-editor-zone-fields">
        <div class="form-field" style="margin:0"><label class="form-label">Governorate ID</label><input class="form-input ship-z-id" value="${escapeHtml(zone.id || '')}" placeholder="cairo" /></div>
        <div class="form-field" style="margin:0"><label class="form-label">Name</label><input class="form-input ship-z-name" value="${escapeHtml(zone.name || '')}" placeholder="Cairo" /></div>
        <div class="form-field" style="margin:0"><label class="form-label">Zone EGP</label><input class="form-input ship-z-egp" type="number" step="1" value="${escapeHtml(zeg)}" placeholder="60" /></div>
      </div>
      <button type="button" class="btn btn-outline ship-editor-remove-zone" onclick="shippingEditorRemoveZone(${zi})">Remove zone</button>
    </div>
    <table class="ship-editor-area-table">
      <thead><tr><th>City / area ID</th><th>Name</th><th>Shipping EGP</th><th></th></tr></thead>
      <tbody>${areas.length ? areas.map((a, ai) => shipEditorAreaRow(zi, ai, a)).join('') : ''}</tbody>
    </table>
    <button type="button" class="btn btn-gold ship-editor-add-area" onclick="shippingEditorAddArea(${zi})">+ Add city / area</button>
  </div>`;
}

function renderShippingVisualEditor() {
  const el = document.getElementById('shippingEditorMount');
  if (!el || !__shipEditorCfg) return;
  const z = __shipEditorCfg.zones || [];
  el.innerHTML = `
    <div class="form-field" style="max-width:260px">
      <label class="form-label">Default shipping EGP (cart preview &amp; fallback)</label>
      <input type="number" class="form-input" id="shipEdDef" value="${Number(__shipEditorCfg.defaultShippingEgp) || 150}" />
    </div>
    <p style="font-size:11px;color:var(--gray-500);margin:12px 0 20px;line-height:1.55">Use <strong>Zone EGP</strong> as the default for that governorate. Optional <strong>Area shipping EGP</strong> overrides the zone price when the customer selects that city.</p>
    <div id="shipZonesWrap">${z.map((zone, zi) => shipEditorZoneHtml(zone, zi)).join('')}</div>
    <button type="button" class="btn btn-outline" style="margin-top:16px" onclick="shippingEditorAddZone()">+ Add governorate</button>`;
}

function shippingEditorSyncCfgFromDom() {
  const defEl = document.getElementById('shipEdDef');
  const def = defEl ? Number(defEl.value) : 150;
  __shipEditorCfg.defaultShippingEgp = Number.isFinite(def) && def >= 0 ? def : 150;
  const zones = [];
  document.querySelectorAll('.ship-editor-zone').forEach((zEl) => {
    const id = zEl.querySelector('.ship-z-id')?.value.trim() || '';
    const name = zEl.querySelector('.ship-z-name')?.value.trim() || id;
    const zegp = Number(zEl.querySelector('.ship-z-egp')?.value);
    const areas = [];
    zEl.querySelectorAll('tbody tr').forEach((tr) => {
      const aid = tr.querySelector('.ship-a-id')?.value.trim() || '';
      const an = tr.querySelector('.ship-a-name')?.value.trim() || aid;
      const aegpRaw = tr.querySelector('.ship-a-egp')?.value.trim();
      const aegp = aegpRaw !== '' && Number(aegpRaw) >= 0 ? Number(aegpRaw) : undefined;
      const row = { id: aid, name: an };
      if (aegp != null) row.shippingEgp = aegp;
      if (aid) areas.push(row);
    });
    if (id) {
      const z = { id, name, areas: areas.length ? areas : [{ id: `${id}-1`, name: 'Area' }] };
      if (Number.isFinite(zegp) && zegp >= 0) z.shippingEgp = zegp;
      zones.push(z);
    }
  });
  __shipEditorCfg.zones = zones;
}

function shippingEditorAddZone() {
  shippingEditorSyncCfgFromDom();
  __shipEditorCfg.zones.push({
    id: 'zone-' + Date.now().toString(36),
    name: 'New governorate',
    shippingEgp: 60,
    areas: [{ id: 'a1', name: 'City', shippingEgp: 60 }],
  });
  renderShippingVisualEditor();
}

function shippingEditorRemoveZone(zi) {
  shippingEditorSyncCfgFromDom();
  __shipEditorCfg.zones.splice(zi, 1);
  renderShippingVisualEditor();
}

function shippingEditorAddArea(zi) {
  shippingEditorSyncCfgFromDom();
  if (!__shipEditorCfg.zones[zi]) return;
  if (!Array.isArray(__shipEditorCfg.zones[zi].areas)) __shipEditorCfg.zones[zi].areas = [];
  __shipEditorCfg.zones[zi].areas.push({ id: 'area-' + Date.now().toString(36), name: 'New area' });
  renderShippingVisualEditor();
}

function shippingEditorRemoveArea(zi, ai) {
  shippingEditorSyncCfgFromDom();
  if (__shipEditorCfg.zones[zi] && __shipEditorCfg.zones[zi].areas) __shipEditorCfg.zones[zi].areas.splice(ai, 1);
  renderShippingVisualEditor();
}

async function saveShippingFromEditor() {
  shippingEditorSyncCfgFromDom();
  const payload = { defaultShippingEgp: __shipEditorCfg.defaultShippingEgp, zones: __shipEditorCfg.zones };
  const ta = document.getElementById('shippingZonesJson');
  if (ta) {
    try {
      ta.value = JSON.stringify(payload, null, 2);
    } catch (_) {}
  }
  const r = await EyeApi.adminSetSiteSetting('shipping_zones_json', JSON.stringify(payload));
  if (!r.ok) showToast('Save failed');
  else showToast('Shipping rates saved');
}

async function saveShippingZonesJson() {
  const raw = document.getElementById('shippingZonesJson')?.value || '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    showToast('Invalid JSON');
    return;
  }
  if (!parsed || typeof parsed !== 'object') {
    showToast('Invalid structure');
    return;
  }
  const r = await EyeApi.adminSetSiteSetting('shipping_zones_json', JSON.stringify(parsed));
  if (!r.ok) showToast('Save failed');
  else {
    showToast('Shipping zones saved');
    __shipEditorCfg = {
      defaultShippingEgp: Number(parsed.defaultShippingEgp) >= 0 ? Number(parsed.defaultShippingEgp) : 150,
      zones: Array.isArray(parsed.zones) ? parsed.zones : [],
    };
    if (document.getElementById('shippingEditorMount')) renderShippingVisualEditor();
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
}

function showAdminGate(bodyHtml) {
  const card = document.querySelector('#adminLogin .login-card');
  if (card) {
    card.innerHTML =
      '<div class="login-logo">eye</div><div class="login-sub">Admin Dashboard</div>' + bodyHtml;
  }
  document.getElementById('adminLogin').style.display = 'flex';
  document.getElementById('adminWrap').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await EyeApi.init();
    if (!EyeApi.isRemote()) {
      showAdminGate(
        '<p style="color:var(--gray-500);line-height:1.6">Configure <code style="color:var(--gold)">js/config.js</code> with your Supabase URL and anon key.</p>'
      );
      return;
    }

    let { data } = await EyeApi.client.auth.getSession();
    if (!data.session) {
      const { data: ref } = await EyeApi.client.auth.refreshSession();
      if (ref.session) data = ref;
    }
    if (!data.session) {
      return;
    }

    const uid = data.session.user.id;
    const prof = await EyeApi.fetchMyProfile();
    if (!prof) {
      showAdminGate(
        '<p style="color:var(--gray-500);line-height:1.6;margin-bottom:20px">You are signed in, but no <strong>profiles</strong> row was found. Run the project SQL (trigger <code>handle_new_user</code>) or insert a profile for your user id in Supabase.</p>' +
          '<a class="btn btn-gold" href="profile.html" style="display:block;text-align:center;width:100%;padding:16px;text-decoration:none">Back to profile</a>'
      );
      return;
    }
    const isAdm = await EyeApi.isAdminUid(uid);
    if (!isAdm) {
      showAdminGate(
        '<p style="color:var(--gray-500);line-height:1.6;margin-bottom:16px">This session is not treated as admin. The row in <strong>public.profiles</strong> for <em>this exact user id</em> must have <code style="color:var(--gold)">role</code> set to <code style="color:var(--gold)">admin</code> (same project as <code>js/config.js</code>).</p>' +
          '<p style="color:var(--gray-500);font-size:12px;margin-bottom:20px;word-break:break-all">Signed-in user id:<br><code style="color:var(--gold)">' +
          escapeHtml(uid) +
          '</code></p>' +
          '<p style="color:var(--gray-500);font-size:12px;margin-bottom:20px">SQL example: <code style="color:var(--gold)">update public.profiles set role = \'admin\' where id = \'…\';</code> then hard-refresh this page.</p>' +
          '<a class="btn btn-gold" href="login.html?return=admin.html" style="display:block;text-align:center;width:100%;padding:16px;text-decoration:none;margin-bottom:12px">Switch account</a>' +
          '<a href="profile.html" style="display:block;text-align:center;color:var(--gray-500);font-size:13px">Profile</a>'
      );
      return;
    }

    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminWrap').style.display = 'flex';
    initDashboard();
    renderProductsTable();
  } finally {
    initLoader();
  }
});
