document.addEventListener('DOMContentLoaded', async () => {
  const ok = await mountStandardShell('');
  initLoader();
  if (!ok) return;

  const legal = await EyeApi.fetchLegalReturnsJson();
  const hero = document.getElementById('policyHeroMount');
  const body = document.getElementById('policyBodyMount');
  if (!legal) {
    if (hero) hero.innerHTML = '';
    if (body) body.innerHTML = '<p class="policy-text">No policy content is configured yet.</p>';
    return;
  }
  if (hero) {
    hero.innerHTML = `
    <span class="section-label">${escapeHtml(legal.heroLabel || '')}</span>
    <h1>${legal.heroTitleHtml || ''}</h1>
    <p>${escapeHtml(legal.heroLead || '')}</p>
    <span class="policy-updated">Last updated: ${escapeHtml(legal.updated || '')}</span>`;
  }
  if (body) {
    body.innerHTML = legal.bodyHtml || '';
  }
});
