(() => {
  'use strict';

  const DATA_URL = './photos_2.json';
  const BATCH_SIZE = 60;

  const state = {
    allPhotos: [],
    filteredPhotos: [],
    genres: [],
    genreMap: new Map(),
    genreCounts: new Map(),
    owners: [],
    selectedGenre: 'ALL',
    selectedOwner: 'ALL',
    searchQuery: '',
    sortBy: 'archive-desc',
    renderedCount: 0,
    activeModalIndex: -1,
    isZoomed: false,
  };

  const els = {
    resetAllBtn: document.getElementById('reset-all-btn'),
    totalCountBadge: document.getElementById('total-count-badge'),
    generatedAtLabel: document.getElementById('generated-at-label'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    ownerSelect: document.getElementById('owner-select'),
    sortSelect: document.getElementById('sort-select'),
    genreTabs: document.getElementById('genre-tabs'),
    genreDescBar: document.getElementById('genre-description-bar'),
    genreDescCode: document.getElementById('genre-desc-code'),
    genreDescTitle: document.getElementById('genre-desc-title'),
    genreDescText: document.getElementById('genre-desc-text'),
    resultSummary: document.getElementById('result-summary'),
    activeFilterChips: document.getElementById('active-filter-chips'),
    clearFiltersBtn: document.getElementById('clear-filters-btn'),
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorDetailText: document.getElementById('error-detail-text'),
    emptyState: document.getElementById('empty-state'),
    emptyResetBtn: document.getElementById('empty-reset-btn'),
    photoGrid: document.getElementById('photo-grid'),
    loadMoreArea: document.getElementById('load-more-area'),
    loadProgressText: document.getElementById('load-progress-text'),
    loadMoreBtn: document.getElementById('load-more-btn'),
    modal: document.getElementById('photo-modal'),
    modalPrevBtn: document.getElementById('modal-prev-btn'),
    modalNextBtn: document.getElementById('modal-next-btn'),
    modalArchiveNo: document.getElementById('modal-archive-no'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalStage: document.getElementById('modal-stage'),
    modalImage: document.getElementById('modal-image'),
    modalZoomBtn: document.getElementById('modal-zoom-btn'),
    modalGenreBtn: document.getElementById('modal-genre-btn'),
    modalTitle: document.getElementById('modal-title'),
    modalDescription: document.getElementById('modal-description'),
    modalMetaArchive: document.getElementById('modal-meta-archive'),
    modalMetaTaken: document.getElementById('modal-meta-taken'),
    modalMetaPublished: document.getElementById('modal-meta-published'),
    modalMetaOwner: document.getElementById('modal-meta-owner'),
    modalMetaLicense: document.getElementById('modal-meta-license'),
    modalTags: document.getElementById('modal-tags'),
    modalLargeLink: document.getElementById('modal-large-link'),
    modalFlickrLink: document.getElementById('modal-flickr-link'),
    copyCreditBtn: document.getElementById('copy-credit-btn'),
    copyEmbedBtn: document.getElementById('copy-embed-btn'),
    copyUrlBtn: document.getElementById('copy-url-btn'),
    toast: document.getElementById('toast'),
  };

  let toastTimer = null;
  let searchDebounceTimer = null;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('visible');
    }, 2400);
  }

  async function copyToClipboard(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(successMessage);
    }
  }

  function parseArchiveNumber(archiveNo) {
    const match = String(archiveNo || '').match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function formatLicense(licenseCode) {
    if (licenseCode === 'CC_BY') {
      return '<a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noopener noreferrer">CC BY 4.0（表示）</a>';
    }
    return escapeHtml(licenseCode || 'All Rights Reserved');
  }

  function syncUrlParams(photoId = null) {
    const url = new URL(window.location.href);

    if (state.selectedGenre && state.selectedGenre !== 'ALL') {
      url.searchParams.set('genre', state.selectedGenre);
    } else {
      url.searchParams.delete('genre');
    }

    if (state.selectedOwner && state.selectedOwner !== 'ALL') {
      url.searchParams.set('owner', state.selectedOwner);
    } else {
      url.searchParams.delete('owner');
    }

    if (state.searchQuery.trim()) {
      url.searchParams.set('q', state.searchQuery.trim());
    } else {
      url.searchParams.delete('q');
    }

    if (state.sortBy !== 'archive-desc') {
      url.searchParams.set('sort', state.sortBy);
    } else {
      url.searchParams.delete('sort');
    }

    if (photoId) {
      url.searchParams.set('photo', photoId);
    } else {
      url.searchParams.delete('photo');
    }

    window.history.replaceState({}, '', url.toString());
  }

  function restoreStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const genre = params.get('genre');
    const owner = params.get('owner');
    const q = params.get('q');
    const sort = params.get('sort');
    const photoId = params.get('photo');

    if (genre && (genre === 'ALL' || state.genreMap.has(genre))) {
      state.selectedGenre = genre;
    }

    if (owner && (owner === 'ALL' || state.owners.includes(owner))) {
      state.selectedOwner = owner;
      els.ownerSelect.value = owner;
    }

    if (q) {
      state.searchQuery = q;
      els.searchInput.value = q;
      els.searchClearBtn.hidden = false;
    }

    if (sort && ['archive-desc', 'archive-asc', 'taken-desc', 'taken-asc'].includes(sort)) {
      state.sortBy = sort;
      els.sortSelect.value = sort;
    }

    return photoId;
  }

  function buildIndexes(data) {
    state.genres = Array.isArray(data.genres) ? data.genres : [];
    state.genreMap.clear();
    state.genreCounts.clear();

    for (const g of state.genres) {
      state.genreMap.set(g.id, g);
      state.genreCounts.set(g.id, 0);
    }

    const ownerSet = new Set();
    const rawPhotos = Array.isArray(data.photos) ? data.photos : [];

    state.allPhotos = rawPhotos.map((p) => {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const genreObj = state.genreMap.get(p.genre);
      const genreLabel = genreObj ? genreObj.label : p.genre;

      if (p.genre) {
        state.genreCounts.set(p.genre, (state.genreCounts.get(p.genre) || 0) + 1);
      }
      if (p.owner) {
        ownerSet.add(p.owner);
      }

      const searchBlob = [
        p.archiveNo,
        p.title,
        p.description,
        genreLabel,
        p.dateTaken,
        tags.join(' '),
      ]
        .filter(Boolean)
        .join('\n')
        .toLowerCase();

      return {
        ...p,
        tags,
        genreLabel,
        archiveNum: parseArchiveNumber(p.archiveNo),
        searchBlob,
      };
    });

    state.owners = Array.from(ownerSet).sort();

    const total = data.totalPhotos ?? state.allPhotos.length;
    els.totalCountBadge.textContent = `${total.toLocaleString()} PHOTOS`;

    if (data.generatedAt) {
      const datePart = String(data.generatedAt).slice(0, 10);
      els.generatedAtLabel.textContent = `UPDATED: ${datePart}`;
    }
  }

  function renderOwnerOptions() {
    const fragment = document.createDocumentFragment();
    for (const owner of state.owners) {
      const opt = document.createElement('option');
      opt.value = owner;
      opt.textContent = `Account: ${owner}`;
      fragment.appendChild(opt);
    }
    els.ownerSelect.appendChild(fragment);
  }

  function renderGenreTabs() {
    const fragment = document.createDocumentFragment();

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `genre-tab${state.selectedGenre === 'ALL' ? ' active' : ''}`;
    allBtn.dataset.genre = 'ALL';
    allBtn.innerHTML = `<span>すべて</span><span class="genre-tab-count">${state.allPhotos.length.toLocaleString()}</span>`;
    fragment.appendChild(allBtn);

    for (const genre of state.genres) {
      const count = state.genreCounts.get(genre.id) || 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `genre-tab${state.selectedGenre === genre.id ? ' active' : ''}`;
      btn.dataset.genre = genre.id;
      btn.innerHTML = `<span>${escapeHtml(genre.label)}</span><span class="genre-tab-count">${count.toLocaleString()}</span>`;
      fragment.appendChild(btn);
    }

    els.genreTabs.innerHTML = '';
    els.genreTabs.appendChild(fragment);
  }

  function updateGenreDescriptionBanner() {
    if (state.selectedGenre === 'ALL') {
      els.genreDescBar.hidden = true;
      return;
    }

    const genre = state.genreMap.get(state.selectedGenre);
    if (!genre) {
      els.genreDescBar.hidden = true;
      return;
    }

    els.genreDescCode.textContent = genre.id;
    els.genreDescTitle.textContent = genre.label;
    els.genreDescText.textContent = genre.description || '';
    els.genreDescBar.hidden = false;
  }

  function updateStatusAndChips() {
    const total = state.allPhotos.length;
    const matched = state.filteredPhotos.length;

    if (matched === total) {
      els.resultSummary.textContent = `全 ${total.toLocaleString()} 件を表示中`;
    } else {
      els.resultSummary.textContent = `${total.toLocaleString()} 件中 ${matched.toLocaleString()} 件が一致`;
    }

    const chips = [];

    if (state.selectedGenre !== 'ALL') {
      const genre = state.genreMap.get(state.selectedGenre);
      chips.push({
        type: 'genre',
        label: `ジャンル: ${genre ? genre.label : state.selectedGenre}`,
      });
    }

    if (state.selectedOwner !== 'ALL') {
      chips.push({
        type: 'owner',
        label: `アカウント: ${state.selectedOwner}`,
      });
    }

    if (state.searchQuery.trim()) {
      chips.push({
        type: 'search',
        label: `検索: 「${state.searchQuery.trim()}」`,
      });
    }

    els.activeFilterChips.innerHTML = chips
      .map(
        (c) =>
          `<span class="filter-chip">${escapeHtml(c.label)}<button type="button" data-clear-type="${c.type}" aria-label="この条件を解除">&times;</button></span>`
      )
      .join('');

    els.clearFiltersBtn.hidden = chips.length === 0;
  }

  function applyFiltersAndSort(preservePhotoId = null) {
    const tokens = state.searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const filtered = state.allPhotos.filter((photo) => {
      if (state.selectedGenre !== 'ALL' && photo.genre !== state.selectedGenre) {
        return false;
      }
      if (state.selectedOwner !== 'ALL' && photo.owner !== state.selectedOwner) {
        return false;
      }
      if (tokens.length > 0) {
        for (const token of tokens) {
          if (!photo.searchBlob.includes(token)) {
            return false;
          }
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (state.sortBy) {
        case 'archive-asc':
          return a.archiveNum - b.archiveNum;
        case 'taken-desc':
          return String(b.dateTaken || '').localeCompare(String(a.dateTaken || ''));
        case 'taken-asc':
          return String(a.dateTaken || '').localeCompare(String(b.dateTaken || ''));
        case 'archive-desc':
        default:
          return b.archiveNum - a.archiveNum;
      }
    });

    state.filteredPhotos = filtered;
    state.renderedCount = 0;
    els.photoGrid.innerHTML = '';

    renderGenreTabs();
    updateGenreDescriptionBanner();
    updateStatusAndChips();
    syncUrlParams(preservePhotoId);

    if (filtered.length === 0) {
      els.emptyState.hidden = false;
      els.loadMoreArea.hidden = true;
      return;
    }

    els.emptyState.hidden = true;
    renderNextBatch();
  }

  function createPhotoCard(photo, index) {
    const article = document.createElement('article');
    article.className = 'photo-card';
    article.tabIndex = 0;
    article.dataset.index = String(index);
    article.setAttribute('role', 'button');
    article.setAttribute('aria-label', `${photo.archiveNo} ${photo.title}`);

    const dateOnly = photo.dateTaken ? String(photo.dateTaken).slice(0, 10) : '';

    article.innerHTML = `
      <div class="card-thumb-wrap">
        <img
          class="card-thumb"
          src="${escapeHtml(photo.thumbUrl)}"
          alt="${escapeHtml(photo.title)}"
          loading="lazy"
          decoding="async"
        >
      </div>
      <div class="card-body">
        <div class="card-top-meta">
          <span class="card-archive-no">${escapeHtml(photo.archiveNo)}</span>
          <span class="card-genre-tag">${escapeHtml(photo.genreLabel)}</span>
        </div>
        <h2 class="card-title">${escapeHtml(photo.title)}</h2>
        <div class="card-date">${escapeHtml(dateOnly)}</div>
      </div>
    `;

    return article;
  }

  function renderNextBatch() {
    const total = state.filteredPhotos.length;
    if (state.renderedCount >= total) {
      els.loadMoreArea.hidden = true;
      return;
    }

    const nextEnd = Math.min(state.renderedCount + BATCH_SIZE, total);
    const fragment = document.createDocumentFragment();

    for (let i = state.renderedCount; i < nextEnd; i++) {
      fragment.appendChild(createPhotoCard(state.filteredPhotos[i], i));
    }

    els.photoGrid.appendChild(fragment);
    state.renderedCount = nextEnd;

    if (state.renderedCount < total) {
      els.loadProgressText.textContent = `${state.renderedCount.toLocaleString()} / ${total.toLocaleString()} 件を表示中`;
      els.loadMoreArea.hidden = false;
    } else {
      els.loadMoreArea.hidden = true;
    }
  }

  function openModal(index) {
    if (index < 0 || index >= state.filteredPhotos.length) {
      return;
    }

    state.activeModalIndex = index;
    state.isZoomed = false;
    els.modalStage.classList.remove('zoomed');
    els.modalZoomBtn.textContent = '原寸表示切替';

    const photo = state.filteredPhotos[index];

    els.modalArchiveNo.textContent = photo.archiveNo;
    els.modalTitle.textContent = photo.title;
    els.modalDescription.textContent = photo.description || '説明文はありません。';
    els.modalGenreBtn.textContent = photo.genreLabel;
    els.modalGenreBtn.dataset.genre = photo.genre;

    els.modalMetaArchive.textContent = photo.archiveNo;
    els.modalMetaTaken.textContent = photo.dateTaken || '—';
    els.modalMetaPublished.textContent = photo.publishedAt || '—';
    els.modalMetaOwner.textContent = photo.owner || '—';
    els.modalMetaLicense.innerHTML = formatLicense(photo.license);

    els.modalLargeLink.href = photo.largeUrl || photo.thumbUrl;
    els.modalFlickrLink.href = photo.flickrPageUrl || '#';

    // サムネイルを即座に描画した上で高解像度画像へ差し替え
    els.modalImage.alt = photo.title;
    els.modalImage.src = photo.thumbUrl;
    if (photo.largeUrl && photo.largeUrl !== photo.thumbUrl) {
      const loader = new Image();
      loader.onload = () => {
        if (state.activeModalIndex === index) {
          els.modalImage.src = photo.largeUrl;
        }
      };
      loader.src = photo.largeUrl;
    }

    els.modalTags.innerHTML = photo.tags
      .map((tag) => `<button type="button" class="tag-chip" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
      .join('');

    els.modalPrevBtn.disabled = index === 0;
    els.modalNextBtn.disabled = index >= state.filteredPhotos.length - 1;

    els.modal.hidden = false;
    document.body.classList.add('modal-open');
    syncUrlParams(photo.id);
  }

  function closeModal() {
    els.modal.hidden = true;
    document.body.classList.remove('modal-open');
    state.activeModalIndex = -1;
    state.isZoomed = false;
    els.modalStage.classList.remove('zoomed');
    syncUrlParams(null);
  }

  function resetAllFilters() {
    state.selectedGenre = 'ALL';
    state.selectedOwner = 'ALL';
    state.searchQuery = '';
    state.sortBy = 'archive-desc';
    els.ownerSelect.value = 'ALL';
    els.sortSelect.value = 'archive-desc';
    els.searchInput.value = '';
    els.searchClearBtn.hidden = true;
    applyFiltersAndSort();
  }

  function bindEvents() {
    els.resetAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      resetAllFilters();
    });

    els.genreTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.genre-tab');
      if (!btn) return;
      state.selectedGenre = btn.dataset.genre;
      applyFiltersAndSort();
    });

    els.ownerSelect.addEventListener('change', () => {
      state.selectedOwner = els.ownerSelect.value;
      applyFiltersAndSort();
    });

    els.sortSelect.addEventListener('change', () => {
      state.sortBy = els.sortSelect.value;
      applyFiltersAndSort();
    });

    els.searchInput.addEventListener('input', () => {
      const val = els.searchInput.value;
      els.searchClearBtn.hidden = val.length === 0;
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        state.searchQuery = val;
        applyFiltersAndSort();
      }, 180);
    });

    els.searchClearBtn.addEventListener('click', () => {
      els.searchInput.value = '';
      els.searchClearBtn.hidden = true;
      state.searchQuery = '';
      applyFiltersAndSort();
      els.searchInput.focus();
    });

    els.activeFilterChips.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-clear-type]');
      if (!btn) return;
      const type = btn.dataset.clearType;
      if (type === 'genre') {
        state.selectedGenre = 'ALL';
      } else if (type === 'owner') {
        state.selectedOwner = 'ALL';
        els.ownerSelect.value = 'ALL';
      } else if (type === 'search') {
        state.searchQuery = '';
        els.searchInput.value = '';
        els.searchClearBtn.hidden = true;
      }
      applyFiltersAndSort();
    });

    els.clearFiltersBtn.addEventListener('click', resetAllFilters);
    els.emptyResetBtn.addEventListener('click', resetAllFilters);

    els.loadMoreBtn.addEventListener('click', renderNextBatch);

    els.photoGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.photo-card');
      if (!card) return;
      openModal(Number(card.dataset.index));
    });

    els.photoGrid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.photo-card');
        if (!card) return;
        e.preventDefault();
        openModal(Number(card.dataset.index));
      }
    });

    els.modalCloseBtn.addEventListener('click', closeModal);

    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) {
        closeModal();
      }
    });

    els.modalPrevBtn.addEventListener('click', () => {
      if (state.activeModalIndex > 0) {
        openModal(state.activeModalIndex - 1);
      }
    });

    els.modalNextBtn.addEventListener('click', () => {
      if (state.activeModalIndex < state.filteredPhotos.length - 1) {
        openModal(state.activeModalIndex + 1);
      }
    });

    els.modalZoomBtn.addEventListener('click', () => {
      state.isZoomed = !state.isZoomed;
      els.modalStage.classList.toggle('zoomed', state.isZoomed);
      els.modalZoomBtn.textContent = state.isZoomed ? '画面サイズに合わせる' : '原寸表示切替';
    });

    els.modalGenreBtn.addEventListener('click', () => {
      const genreId = els.modalGenreBtn.dataset.genre;
      closeModal();
      state.selectedGenre = genreId;
      applyFiltersAndSort();
    });

    els.modalTags.addEventListener('click', (e) => {
      const tagBtn = e.target.closest('.tag-chip');
      if (!tagBtn) return;
      const tag = tagBtn.dataset.tag;
      closeModal();
      state.searchQuery = tag;
      els.searchInput.value = tag;
      els.searchClearBtn.hidden = false;
      applyFiltersAndSort();
    });

    els.copyCreditBtn.addEventListener('click', () => {
      const photo = state.filteredPhotos[state.activeModalIndex];
      if (!photo) return;
      const creditText = `「${photo.title}」（${photo.archiveNo}） / CC BY 4.0 (${photo.flickrPageUrl})`;
      copyToClipboard(creditText, 'クレジット表記をコピーしました');
    });

    els.copyEmbedBtn.addEventListener('click', () => {
      const photo = state.filteredPhotos[state.activeModalIndex];
      if (!photo) return;
      const embedHtml = `<figure><a href="${photo.flickrPageUrl}" target="_blank" rel="noopener"><img src="${photo.largeUrl}" alt="${photo.title}"></a><figcaption>${photo.title} (${photo.archiveNo}) / CC BY 4.0</figcaption></figure>`;
      copyToClipboard(embedHtml, 'HTML埋め込みコードをコピーしました');
    });

    els.copyUrlBtn.addEventListener('click', () => {
      copyToClipboard(window.location.href, 'この写真の共有URLをコピーしました');
    });

    document.addEventListener('keydown', (e) => {
      if (els.modal.hidden) return;
      if (e.key === 'Escape') {
        closeModal();
      } else if (e.key === 'ArrowLeft') {
        if (state.activeModalIndex > 0) {
          openModal(state.activeModalIndex - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (state.activeModalIndex < state.filteredPhotos.length - 1) {
          openModal(state.activeModalIndex + 1);
        }
      }
    });

    // スクロール末尾付近での自動追加読み込み
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !els.loadMoreArea.hidden) {
          renderNextBatch();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(els.loadMoreArea);
  }

  async function init() {
    bindEvents();

    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} (${response.statusText})`);
      }

      const data = await response.json();
      els.loadingState.hidden = true;

      buildIndexes(data);
      renderOwnerOptions();

      const initialPhotoId = restoreStateFromUrl();
      applyFiltersAndSort(initialPhotoId);

      if (initialPhotoId) {
        const targetIndex = state.filteredPhotos.findIndex((p) => p.id === initialPhotoId);
        if (targetIndex !== -1) {
          while (state.renderedCount <= targetIndex) {
            renderNextBatch();
          }
          openModal(targetIndex);
        }
      }
    } catch (err) {
      els.loadingState.hidden = true;
      els.errorState.hidden = false;
      els.errorDetailText.textContent =
        `${err.message} — ローカル環境で確認する場合は、ファイルを直接開く(file://)のではなく、VS Code の Live Server や "python -m http.server 8000" などのHTTPサーバー経由で開いてください。`;
    }
  }

  init();
})();