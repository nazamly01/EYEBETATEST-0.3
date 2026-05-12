/**
 * EYE — data layer (Supabase only). No catalog, orders, or CMS data is embedded in the frontend.
 */
const EyeApi = (function () {
  let supabase = null;
  let ready = false;

  function hasRemote() {
    return !!(window.EYE_SUPABASE_URL && window.EYE_SUPABASE_ANON_KEY);
  }

  async function init() {
    if (ready) return;
    ready = true;
    if (!hasRemote()) return;
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2.49.1');
      supabase = mod.createClient(window.EYE_SUPABASE_URL, window.EYE_SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      window.eyeSupabase = supabase;
    } catch (e) {
      console.warn('EYE: Supabase init failed', e);
      supabase = null;
    }
  }

  function isRemote() {
    return !!supabase;
  }

  async function ensureBackend() {
    await init();
    return isRemote();
  }

  /** Normalize profiles.role from the DB for reliable comparisons (trim / case). */
  function normalizeDbRole(value) {
    const s = String(value == null ? '' : value).trim().toLowerCase();
    return s === 'admin' ? 'admin' : 'customer';
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

  function mapProductRow(row, imageUrls) {
    const urls = imageUrls || [];
    const price = Number(row.price);
    const cost = Number(row.cost ?? 0);
    const slug = row.slug != null ? String(row.slug).trim() : '';
    const sizeSpecs = parseProductJsonMap(row.size_specs_json);
    const meta = sizeSpecs && typeof sizeSpecs.__meta === 'object' ? sizeSpecs.__meta : {};
    const comparePriceRaw = Number(meta.compare_price);
    const comparePrice = Number.isFinite(comparePriceRaw) && comparePriceRaw > price ? comparePriceRaw : null;
    return {
      id: row.id,
      name: row.name,
      slug: slug || null,
      price,
      category: row.category_id,
      sizes: row.sizes || [],
      stock: row.stock,
      sizeStocks: parseProductJsonMap(row.size_stocks_json),
      sizeSpecs,
      comparePrice,
      badge: row.badge || null,
      description: row.description || '',
      image: urls[0] || '',
      images: urls,
      visibility: row.visibility === 'private' ? 'private' : 'public',
      cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
      unitProfit: Number.isFinite(price) && Number.isFinite(cost) ? Math.round((price - cost) * 100) / 100 : price,
    };
  }

  async function fetchProducts() {
    await init();
    if (!supabase) return [];
    const { data: prows, error: e1 } = await supabase.from('products').select('*').order('created_at', { ascending: false });
    if (e1) {
      console.warn(e1);
      return [];
    }
    const ids = (prows || []).map((r) => r.id);
    let imgMap = {};
    if (ids.length) {
      const { data: imgs } = await supabase.from('product_images').select('*').in('product_id', ids).order('sort_order');
      (imgs || []).forEach((row) => {
        if (!imgMap[row.product_id]) imgMap[row.product_id] = [];
        imgMap[row.product_id].push(row.url);
      });
    }
    return (prows || []).map((row) => mapProductRow(row, imgMap[row.id] || []));
  }

  async function fetchProductBySlugOrId({ slug, id }) {
    await init();
    if (!supabase) return null;
    let q = supabase.from('products').select('*').limit(1);
    if (slug) q = q.eq('slug', String(slug).trim());
    else if (id) q = q.eq('id', id);
    else return null;
    const { data: rows, error } = await q;
    if (error || !rows || !rows.length) return null;
    const row = rows[0];
    const { data: imgs } = await supabase
      .from('product_images')
      .select('*')
      .eq('product_id', row.id)
      .order('sort_order');
    const urls = (imgs || []).map((x) => x.url).filter(Boolean);
    return mapProductRow(row, urls);
  }

  async function fetchCategories() {
    await init();
    if (!supabase) return [];
    const { data, error } = await supabase.from('categories').select('*').order('sort_order');
    if (error) return [];
    return data || [];
  }

  async function fetchAnnouncements() {
    await init();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('announcements')
      .select('id,message,link_url,sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) return [];
    return data || [];
  }

  async function fetchAnnouncementsAdmin() {
    await init();
    if (!supabase) return [];
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return [];
    const { data, error } = await supabase.from('announcements').select('*').order('sort_order', { ascending: true });
    if (error) return [];
    return data || [];
  }

  async function adminUpsertAnnouncement(row) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false, error: 'Forbidden' };
    const payload = {
      message: row.message,
      link_url: row.link_url || null,
      sort_order: Number(row.sort_order) || 0,
      is_active: row.is_active !== false,
    };
    if (row.id) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', row.id);
      return error ? { ok: false, error } : { ok: true };
    }
    const { error } = await supabase.from('announcements').insert(payload);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminDeleteAnnouncement(id) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function fetchNavigationLinks() {
    await init();
    if (!supabase) return [];
    const { data, error } = await supabase.from('navigation_links').select('*').order('sort_order', { ascending: true });
    if (error) return [];
    return data || [];
  }

  async function adminUpsertNavigationLink(row) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const payload = {
      zone: row.zone,
      label: row.label,
      href: row.href,
      sort_order: Number(row.sort_order) || 0,
    };
    if (row.id) {
      const { error } = await supabase.from('navigation_links').update(payload).eq('id', row.id);
      return error ? { ok: false, error } : { ok: true };
    }
    const { error } = await supabase.from('navigation_links').insert(payload);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminDeleteNavigationLink(id) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('navigation_links').delete().eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function getSiteSetting(key) {
    await init();
    if (!supabase) return '';
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
    if (error) return '';
    return data?.value ?? '';
  }

  async function fetchMarqueeText() {
    return getSiteSetting('marquee_text');
  }

  async function setMarqueeText(text) {
    return adminSetSiteSetting('marquee_text', text);
  }

  async function adminSetSiteSetting(key, value) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false, error: 'Forbidden' };
    const { error } = await supabase
      .from('site_settings')
      .upsert({ key, value: String(value ?? ''), updated_at: new Date().toISOString() });
    return error ? { ok: false, error } : { ok: true };
  }

  async function fetchHomepageJson() {
    const raw = await getSiteSetting('homepage');
    if (!raw || !String(raw).trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async function fetchLegalReturnsJson() {
    const raw = await getSiteSetting('legal_returns');
    if (!raw || !String(raw).trim()) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async function fetchPaymentWallets() {
    const raw = await getSiteSetting('payment_wallets_json');
    if (!raw || !String(raw).trim()) return { telda: '', instapay: '', online: '' };
    try {
      const o = JSON.parse(raw);
      return { telda: String(o.telda || ''), instapay: String(o.instapay || ''), online: String(o.online || '') };
    } catch {
      return { telda: '', instapay: '', online: '' };
    }
  }

  async function fetchShippingZonesConfig() {
    const raw = await getSiteSetting('shipping_zones_json');
    if (!raw || !String(raw).trim()) {
      return { zones: [], defaultShippingEgp: 150 };
    }
    try {
      const o = JSON.parse(raw);
      const zones = Array.isArray(o.zones) ? o.zones : [];
      const defaultShippingEgp = Number(o.defaultShippingEgp) >= 0 ? Number(o.defaultShippingEgp) : 150;
      return { zones, defaultShippingEgp };
    } catch {
      return { zones: [], defaultShippingEgp: 150 };
    }
  }

  async function uploadProductImageBlob(blob, contentType) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false, error: 'Admin only' };
    const ct = contentType || blob.type || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : 'jpg';
    const path = `p/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, blob, {
      contentType: ct,
      upsert: false,
    });
    if (error) return { ok: false, error: error.message || error };
    const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path);
    return { ok: true, url: pub.publicUrl };
  }

  /** Homepage / shop / CMS images — same bucket, path prefix <code>site/</code>. */
  async function uploadSiteImageBlob(blob, contentType) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false, error: 'Admin only' };
    const ct = contentType || blob.type || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const path = `site/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const { error } = await supabase.storage.from('product-images').upload(path, blob, {
      contentType: ct,
      upsert: false,
    });
    if (error) return { ok: false, error: error.message || error };
    const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path);
    return { ok: true, url: pub.publicUrl };
  }

  async function fetchShippingFreeThresholdEgp() {
    const v = await getSiteSetting('shipping_free_threshold_egp');
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 2000;
  }

  async function saveContactMessage(payload) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    const row = {
      name: String(payload.name || '').trim(),
      email: String(payload.email || '').trim().toLowerCase(),
      message: String(payload.message || '').trim(),
    };
    const { error } = await supabase.from('contact_messages').insert(row);
    return error ? { ok: false, error: error.message || error } : { ok: true };
  }

  async function fetchContactMessages() {
    await init();
    if (!supabase) return [];
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!(await isAdminUid(uid))) return [];
    const { data, error } = await supabase
      .from('contact_messages')
      .select('id,name,email,message,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return [];
    return data || [];
  }

  async function newsletterSubscribe(email) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    const { error } = await supabase.from('newsletter_subscribers').insert({ email: String(email).trim().toLowerCase() });
    if (error && error.code !== '23505') return { ok: false, error };
    return { ok: true };
  }

  async function fetchWishlistProductIds() {
    await init();
    if (!supabase) return [];
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return [];
    const { data, error } = await supabase.from('wishlist_items').select('product_id').eq('user_id', uid);
    if (error) return [];
    return (data || []).map((r) => r.product_id);
  }

  async function wishlistAdd(productId) {
    await init();
    if (!supabase) return { ok: false };
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return { ok: false, error: 'auth' };
    const { error } = await supabase.from('wishlist_items').insert({ user_id: uid, product_id: productId });
    if (error) return { ok: false, error };
    return { ok: true };
  }

  async function wishlistRemove(productId) {
    await init();
    if (!supabase) return { ok: false };
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return { ok: false };
    const { error } = await supabase.from('wishlist_items').delete().eq('user_id', uid).eq('product_id', productId);
    return error ? { ok: false, error } : { ok: true };
  }

  async function getSessionUser() {
    await init();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    return { id: u.id, email: u.email || '' };
  }

  async function fetchMyProfile() {
    await init();
    if (!supabase) return null;
    await supabase.auth.getUser();
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return null;
    const { data: prof, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone,address,role,created_at')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.warn('EYE: fetchMyProfile', error.message || error);
      return null;
    }
    if (!prof) return null;
    const email = session.session?.user?.email || prof.email || '';
    return {
      id: prof.id,
      email,
      name: prof.full_name || email.split('@')[0] || 'Member',
      phone: prof.phone || '',
      address: prof.address || '',
      role: normalizeDbRole(prof.role),
    };
  }

  /** Profile row + auth session shape for account pages (never null if a session exists). */
  async function fetchAccountDashboardUser() {
    await init();
    if (!supabase) return null;
    const { data: session } = await supabase.auth.getSession();
    const u = session?.session?.user;
    if (!u) return null;
    const uid = u.id;
    const { data: prof, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone,address,role,created_at')
      .eq('id', uid)
      .maybeSingle();
    if (error) console.warn('EYE: fetchAccountDashboardUser', error.message || error);
    if (prof) {
      const email = u.email || prof.email || '';
      return {
        id: prof.id,
        email,
        name: prof.full_name || email.split('@')[0] || 'Member',
        phone: prof.phone || '',
        address: prof.address || '',
        role: normalizeDbRole(prof.role),
      };
    }
    const email = u.email || '';
    const metaName = u.user_metadata && typeof u.user_metadata.full_name === 'string' ? u.user_metadata.full_name : '';
    return {
      id: uid,
      email,
      name: (metaName && metaName.trim()) || (email ? email.split('@')[0] : 'Member'),
      phone: '',
      address: '',
      role: 'customer',
    };
  }

  async function saveProfileRemote(fields) {
    await init();
    if (!supabase) return { ok: false };
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return { ok: false };
    const email = session.session?.user?.email || '';
    const { data: existing } = await supabase.from('profiles').select('id').eq('id', uid).maybeSingle();
    const fullName = (fields.name && String(fields.name).trim()) || (email ? email.split('@')[0] : 'Member');
    const phone = fields.phone != null ? String(fields.phone) : '';
    const address = fields.address != null ? String(fields.address) : '';
    if (!existing) {
      const { error } = await supabase.from('profiles').insert({
        id: uid,
        email: email || null,
        full_name: fullName,
        phone,
        address,
        role: 'customer',
      });
      return error ? { ok: false, error } : { ok: true };
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fields.name,
        phone: fields.phone,
        address: fields.address,
      })
      .eq('id', uid);
    return error ? { ok: false, error } : { ok: true };
  }

  async function fetchCoupons() {
    await init();
    if (!supabase) return [];
    const { data, error } = await supabase.from('coupons').select('*');
    if (error) return [];
    return (data || []).map((c) => ({
      id: c.id,
      code: c.code,
      type: c.type,
      value: Number(c.value),
      expiry: c.expiry,
      uses: c.uses,
      maxUses: c.max_uses,
      product_id: c.product_id || null,
    }));
  }

  async function fetchOrders() {
    await init();
    if (!supabase) return [];
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return [];
    const isAdm = await isAdminUid(uid);
    let q = supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (!isAdm) q = q.eq('user_id', uid);
    const { data, error } = await q;
    if (error) return [];
    return (data || []).map(mapOrderRow);
  }

  async function adminDeleteOrder(id) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid || !(await isAdminUid(uid))) return { ok: false, error: 'Not admin' };
    
    // First, verify if the order exists to prevent unneeded logs
    const { data: existing, error: fetchErr } = await supabase.from('orders').select('id').eq('id', id).maybeSingle();
    if (!existing || fetchErr) return { ok: false, error: 'Order not found' };

    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    writeLog('DELETE', 'order', String(id), 'Admin deleted order');
    return { ok: true };
  }

  function mapOrderRow(o) {
    let items = o.items;
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }
    const itemsArr = Array.isArray(items) ? items : [];
    return {
      id: o.id,
      userId: o.user_id,
      date: o.date,
      created_at: o.created_at,
      status: o.status,
      payment_method: o.payment_method,
      payment_status: o.payment_status || 'Pending',
      items: itemsArr.filter(Boolean).map((it) => ({
        productId: it.productId,
        name: it.name,
        price: it.price,
        qty: it.qty,
        size: it.size,
        image: it.image || it.imageUrl || '',
      })),
      total: Number(o.total),
      address: o.shipping_address,
      subtotal: Number(o.subtotal != null ? o.subtotal : o.total),
      discount: Number(o.discount || 0),
      shipping: Number(o.shipping || 0),
      coupon_code: o.coupon_code,
      payment_proof_url: o.payment_proof_url || null,
    };
  }

  async function isAdminUid(uid) {
    if (!supabase || !uid) return false;
    const { data, error } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (error) {
      console.warn('EYE: isAdminUid', error.message || error);
      return false;
    }
    return normalizeDbRole(data?.role) === 'admin';
  }

  async function fetchUsers() {
    await init();
    if (!supabase) return [];
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!(await isAdminUid(uid))) return [];
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) return [];
    return (data || []).map((p) => ({
      id: p.id,
      name: p.full_name || 'User',
      email: p.email || '',
      role: p.role,
      status: 'active',
      joined: (p.created_at || '').slice(0, 10),
      phone: p.phone,
      address: p.address,
    }));
  }

  async function fetchExpenses() {
    await init();
    if (!supabase) return [];
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid || !(await isAdminUid(uid))) return [];
    const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
    if (error) return [];
    return (data || []).map((e) => ({
      id: e.id,
      category: e.category,
      label: e.label,
      amount: Number(e.amount),
      date: e.expense_date,
    }));
  }

  async function saveOrder(orderPayload) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    let { data: session } = await supabase.auth.getSession();
    let uid = session?.session?.user?.id;
    if (!uid) {
      try {
        const { data: anonData, error: anonErr } = await supabase.auth.signInAnonymously();
        if (anonErr) return { ok: false, error: anonErr.message || 'Could not start guest checkout' };
        uid = anonData?.user?.id || null;
      } catch {
        return { ok: false, error: 'Guest checkout is unavailable right now' };
      }
    }
    if (!uid) return { ok: false, error: 'Could not create guest session' };
    
    // 5 random digits for Order ID
    const oid = 'EYE-' + String(Math.floor(10000 + Math.random() * 90000));
    
    const row = {
      id: oid,
      user_id: uid,
      date: orderPayload.date,
      status: orderPayload.status || 'Pending',
      payment_method: orderPayload.payment_method,
      payment_status: orderPayload.payment_status || 'Pending',
      shipping_address: orderPayload.address,
      subtotal: orderPayload.subtotal ?? orderPayload.total,
      discount: orderPayload.discount ?? 0,
      shipping: orderPayload.shipping ?? 0,
      total: orderPayload.total,
      coupon_code: orderPayload.coupon_code || null,
      items: orderPayload.items,
      payment_proof_url: orderPayload.payment_proof_url || null,
    };
    const { error } = await supabase.from('orders').insert(row);
    if (error) return { ok: false, error };
    if (orderPayload.coupon_code) {
      const { error: rpcErr } = await supabase.rpc('increment_coupon_usage', { p_code: orderPayload.coupon_code });
      if (rpcErr) console.warn('EYE: increment_coupon_usage', rpcErr);
    }
    // Decrement per-size stock for each ordered item
    const items = Array.isArray(orderPayload.items) ? orderPayload.items : [];
    await Promise.allSettled(
      items.map((it) => decrementSizeStock(it.productId, it.size, it.qty || 1))
    );
    // Write activity log (fire-and-forget)
    writeLog('order.created', 'order', oid, `${orderPayload.payment_method} — EGP ${orderPayload.total}`).catch(() => {});
    return { ok: true, orderId: oid, userId: uid };
  }

  const PENDING_ORDER_CLAIM_KEY = 'EYE_PENDING_ORDER_CLAIM';

  function savePendingOrderClaim(orderId, userId) {
    try {
      if (!orderId || !userId) return;
      localStorage.setItem(PENDING_ORDER_CLAIM_KEY, JSON.stringify({ orderId, userId, t: Date.now() }));
    } catch (_) {}
  }

  /** After real sign-in (non-anonymous), attach last guest order if email matches order address. */
  async function claimPendingAnonymousOrder() {
    await init();
    if (!supabase) return { claimed: false, skipped: true };
    let raw;
    try {
      raw = localStorage.getItem(PENDING_ORDER_CLAIM_KEY);
    } catch (_) {
      return { claimed: false, skipped: true };
    }
    if (!raw) return { claimed: false, skipped: true };
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      try {
        localStorage.removeItem(PENDING_ORDER_CLAIM_KEY);
      } catch (_) {}
      return { claimed: false, skipped: true };
    }
    const orderId = payload.orderId;
    const fromUid = payload.userId;
    if (!orderId || !fromUid) {
      try {
        localStorage.removeItem(PENDING_ORDER_CLAIM_KEY);
      } catch (_) {}
      return { claimed: false, skipped: true };
    }
    const { data: session } = await supabase.auth.getSession();
    const u = session?.session?.user;
    const isAnon = u && (u.is_anonymous === true || (u.app_metadata && u.app_metadata.provider === 'anonymous'));
    if (!u || isAnon) return { claimed: false, skipped: true };
    const { data: claimed, error } = await supabase.rpc('claim_anonymous_order', {
      p_order_id: String(orderId),
      p_from_uid: String(fromUid),
    });
    if (error) {
      console.warn('EYE: claim_anonymous_order', error);
      return { claimed: false, error };
    }
    if (claimed === true) {
      try {
        localStorage.removeItem(PENDING_ORDER_CLAIM_KEY);
      } catch (_) {}
      return { claimed: true };
    }
    try {
      localStorage.removeItem(PENDING_ORDER_CLAIM_KEY);
    } catch (_) {}
    return { claimed: false, mismatch: true };
  }

  async function updateOrderStatus(id, status) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!uid) return { ok: false, error: 'Not signed in' };
    if (!(await isAdminUid(uid))) {
      const { data: row } = await supabase.from('orders').select('user_id').eq('id', id).maybeSingle();
      if (!row || row.user_id !== uid) return { ok: false, error: 'Forbidden' };
    }
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function updateOrderPayment(id, payment_status, payment_method) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!uid) return { ok: false, error: 'Not signed in' };
    if (!(await isAdminUid(uid))) {
      const { data: row } = await supabase.from('orders').select('user_id').eq('id', id).maybeSingle();
      if (!row || row.user_id !== uid) return { ok: false, error: 'Forbidden' };
    }
    const patch = {};
    if (payment_status != null) patch.payment_status = payment_status;
    if (payment_method != null) patch.payment_method = payment_method;
    const { error } = await supabase.from('orders').update(patch).eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  /** Cart is kept in browser localStorage only; these are no-ops for compatibility. */
  async function loadCartFromRemote() {
    await init();
  }

  async function persistCartRemote() {
    await init();
  }

  async function adminSaveProduct(data, imageUrls) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false, error: 'Forbidden' };
    const slugIn = data.slug != null && String(data.slug).trim() ? String(data.slug).trim().toLowerCase() : null;
    const row = {
      name: data.name,
      description: data.description || '',
      price: data.price,
      stock: data.stock,
      category_id: data.category,
      badge: data.badge || null,
      sizes: data.sizes || [],
      visibility: data.visibility === 'private' ? 'private' : 'public',
      cost: Number(data.cost) >= 0 ? Number(data.cost) : 0,
      slug: slugIn,
      size_stocks_json: data.sizeStocks && typeof data.sizeStocks === 'object' ? data.sizeStocks : {},
      size_specs_json: data.sizeSpecs && typeof data.sizeSpecs === 'object' ? data.sizeSpecs : {},
    };
    let pid = data.id;
    if (pid) {
      const { error } = await supabase.from('products').update(row).eq('id', pid);
      if (error) return { ok: false, error };
    } else {
      const { data: ins, error } = await supabase.from('products').insert(row).select('id').single();
      if (error) return { ok: false, error };
      pid = ins.id;
    }
    await supabase.from('product_images').delete().eq('product_id', pid);
    const urls = (imageUrls || []).filter(Boolean);
    if (urls.length) {
      const imgRows = urls.map((url, i) => ({ product_id: pid, url, sort_order: i }));
      const { error: e2 } = await supabase.from('product_images').insert(imgRows);
      if (e2) return { ok: false, error: e2 };
    }
    return { ok: true, id: pid };
  }

  async function adminDeleteProduct(productId) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('products').delete().eq('id', productId);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminUpsertCategory(row) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const payload = {
      id: row.id,
      name: row.name,
      sort_order: Number(row.sort_order) || 0,
      image_url: row.image_url || null,
      excerpt: row.excerpt || null,
      visibility: row.visibility === 'private' ? 'private' : 'public',
    };
    const { error } = await supabase.from('categories').upsert(payload);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminSaveCoupon(c) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const row = {
      code: c.code,
      type: c.type,
      value: c.value,
      expiry: c.expiry,
      uses: c.uses ?? 0,
      max_uses: c.maxUses ?? c.max_uses ?? 100,
      product_id: c.product_id || null,
    };
    if (c.id) {
      const { error } = await supabase.from('coupons').update(row).eq('id', c.id);
      return error ? { ok: false, error } : { ok: true };
    }
    const { error } = await supabase.from('coupons').insert(row);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminDeleteCoupon(id) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminSaveExpense(e) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const row = { category: e.category, label: e.label, amount: e.amount, expense_date: e.date };
    if (e.id) {
      const { error } = await supabase.from('expenses').update(row).eq('id', e.id);
      return error ? { ok: false, error } : { ok: true };
    }
    const { error } = await supabase.from('expenses').insert(row);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminDeleteExpense(id) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminSetUserRole(userId, role) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    return error ? { ok: false, error } : { ok: true };
  }

  /* ── Per-size stock decrement ─────────────────────────── */
  async function decrementSizeStock(productId, size, qty) {
    await init();
    if (!supabase || !productId || !size) return { ok: false };
    const qtyN = Math.max(1, Math.floor(Number(qty) || 1));
    // Try Supabase RPC first (atomic, race-condition safe)
    try {
      const { error } = await supabase.rpc('decrement_size_stock', {
        p_product_id: String(productId),
        p_size: String(size),
        p_qty: qtyN,
      });
      if (!error) return { ok: true };
      console.warn('EYE: decrement_size_stock RPC:', error.message);
    } catch (_) {}
    // Fallback: optimistic read-modify-write
    const { data: row, error: fetchErr } = await supabase
      .from('products')
      .select('size_stocks_json, stock')
      .eq('id', productId)
      .single();
    if (fetchErr || !row) return { ok: false, error: fetchErr };
    const stocks = { ...(row.size_stocks_json && typeof row.size_stocks_json === 'object' ? row.size_stocks_json : {}) };
    const cur = Math.max(0, Number(stocks[size] != null ? stocks[size] : (row.stock ?? 0)));
    stocks[size] = Math.max(0, cur - qtyN);
    const { error: upErr } = await supabase.from('products').update({ size_stocks_json: stocks }).eq('id', productId);
    return upErr ? { ok: false, error: upErr } : { ok: true };
  }

  /* ── Payment Proof Upload ─────────────────────────────── */
  async function uploadOrderProofBlob(blob, contentType) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    
    // Allow guests (uid can be null)
    let { data: session } = await supabase.auth.getSession();
    let uid = session?.session?.user?.id;
    if (!uid) {
      try {
        const { data: anonData } = await supabase.auth.signInAnonymously();
        uid = anonData?.user?.id || 'guest';
      } catch {
        uid = 'guest';
      }
    }

    const ct = contentType || blob.type || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    
    const { error } = await supabase.storage.from('order-proofs').upload(path, blob, { contentType: ct, upsert: false });
    if (error) return { ok: false, error: error.message || error };
    
    const { data: pub } = supabase.storage.from('order-proofs').getPublicUrl(path);
    return { ok: true, url: pub.publicUrl, path };
  }

  /* ── Feedback Image Upload ─────────────────────────────── */
  async function uploadFeedbackImageBlob(blob, contentType) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return { ok: false, error: 'Not signed in' };
    const ct = contentType || blob.type || 'image/jpeg';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const path = `fb/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('feedback-images').upload(path, blob, { contentType: ct, upsert: false });
    if (error) return { ok: false, error: error.message || error };
    const { data: pub } = supabase.storage.from('feedback-images').getPublicUrl(path);
    return { ok: true, url: pub.publicUrl };
  }

  /* ── Feedbacks ─────────────────────────────────────────── */
  async function fetchFeedbacks() {
    await init();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('feedbacks')
      .select('id,author_name,rating,comment,image_url,created_at')
      .eq('is_approved', true)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return [];
    return data || [];
  }

  async function fetchFeedbacksAdmin() {
    await init();
    if (!supabase) return [];
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return [];
    const { data, error } = await supabase
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async function submitFeedback(payload) {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return { ok: false, error: 'Not signed in' };
    const row = {
      user_id: uid,
      author_name: String(payload.author_name || 'Anonymous').trim(),
      rating: Math.min(5, Math.max(1, Number(payload.rating) || 5)),
      comment: String(payload.comment || '').trim(),
      image_url: payload.image_url || null,
      is_approved: false,
      is_hidden: false,
    };
    const { error } = await supabase.from('feedbacks').insert(row);
    return error ? { ok: false, error: error.message || error } : { ok: true };
  }

  async function adminSaveFeedback(row) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false, error: 'Forbidden' };
    const payload = {
      author_name: row.author_name,
      rating: Number(row.rating) || 5,
      comment: row.comment || '',
      image_url: row.image_url || null,
      is_approved: row.is_approved !== false,
      is_hidden: row.is_hidden === true,
      updated_at: new Date().toISOString(),
    };
    if (row.id) {
      const { error } = await supabase.from('feedbacks').update(payload).eq('id', row.id);
      return error ? { ok: false, error } : { ok: true };
    }
    payload.user_id = null;
    const { error } = await supabase.from('feedbacks').insert(payload);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminDeleteFeedback(id) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('feedbacks').delete().eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminToggleFeedbackApproval(id, approved) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('feedbacks').update({
      is_approved: !!approved,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function adminToggleFeedbackHidden(id, hidden) {
    await init();
    if (!supabase) return { ok: false };
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return { ok: false };
    const { error } = await supabase.from('feedbacks').update({
      is_hidden: !!hidden,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    return error ? { ok: false, error } : { ok: true };
  }

  /* ── Activity Logs ─────────────────────────────────────── */
  async function writeLog(action, entity, entityId, detail) {
    await init();
    if (!supabase) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session?.session?.user?.id || null;
      await supabase.from('activity_logs').insert({
        actor_id: uid,
        action: String(action),
        entity: entity || null,
        entity_id: entityId ? String(entityId) : null,
        detail: detail || null,
      });
    } catch (_) {}
  }

  async function fetchLogs(limit = 200, filter = '') {
    await init();
    if (!supabase) return [];
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return [];
    let q = supabase.from('activity_logs').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(limit);
    if (filter && filter !== 'all') q = q.ilike('action', `${filter}%`);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  }

  /* ── Behavioral Analytics ─────────────────────────────── */
  async function saveAnalyticsEvent(event) {
    await init();
    if (!supabase) return { ok: false };
    
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (uid && (await isAdminUid(uid))) return { ok: true }; // Skip admin

    const row = {
      event_type:   String(event.event_type || 'page_view'),
      product_id:   event.product_id  || null,
      product_name: event.product_name || null,
      session_id:   event.session_id  || null,
      duration_sec: event.duration_sec != null ? Math.floor(Number(event.duration_sec)) : null,
      page:         event.page || null,
    };
    const { error } = await supabase.from('analytics_events').insert(row);
    if (error) console.warn('EYE Analytics save:', error.message);
    return error ? { ok: false } : { ok: true };
  }

  async function fetchAnalyticsData() {
    await init();
    if (!supabase) return null;
    const uid = (await supabase.auth.getSession()).data.session?.user?.id;
    if (!(await isAdminUid(uid))) return null;

    const fiveMinAgo  = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const todayStart  = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [liveRes, viewsRes, durRes, todayRes] = await Promise.all([
      supabase.from('analytics_events').select('session_id').gte('created_at', fiveMinAgo),
      supabase.from('analytics_events').select('product_id,product_name').eq('event_type', 'product_view'),
      supabase.from('analytics_events').select('product_id,product_name,duration_sec').eq('event_type', 'product_exit').not('duration_sec', 'is', null),
      supabase.from('analytics_events').select('session_id').eq('event_type', 'page_view').gte('created_at', todayStart.toISOString()),
    ]);

    const liveVisitors  = new Set((liveRes.data  || []).map((r) => r.session_id)).size;
    const todayVisitors = new Set((todayRes.data  || []).map((r) => r.session_id)).size;

    const viewCounts = {}; const viewNames = {};
    (viewsRes.data || []).forEach((r) => {
      if (!r.product_id) return;
      viewCounts[r.product_id] = (viewCounts[r.product_id] || 0) + 1;
      viewNames[r.product_id]  = r.product_name || r.product_id;
    });
    const durTotals = {}; const durCounts = {};
    (durRes.data || []).forEach((r) => {
      if (!r.product_id || !r.duration_sec) return;
      durTotals[r.product_id] = (durTotals[r.product_id] || 0) + r.duration_sec;
      durCounts[r.product_id] = (durCounts[r.product_id] || 0) + 1;
    });
    const productStats = Object.keys(viewCounts)
      .map((id) => ({
        id, name: viewNames[id],
        views: viewCounts[id],
        avgDuration: durCounts[id] ? Math.round(durTotals[id] / durCounts[id]) : 0,
      }))
      .sort((a, b) => b.views - a.views);

    return { liveVisitors, todayVisitors, productStats };
  }

  async function adminClearTodayAnalytics() {
    await init();
    if (!supabase) return { ok: false, error: 'Offline' };
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid || !(await isAdminUid(uid))) return { ok: false, error: 'Not admin' };

    const todayStart = new Date(); 
    todayStart.setHours(0, 0, 0, 0);

    const { error } = await supabase
      .from('analytics_events')
      .delete()
      .gte('created_at', todayStart.toISOString());
      
    if (error) return { ok: false, error: error.message };
    writeLog('DELETE', 'analytics', 'today', 'Admin cleared today analytics');
    return { ok: true };
  }

  return {
    init,
    hasRemote,
    isRemote,
    ensureBackend,
    get client() {
      return supabase;
    },
    fetchProducts,
    fetchProductBySlugOrId,
    fetchCategories,
    fetchAnnouncements,
    fetchAnnouncementsAdmin,
    adminUpsertAnnouncement,
    adminDeleteAnnouncement,
    fetchNavigationLinks,
    adminUpsertNavigationLink,
    adminDeleteNavigationLink,
    getSiteSetting,
    fetchMarqueeText,
    setMarqueeText,
    adminSetSiteSetting,
    fetchHomepageJson,
    fetchLegalReturnsJson,
    fetchShippingFreeThresholdEgp,
    saveContactMessage,
    fetchContactMessages,
    fetchPaymentWallets,
    fetchShippingZonesConfig,
    uploadProductImageBlob,
    uploadSiteImageBlob,
    uploadOrderProofBlob,
    newsletterSubscribe,
    fetchWishlistProductIds,
    wishlistAdd,
    wishlistRemove,
    getSessionUser,
    fetchMyProfile,
    fetchAccountDashboardUser,
    saveProfileRemote,
    fetchCoupons,
    fetchOrders,
    fetchUsers,
    fetchExpenses,
    saveOrder,
    savePendingOrderClaim,
    claimPendingAnonymousOrder,
    updateOrderStatus,
    updateOrderPayment,
    loadCartFromRemote,
    persistCartRemote,
    isAdminUid,
    adminSaveProduct,
    adminDeleteProduct,
    adminUpsertCategory,
    adminSaveCoupon,
    adminDeleteCoupon,
    adminSaveExpense,
    adminDeleteExpense,
    adminSetUserRole,
    decrementSizeStock,
    saveAnalyticsEvent,
    fetchAnalyticsData,
    uploadOrderProofBlob,
    uploadFeedbackImageBlob,
    fetchFeedbacks,
    fetchFeedbacksAdmin,
    submitFeedback,
    adminSaveFeedback,
    adminDeleteFeedback,
    adminToggleFeedbackApproval,
    adminToggleFeedbackHidden,
    writeLog,
    fetchLogs,
    adminDeleteOrder,
    adminClearTodayAnalytics,
  };
})();
