let __ordersProducts = [];
let currentFilter = 'all';

const TRACK_STEPS = ['Pending', 'Processing', 'Shipped', 'Delivered'];

function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

document.addEventListener('DOMContentLoaded', async () => {
  const ok = await mountStandardShell('');
  initLoader();
  if (!ok) return;

  const { data } = await EyeApi.client.auth.getSession();
  if (!data.session) {
    location.href = 'login.html?return=orders.html';
    return;
  }

  __ordersProducts = await EyeApi.fetchProducts();
  renderOrders();
});

function getStepIndex(status) {
  const i = TRACK_STEPS.indexOf(status);
  return i === -1 ? 0 : i;
}

function renderTracker(status) {
  const current = getStepIndex(status);
  if (status === 'Returned') {
    return `<div style="padding:12px 0;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#e8a0a0">⟳ Return in progress</div>`;
  }
  let html = '<div class="track-dots">';
  TRACK_STEPS.forEach((step, i) => {
    const done = i < current;
    const active = i === current;
    if (i > 0) html += `<div class="track-line ${done ? 'done' : ''}"></div>`;
    html += `<div class="track-step">
      <div class="track-dot ${active ? 'active' : done ? 'done' : ''}"></div>
      <div class="track-label ${active ? 'active' : ''}">${escapeHtml(step)}</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

function filterOrders(status, btn) {
  currentFilter = status;
  document.querySelectorAll('.status-filter').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrders();
}

async function renderOrders() {
  const session = await EyeApi.getSessionUser();
  if (!session) {
    location.href = 'login.html?return=orders.html';
    return;
  }
  let orders = (await EyeApi.fetchOrders()).reverse();
  if (currentFilter !== 'all') orders = orders.filter((o) => o.status === currentFilter);
  document.getElementById('ordersMeta').textContent = `${orders.length} order${orders.length !== 1 ? 's' : ''}`;

  if (!orders.length) {
    document.getElementById('ordersList').innerHTML = `<div class="empty-state"><p>No orders found</p><a href="shop.html" class="btn btn-primary">Start Shopping</a></div>`;
    return;
  }

  document.getElementById('ordersList').innerHTML = orders
    .map(
      (o, idx) => `
      <div class="order-card" style="animation-delay:${idx * 0.08}s">
        <div class="order-card-header" onclick='toggleOrder(${JSON.stringify(o.id)})'>
          <div>
            <div class="order-num">${escapeHtml(o.id)}</div>
            <div class="order-date-text">${formatDate(o.date)} · ${o.items.length} item${o.items.length !== 1 ? 's' : ''}</div>
            <div style="font-size:10px;letter-spacing:.12em;color:var(--gray-500);margin-top:6px">
              ${escapeHtml(o.payment_method || '—')} · ${escapeHtml(o.payment_status || '—')}
            </div>
          </div>
          <span class="order-status status-${escapeHtml(o.status)}">${escapeHtml(o.status)}</span>
          <div class="order-total-text">${formatPrice(o.total)}</div>
          <button type="button" class="order-expand-btn" id="expand-${safeId(o.id)}">﹀</button>
        </div>
        <div class="order-card-body" id="body-${safeId(o.id)}">
          ${renderTracker(o.status)}
          <div class="order-items-list">
            ${o.items
              .map((item) => {
                const prod = __ordersProducts.find((p) => String(p.id) === String(item.productId));
                return `
                <div class="order-item-row">
                  <img class="order-item-img" src="${escapeHtml(prod?.image || '')}" alt="" />
                  <div class="order-item-info">
                    <div class="order-item-name">${escapeHtml(item.name)}</div>
                    <div class="order-item-meta">Size: ${escapeHtml(item.size)} · Qty: ${item.qty}</div>
                  </div>
                  <div class="order-item-price">${formatPrice(item.price * item.qty)}</div>
                </div>`;
              })
              .join('')}
          </div>
          <div class="order-total-break">
            <div class="otb-row"><span>Subtotal</span><span>${formatPrice(Number(o.subtotal != null ? o.subtotal : o.total) || 0)}</span></div>
            ${
              Number(o.discount) > 0
                ? `<div class="otb-row otb-disc"><span>Discount</span><span>−${formatPrice(Number(o.discount))}</span></div>`
                : ''
            }
            <div class="otb-row"><span>Shipping</span><span>${Number(o.shipping) === 0 ? 'Free' : formatPrice(Number(o.shipping || 0))}</span></div>
            <div class="otb-row otb-total"><span>Total</span><span>${formatPrice(o.total)}</span></div>
          </div>
          <div class="order-meta-grid">
            <div class="order-meta-box">
              <div class="ometa-label">Delivery Address</div>
              <div class="ometa-val">${escapeHtml(o.address)}</div>
            </div>
            <div class="order-meta-box">
              <div class="ometa-label">Payment</div>
              <div class="ometa-val">${escapeHtml(o.payment_method || '—')} (${escapeHtml(o.payment_status || '—')})</div>
            </div>
          </div>
          <div class="order-actions">
            ${o.status !== 'Delivered' && o.status !== 'Returned' ? `<button type="button" class="btn btn-outline" onclick='event.stopPropagation();cancelOrder(${JSON.stringify(o.id)})' style="font-size:10px;padding:10px 20px">Cancel Order</button>` : ''}
            ${o.status === 'Delivered' ? `<button type="button" class="btn btn-outline" onclick='event.stopPropagation();returnOrder(${JSON.stringify(o.id)})' style="font-size:10px;padding:10px 20px">Request Return</button>` : ''}
            <a href="shop.html" class="btn btn-ghost" style="font-size:10px;padding:10px 0;letter-spacing:.15em">Buy Again</a>
          </div>
        </div>
      </div>`
    )
    .join('');
}

function toggleOrder(id) {
  const sid = safeId(id);
  const body = document.getElementById('body-' + sid);
  const btn = document.getElementById('expand-' + sid);
  if (!body || !btn) return;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open');
  btn.textContent = isOpen ? '﹀' : '︿';
}

async function cancelOrder(id) {
  const orders = await EyeApi.fetchOrders();
  const o = orders.find((x) => x.id === id);
  if (o && o.status === 'Pending') {
    await EyeApi.updateOrderStatus(id, 'Returned');
    renderOrders();
    showToast('Order cancelled');
  } else {
    showToast('Cannot cancel — order already shipped');
  }
}

async function returnOrder(id) {
  await EyeApi.updateOrderStatus(id, 'Returned');
  renderOrders();
  showToast('Return requested');
}
