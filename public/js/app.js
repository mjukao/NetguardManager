// ── Summary card filter (toggle) ──
document.querySelectorAll('.summary-card').forEach((card) => {
  card.addEventListener('click', () => {
    const f = card.dataset.filter;
    activeCardFilter = f === '' ? '' : (activeCardFilter === f ? '' : f);
    updateActiveCardUI();
    renderTable();
  });
});

// ── Search ──
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value;
  searchClearBtn.hidden = !searchQuery;
  renderTable();
});
searchClearBtn.addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchClearBtn.hidden = true;
  renderTable();
  searchInput.focus();
});

document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  searchInput.value = '';
  searchQuery = '';
  searchClearBtn.hidden = true;
  activeCardFilter = '';
  updateActiveCardUI();
  renderTable();
});
document.getElementById('emptyCreateBtn').addEventListener('click', openCreateModal);

// ── Manual refresh + "อัปเดตเมื่อ..." ──
noteTimer = setInterval(updateRefreshNote, 1000);

refreshBtn.addEventListener('click', async () => {
  refreshBtn.classList.add('spinning');
  refreshBtn.disabled = true;
  try {
    await loadBots();
    flashSummaryCards();
  } finally {
    refreshBtn.classList.remove('spinning');
    refreshBtn.disabled = false;
  }
});

// เมนูยึดตำแหน่งจาก getBoundingClientRect ตอนเปิด — ถ้า scroll แล้วตำแหน่งเพี้ยน ให้ปิดไปเลย
window.addEventListener('scroll', () => closeAllKebabs(), true);

// event delegation — ผูกครั้งเดียว ไม่ต้อง re-attach ทุกรอบ render
tbody.addEventListener('click', (e) => {
  const kebabToggle = e.target.closest('[data-kebab-toggle]');
  if (kebabToggle) { e.stopPropagation(); toggleKebab(kebabToggle); return; }

  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    e.stopPropagation();
    closeAllKebabs();
    onActionClick(actionBtn);
    return;
  }

  if (e.target.closest('a')) return;

  const tr = e.target.closest('tr[data-name]');
  if (tr) openStatsModal(tr.dataset.name);
});

tbody.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const tr = e.target.closest('tr[data-name]');
  if (tr && e.target === tr) {
    e.preventDefault();
    openStatsModal(tr.dataset.name);
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.kebab-wrap')) closeAllKebabs();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closeAllKebabs();
  document.querySelectorAll('.modal-overlay.show').forEach((m) => m.classList.remove('show'));
});

// ── Log modal ──
document.getElementById('logModalClose').addEventListener('click', closeLogModal);
logModal.addEventListener('click', (e) => {
  if (e.target === logModal) closeLogModal();
});

// ── Create bot modal ──
document.getElementById('openCreateBtn').addEventListener('click', openCreateModal);
document.getElementById('createModalClose').addEventListener('click', closeCreateModal);
document.getElementById('createCancelBtn').addEventListener('click', closeCreateModal);
createModal.addEventListener('click', (e) => {
  if (e.target === createModal) closeCreateModal();
});
newBotName.addEventListener('input', sanitizeBotNameInput);
document.getElementById('createSubmitBtn').addEventListener('click', submitCreateBot);

// ── Attach tunnel modal ──
document.getElementById('attachTunnelModalClose').addEventListener('click', closeAttachTunnelModal);
document.getElementById('attachTunnelCancelBtn').addEventListener('click', closeAttachTunnelModal);
attachTunnelModal.addEventListener('click', (e) => {
  if (e.target === attachTunnelModal) closeAttachTunnelModal();
});
attachTunnelSubmitBtn.addEventListener('click', submitAttachTunnel);

// ── Edit customer meta modal ──
document.getElementById('editMetaModalClose').addEventListener('click', closeEditMetaModal);
document.getElementById('editMetaCancelBtn').addEventListener('click', closeEditMetaModal);
editMetaModal.addEventListener('click', (e) => {
  if (e.target === editMetaModal) closeEditMetaModal();
});
editMetaSubmitBtn.addEventListener('click', submitEditMeta);

// ── Remove confirm modal ──
document.getElementById('removeModalClose').addEventListener('click', closeRemoveModal);
document.getElementById('removeCancelBtn').addEventListener('click', closeRemoveModal);
removeModal.addEventListener('click', (e) => {
  if (e.target === removeModal) closeRemoveModal();
});
removeConfirmBtn.addEventListener('click', submitRemoveBot);

// ── Stats detail modal ──
document.getElementById('statsModalClose').addEventListener('click', closeStatsModal);
statsModal.addEventListener('click', (e) => {
  if (e.target === statsModal) closeStatsModal();
});

// ── Update image / logout ──
document.getElementById('pullImageBtn').addEventListener('click', (e) => submitPullImage(e.currentTarget));
document.getElementById('logoutBtn').addEventListener('click', submitLogout);

// ── Mobile sidebar (hamburger + overlay + Escape) ──
function openSidebar() {
  sidebar.classList.add('show');
  sidebarOverlay.classList.add('show');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  sidebar.classList.remove('show');
  sidebarOverlay.classList.remove('show');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
}
hamburgerBtn.addEventListener('click', () => {
  if (sidebar.classList.contains('show')) closeSidebar();
  else openSidebar();
});
sidebarOverlay.addEventListener('click', closeSidebar);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar.classList.contains('show')) closeSidebar();
});

// ── Init ──
loadBots();
refreshTimer = setInterval(loadBots, 10000);
