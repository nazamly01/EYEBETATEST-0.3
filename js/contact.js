function renderContactPage(t) {
  const title1 = escapeHtml(t.titleLine1 || '');
  const titleEm = escapeHtml(t.titleEm || '');
  const lead = escapeHtml(t.lead || '');
  const email = (t.email || '').trim();
  const phone = (t.phone || '').trim();
  const wa = (t.whatsapp || '').trim();
  const address = (t.address || '').trim();
  const hours = (t.hours || '').trim();
  const mailHref = email ? `mailto:${escapeHtml(email)}` : '';
  const telHref = phone ? `tel:${escapeHtml(phone.replace(/\s/g, ''))}` : '';
  const waHref = wa ? `https://wa.me/${escapeHtml(wa.replace(/\D/g, ''))}` : '';

  const cards = [];
  if (email) {
    cards.push(
      `<div class="contact-card"><span class="contact-card-label">Email</span><a class="contact-card-value" href="${mailHref}">${escapeHtml(email)}</a></div>`
    );
  }
  if (phone) {
    cards.push(
      `<div class="contact-card"><span class="contact-card-label">Phone</span><a class="contact-card-value" href="${telHref}">${escapeHtml(phone)}</a></div>`
    );
  }
  if (address) {
    cards.push(`<div class="contact-card"><span class="contact-card-label">Address</span><p class="contact-card-text">${escapeHtml(address)}</p></div>`);
  }
  if (hours) {
    cards.push(`<div class="contact-card"><span class="contact-card-label">Hours</span><p class="contact-card-text">${escapeHtml(hours)}</p></div>`);
  }

  return `
  <section class="contact-hero">
    <p class="contact-pre">${escapeHtml(t.sectionLabel || 'Contact')}</p>
    <h1 class="contact-title">${title1} <em>${titleEm}</em></h1>
    <p class="contact-lead">${lead}</p>
  </section>
  <div class="contact-grid">
    <div class="contact-panel">
      <h2 class="contact-panel-title">${escapeHtml(t.formTitle || 'Send a message')}</h2>
      <div class="contact-chat-preview">
        <div class="contact-bubble contact-bubble-in">${escapeHtml(t.chatIntro || 'Hi! How can we help you today?')}</div>
        <div class="contact-bubble contact-bubble-out">${escapeHtml(t.chatHint || 'Type your message below and we will reply soon.')}</div>
      </div>
      <form class="contact-form" id="contactForm" onsubmit="submitContactForm(event)">
        <label class="contact-field">
          <span>${escapeHtml(t.nameLabel || 'Name')}</span>
          <input type="text" name="name" required autocomplete="name" />
        </label>
        <label class="contact-field">
          <span>${escapeHtml(t.emailLabel || 'Email')}</span>
          <input type="email" name="email" required autocomplete="email" />
        </label>
        <label class="contact-field">
          <span>${escapeHtml(t.messageLabel || 'Message')}</span>
          <textarea name="message" rows="5" required></textarea>
        </label>
        <button type="submit" class="btn btn-primary">${escapeHtml(t.submitLabel || 'Send chat')}</button>
        ${
          wa
            ? `<a class="btn btn-outline" href="${waHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                t.whatsappButtonLabel || 'Chat on WhatsApp'
              )}</a>`
            : ''
        }
      </form>
    </div>
    <div class="contact-aside">
      ${
        cards.length
          ? `<div class="contact-cards">${cards.join('')}</div>`
          : '<p class="contact-empty-note">Edit contact details in Admin → Settings (contact page JSON).</p>'
      }
    </div>
  </div>`;
}

async function submitContactForm(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get('name') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const message = String(fd.get('message') || '').trim();
  const raw = await EyeApi.getSiteSetting('contact_page');
  let c = {};
  try {
    c = JSON.parse(raw || '{}');
  } catch (_) {}
  const to = (c.email || '').trim();
  const wa = (c.whatsapp || c.phone || '').trim();
  const subject = encodeURIComponent(`EYE contact — ${name}`);
  const body = encodeURIComponent(`From: ${name} <${email}>\n\n${message}`);
  await EyeApi.saveContactMessage({ name, email, message }).catch(() => {});
  if (wa) {
    const waNum = String(wa).replace(/\D/g, '');
    if (waNum) {
      const waText = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
      window.open(`https://wa.me/${waNum}?text=${waText}`, '_blank', 'noopener');
    }
  }
  if (to) {
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  } else {
    showToast('Sent');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initLoader();
  const ok = await mountStandardShell('contact');
  if (!ok) return;

  const defaults = {
    sectionLabel: 'Contact',
    titleLine1: "We'd love to",
    titleEm: 'hear from you',
    lead: 'Questions about orders, sizing, or our collections — send a note and we will get back within 24–48 hours.',
    formTitle: 'Send a message',
    nameLabel: 'Name',
    emailLabel: 'Email',
    messageLabel: 'Message',
    submitLabel: 'Send',
    chatIntro: 'Hi! How can we help you today?',
    chatHint: 'Type your message below and we will reply soon.',
    whatsappButtonLabel: 'Chat on WhatsApp',
    whatsappQuickLabel: 'Message us on WhatsApp',
    email: '',
    phone: '',
    whatsapp: '',
    whatsappLabel: 'WhatsApp',
    address: 'Cairo, Egypt',
    hours: 'Sun–Thu · 10:00 – 18:00',
  };

  const mount = document.getElementById('contactMount');
  if (mount) mount.innerHTML = renderContactPage(defaults);

  const raw = await EyeApi.getSiteSetting('contact_page');
  let c = {};
  try {
    c = JSON.parse(raw || '{}');
  } catch (_) {}
  const t = { ...defaults, ...c };
  if (mount) mount.innerHTML = renderContactPage(t);
});
