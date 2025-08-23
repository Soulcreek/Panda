// AOS nur initialisieren falls verfügbar (CSP / Lazy)
if (typeof AOS !== 'undefined') {
    AOS.init({ duration: 800, once: true });
}

// Globale Logik für die Medienbibliothek
const mediaLibraryModalEl = document.getElementById('mediaLibraryModal');
let mediaLibraryModal;
if (mediaLibraryModalEl) {
    mediaLibraryModal = new bootstrap.Modal(mediaLibraryModalEl);
}
let mediaLibraryCallback = null;
let selectedMedia = null;

async function openMediaLibraryModal(options) {
    if (!mediaLibraryModal) return;
    mediaLibraryCallback = options.callback;
    const grid = document.getElementById('media-library-grid');
    const sizeOptions = document.getElementById('media-size-options');
    const modalTitle = document.getElementById('mediaLibraryModalLabel');
    
    grid.innerHTML = '<div class="text-center"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    sizeOptions.style.display = 'none';
    selectedMedia = null;
    
    // Admin media API lives under /admin
    let apiUrl = '/admin/api/media';
    if (options.filter) {
        if(options.filter==='__featuredCombo'){ // clientseitig Banner + Titelbild
            modalTitle.textContent = 'Wähle Titel-/Bannerbild';
        } else {
            apiUrl += `?category=${encodeURIComponent(options.filter)}`;
            modalTitle.textContent = `Wähle aus Kategorie: "${options.filter}"`;
        }
    } else { modalTitle.textContent = 'Aus Medienbibliothek auswählen'; }

    mediaLibraryModal.show();

    try {
    const mediaItems = await apiFetch(apiUrl);
        
        grid.innerHTML = '';
        if (mediaItems.length === 0) {
            grid.innerHTML = `<p>Keine Medien in dieser Kategorie gefunden.</p>`;
            return;
        }

        const row = document.createElement('div');
        row.className = 'row g-3';
        
        mediaItems.forEach(item => {
            if(options.filter==='__featuredCombo'){
                const cat = (item.category||'').toLowerCase();
                if(!(cat==='banner' || cat==='titelbild')) return; // skip non matching
            }
            const col = document.createElement('div');
            col.className = 'col-6 col-sm-4 col-md-3 col-lg-2';
            const card = document.createElement('div');
            card.className = 'card h-100 media-library-item d-flex align-items-center justify-content-center';
            card.style.cursor = 'pointer';
            card.dataset.id = item.id;
            const filename = item.name || item.filename || (item.path? item.path.split('/').pop(): '');
            card.dataset.filename = filename;
            card.dataset.path = item.path;
            card.dataset.alttext = item.alt_text || '';
            if(item.type && item.type.startsWith('image/')){
                const img = document.createElement('img');
                const filename = item.name || item.filename || (item.path? item.path.split('/').pop(): '');
                // Use thumbnails with fallback to placeholder
                const thumbnailSrc = '/uploads/thumbnails/' + filename;
                img.src = thumbnailSrc;
                img.onerror = function() {
                    this.onerror = null; // Prevent infinite loop
                    this.src = '/uploads/placeholders/placeholder.svg';
                };
                img.className = 'card-img-top';
                img.style.height = '120px';
                img.style.objectFit = 'contain';
                img.style.padding = '10px';
                img.alt = item.alt_text || filename;
                card.appendChild(img);
            } else if(item.type && item.type.startsWith('audio/')){
                const wrap = document.createElement('div');
                wrap.className = 'text-center p-3';
                wrap.innerHTML = '<i class="bi bi-music-note-beamed fs-2"></i><div class="small text-muted text-truncate mw-100">'+filename+'</div>';
                card.appendChild(wrap);
            } else {
                const wrap = document.createElement('div');
                wrap.className = 'text-center p-3';
                wrap.innerHTML = '<i class="bi bi-file-earmark fs-2"></i><div class="small text-muted">'+filename+'</div>';
                card.appendChild(wrap);
            }
            col.appendChild(card);
            row.appendChild(col);
        });
        grid.appendChild(row);

        document.querySelectorAll('.media-library-item').forEach(item => {
            item.addEventListener('click', function() {
                document.querySelectorAll('.media-library-item').forEach(el => el.classList.remove('border-primary', 'border-3'));
                this.classList.add('border-primary', 'border-3');

                selectedMedia = {
                    id: this.dataset.id,
                    filename: this.dataset.filename,
                    path: this.dataset.path,
                    alt: this.dataset.alttext
                };

                if (options.tinyMCE) {
                    sizeOptions.style.display = 'flex';
                } else {
                    if(options && options.returnObject){
                        mediaLibraryCallback(selectedMedia);
                    } else {
                        mediaLibraryCallback(selectedMedia.filename);
                    }
                    mediaLibraryModal.hide();
                }
            });
        });

    } catch (error) {
        grid.innerHTML = '<p>Fehler beim Laden der Medienbibliothek.</p>';
        console.error(error);
    }
}

// Event listener für Größen-Buttons im Media-Modal
document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        if (mediaLibraryCallback && selectedMedia) {
            const size = this.dataset.size;
            let width = '';
            if (size === 'small') width = '300';
            if (size === 'medium') width = '600';
            
            const html = `<img src="/uploads/${selectedMedia.filename}" alt="${selectedMedia.alt}" ${width ? `width="${width}"` : ''} />`;
            mediaLibraryCallback(html);
            mediaLibraryModal.hide();
        }
    });
});

// Event Listeners für alle interaktiven Elemente
document.addEventListener('DOMContentLoaded', () => {

    // TinyMCE entfernt. Platzhalter: Falls künftig Editor-API benötigt wird, hier hook einfügen.

    // Blog-Post-Modal
    const blogPostModalEl = document.getElementById('blogPostModal');
    if (blogPostModalEl) {
        blogPostModalEl.addEventListener('show.bs.modal', async (event) => {
            const button = event.relatedTarget;
            const postId = button.getAttribute('data-post-id');
            const modalTitle = blogPostModalEl.querySelector('.modal-title');
            const modalImage = blogPostModalEl.querySelector('#modal-post-image');
            const modalContent = blogPostModalEl.querySelector('#modal-post-content');
            const modalTags = blogPostModalEl.querySelector('#modal-post-tags');
            
            modalTitle.textContent = 'Lade Beitrag...';
            modalContent.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
            modalTags.innerHTML = '';
            modalImage.style.display = 'none';

            try {
                const post = await apiFetch(`/api/blog/${postId}`);
                if(!post || !post.content){ console.warn('Leerer Post API Response', post); }
                modalTitle.textContent = post.title;
                modalContent.innerHTML = `<div class="blog-post-content">${post.content}</div>`;
                if (post.image_path) {
                    modalImage.src = post.image_path;
                    modalImage.style.display = 'block';
                }
                if (post.tags) {
                    let tagsHtml = '<strong>Tags:</strong> ';
                    post.tags.split(',').forEach(tag => {
                        tagsHtml += `<a href="/blog/tag/${tag}" class="btn btn-sm btn-outline-secondary me-1">${tag}</a>`;
                    });
                    modalTags.innerHTML = tagsHtml;
                }
            } catch (error) {
                console.error('Blog Modal Fehler:', error);
                modalTitle.textContent = 'Fehler';
                modalContent.innerHTML = '<p class="text-danger">Der Beitrag konnte nicht geladen werden ('+error.message+').</p>';
                const dbg = document.createElement('pre'); dbg.className='small text-muted'; dbg.textContent='ID '+postId+' Fehler: '+error.message; modalContent.appendChild(dbg);
            }
        });
    }
    // Prevent double-submit on media upload form(s)
    try {
        const mediaForms = document.querySelectorAll('#media-upload-form');
        mediaForms.forEach(form => {
            form.addEventListener('submit', function (e) {
                const btn = form.querySelector('#mediaUploadBtn');
                if (!btn) return; // no wired button
                if (btn.dataset.submitted === '1') {
                    e.preventDefault();
                    return false;
                }
                // mark and show spinner
                btn.dataset.submitted = '1';
                btn.disabled = true;
                const spinner = btn.querySelector('.spinner-border');
                const label = btn.querySelector('.btn-label');
                if (spinner) spinner.classList.remove('d-none');
                if (label) label.textContent = 'Upload läuft...';
                // Let the form submit normally; in case of network error server will reload page
                // If JS needs to re-enable (e.g., on AJAX), you'd call btn.dataset.submitted='0' and hide spinner
            });
        });
    } catch (e) { console.warn('Media form binding failed', e); }

    // KI Content Generator
    const generateBtn = document.getElementById('generate-content-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', async function() {
            const spinner = this.querySelector('.spinner-border');
            this.disabled = true;
            spinner.classList.remove('d-none');
            try {
                const data = await apiFetch('/admin/generate-whats-new', { method:'POST', headers:{'CSRF-Token': (window.CSRF_TOKEN||'')} });
                document.getElementById('title_de').value = data.title_de;
                const elDe=document.getElementById('content_de'); if(elDe) elDe.value = data.content_de;
                document.getElementById('title_en').value = data.title_en;
                const elEn=document.getElementById('content_en'); if(elEn) elEn.value = data.content_en;
            } catch (error) {
                // Fallback: einfacher kostenloser Platzhalter (statisch / heuristisch)
                const fallbackSource = 'Fallback Local Template';
                const now = new Date().toLocaleDateString('de-DE');
                const fbTitle = 'Aktuelle Data Security Notizen ('+now+')';
                const fbContent = '<p>Dieser Inhalt wurde als Fallback generiert, da der KI-Dienst nicht verfügbar war. Kurzer Überblick über aktuelle Trends: Zero Trust, Datenklassifizierung, automatisierte Compliance-Überwachung.</p>';
                alert("Der Inhalt konnte nicht generiert werden ("+ error.message + "). Fallback verwendet: " + fallbackSource);
                const elDe2=document.getElementById('content_de'); if(elDe2){ document.getElementById('title_de').value = fbTitle; elDe2.value = fbContent; }
            } finally {
                this.disabled = false;
                spinner.classList.add('d-none');
            }
        });
    }

    // "The Panda's Way" Level Umschalter
    const levelSwitcher = document.getElementById('level-switcher');
    if (levelSwitcher) {
        const savedLevel = localStorage.getItem('pandasWayLevel') || '2';

        function setLevel(level) {
            document.querySelectorAll('.level-btn').forEach(btn => {
                btn.classList.remove('active', 'btn-primary');
                btn.classList.add('btn-outline-primary');
            });
            const activeButton = document.querySelector(`.level-btn[data-level='${level}']`);
            if (activeButton) {
                activeButton.classList.add('active', 'btn-primary');
                activeButton.classList.remove('btn-outline-primary');
            }
            
            document.querySelectorAll('.level-content').forEach(content => {
                content.style.display = 'none';
            });
            const newContent = document.getElementById(`level-${level}`);
            if (newContent) {
                newContent.style.display = 'block';
                AOS.refresh();
            }
            localStorage.setItem('pandasWayLevel', level);
        }

        setLevel(savedLevel);

        levelSwitcher.addEventListener('click', function(e) {
            if (e.target.classList.contains('level-btn')) {
                setLevel(e.target.dataset.level);
            }
        });
    }
    
    // Event Listener für Alt-Text-Generierung
        const generateAltTextBtn = document.getElementById('generate-alt-text-btn');
        const mediaFilesInput = document.getElementById('mediaFiles');
        const altTextInput = document.getElementById('altText');
        const descInput = document.getElementById('mediaDescription');
        if (generateAltTextBtn && mediaFilesInput) {
            const lblIdle = generateAltTextBtn.querySelector('.label-idle');
            const lblWorking = generateAltTextBtn.querySelector('.label-working');
            const lblDone = generateAltTextBtn.querySelector('.label-done');
            const spinner = generateAltTextBtn.querySelector('.spinner-border');
            const hint = document.getElementById('altGenHint');
            function setState(s){
                generateAltTextBtn.dataset.state = s;
                [lblIdle,lblWorking,lblDone].forEach(el=>el && el.classList.add('d-none'));
                if(s==='idle' && lblIdle) lblIdle.classList.remove('d-none');
                if(s==='working' && lblWorking) lblWorking.classList.remove('d-none');
                if(s==='done' && lblDone) lblDone.classList.remove('d-none');
                if(spinner) spinner.classList.toggle('d-none', s!=='working');
            }
            function updateBtnState() {
                const count = mediaFilesInput.files ? mediaFilesInput.files.length : 0;
                generateAltTextBtn.disabled = count !== 1;
                if(hint){
                    if(count===1){ hint.textContent = 'Bereit: KI kann ALT & Beschreibung generieren.'; }
                    else if(count>1){ hint.textContent='Mehrfachauswahl: KI deaktiviert (wähle genau 1 Datei).'; }
                    else { hint.textContent='Wähle genau eine Bilddatei für KI ALT-Generierung.'; }
                }
                if(count!==1) setState('idle');
            }
            mediaFilesInput.addEventListener('change', updateBtnState);
            updateBtnState();
            generateAltTextBtn.addEventListener('click', async function() {
                if (this.disabled || !(mediaFilesInput.files && mediaFilesInput.files.length === 1)) return;
                const filename = mediaFilesInput.files[0].name;
                setState('working'); this.disabled = true;
                try {
                    const data = await apiFetch('/admin/generate-alt-text', { json:{ filename }, csrf:true });
                    if (altTextInput && !altTextInput.value) altTextInput.value = data.alt;
                    if (descInput && !descInput.value) descInput.value = data.description;
                    setState('done');
                    setTimeout(()=>{ setState('idle'); updateBtnState(); }, 1800);
                } catch(e){
                    const base = filename.replace(/[-_]/g,' ').replace(/\.[a-zA-Z0-9]+$/,'');
                    const simpleAlt = 'Bild: '+ base.substring(0,60);
                    const simpleDesc = 'Auto-Fallback Beschreibung zu '+ base.substring(0,50);
                    if (altTextInput && !altTextInput.value) altTextInput.value = simpleAlt;
                    if (descInput && !descInput.value) descInput.value = simpleDesc;
                    alert('KI Fehler: '+ e.message + ' – Fallback verwendet.');
                    setState('idle');
                } finally { this.disabled = false; updateBtnState(); }
            });
        }

        // Kategorie-Filter in Medienbibliothek (Clientseitig)
        const mediaCategoryFilters = document.getElementById('media-category-filters');
            const mediaTypeFilter = document.getElementById('media-type-filter');
        if (mediaCategoryFilters) {
            mediaCategoryFilters.addEventListener('click', e => {
                const btn = e.target.closest('button[data-cat]');
                if (!btn) return;
                e.preventDefault();
                const cat = btn.dataset.cat;
                mediaCategoryFilters.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
                btn.classList.add('active');
                    document.querySelectorAll('.media-grid-item').forEach(item => {
                    const icat = item.dataset.category || '';
                        item.style.display = (cat === 'all' || icat === cat) ? '' : 'none';
                });
            });
        }
            if(mediaTypeFilter){
                mediaTypeFilter.addEventListener('click', e=>{
                    const btn = e.target.closest('button[data-type]'); if(!btn) return;
                    mediaTypeFilter.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
                    btn.classList.add('active');
                    const t = btn.dataset.type;
                    document.querySelectorAll('.media-grid-item').forEach(card=>{
                        const img = card.querySelector('img');
                        const isImage = !!img;
                        const isAudio = card.querySelector('.bi-music-note-beamed') !== null;
                        if(t==='all' || (t==='image' && isImage) || (t==='audio' && isAudio)) card.style.display=''; else card.style.display='none';
                    });
                });
            }

    // Admin-Buttons (Delegation)
    document.addEventListener('click', async function(e) {
        const target = e.target.closest('button');
        if (!target) return;

        if (target.classList.contains('copy-media-link-btn')) {
            const linkToCopy = window.location.origin + target.dataset.link;
            navigator.clipboard.writeText(linkToCopy).then(() => {
                const originalText = target.innerHTML;
                target.innerHTML = 'Kopiert!';
                setTimeout(() => { target.innerHTML = originalText; }, 1500);
            });
        }
        if (target.classList.contains('toggle-visibility-btn')) {
            const postId = target.dataset.id;
            const resp = await apiFetch(`/admin/post/toggle-visibility/${postId}`, { method:'POST', csrf:true });
            if (resp && resp.ok !== false) window.location.reload();
        }
        if (target.classList.contains('delete-post-btn')) {
            if (confirm('Sind Sie sicher, dass Sie diesen Beitrag löschen möchten? Er wird nur archiviert.')) {
                const postId = target.dataset.id;
                const resp = await apiFetch(`/admin/post/delete/${postId}`, { method:'POST', csrf:true });
                if (resp && resp.ok !== false) document.getElementById(`post-card-${postId}`).remove();
            }
        }
        if (target.classList.contains('toggle-featured-btn')) {
            const postId = target.dataset.id;
            const resp = await apiFetch(`/admin/post/toggle-featured/${postId}`, { method:'POST', csrf:true });
            if (resp && resp.ok !== false) window.location.reload();
        }
        if (target.classList.contains('media-filter-btn')) {
            const category = target.dataset.category;
            document.querySelectorAll('.media-filter-btn').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            document.querySelectorAll('#media-quick-access-grid .media-item').forEach(item => {
                if (category === 'all' || item.dataset.itemCategory === category) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        }
        if (target.classList.contains('translate-btn')) {
            target.disabled = true;
            const spinner = document.createElement('span');
            spinner.className = 'spinner-border spinner-border-sm me-1';
            target.prepend(spinner);

            const translate = async (text) => {
                if (!text || text.trim() === '') return '';
                const data = await apiFetch('/admin/translate-content', { json:{ text }, csrf:true });
                return data.translation;
            };

            try {
                // Translate Title
                const titleSourceId = target.dataset.titleSource;
                const titleTargetId = target.dataset.titleTarget;
                const titleToTranslate = document.getElementById(titleSourceId).value;
                const translatedTitle = await translate(titleToTranslate);
                document.getElementById(titleTargetId).value = translatedTitle;

                // Translate Content
                const contentSourceId = target.dataset.source;
                const contentTargetId = target.dataset.target;
                const sourceEl=document.getElementById(contentSourceId); const contentToTranslate = sourceEl ? sourceEl.value : '';
                const translatedContent = await translate(contentToTranslate);
                const targetEl=document.getElementById(contentTargetId); if(targetEl) targetEl.value = translatedContent;
                
            } catch (error) {
                alert('Übersetzung fehlgeschlagen: ' + error.message);
            } finally {
                target.disabled = false;
                spinner.remove();
            }
        }
    });

    // Titelbild aus Bibliothek wählen
    const selectFromLibraryBtn = document.getElementById('select-from-library-btn');
    if (selectFromLibraryBtn) {
        selectFromLibraryBtn.addEventListener('click', function() {
            openMediaLibraryModal({
                filter: 'Blog-Titelbild',
                callback: function(filename) {
                    document.getElementById('selectedTitleImage').value = filename;
                    const preview = document.getElementById('titleImagePreview');
                    preview.src = '/uploads/' + filename;
                    preview.style.display = 'block';
                    document.getElementById('titleImageUpload').value = ''; 
                }
            });
        });
    }
});

// Theme Toggle (Dark/Light Mode) - run immediately so it also works if DOMContentLoaded already fired
(function(){
    const btn = document.getElementById('themeToggleBtn');
    if(!btn) return; // no button present
    const icon = document.getElementById('themeToggleIcon');

    function applyTheme(mode){
        if(mode==='dark'){
            document.documentElement.classList.add('dark-mode');
            btn.setAttribute('aria-pressed','true');
            if(icon){ icon.classList.remove('bi-moon-stars'); icon.classList.add('bi-sun'); }
            btn.title = 'Light Mode';
        } else {
            document.documentElement.classList.remove('dark-mode');
            btn.setAttribute('aria-pressed','false');
            if(icon){ icon.classList.add('bi-moon-stars'); icon.classList.remove('bi-sun'); }
            btn.title = 'Dark Mode';
        }
    }

    // Determine initial mode: prefer existing class (server-side / early script), else stored, else system
    let initialMode = document.documentElement.classList.contains('dark-mode') ? 'dark' : null;
    if(!initialMode){
        try { initialMode = localStorage.getItem('pp_theme'); } catch(e){}
    }
    if(!initialMode || initialMode==='system'){
        initialMode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
    }
    applyTheme(initialMode);

    btn.addEventListener('click', function(){
        const cur = document.documentElement.classList.contains('dark-mode') ? 'dark':'light';
        const next = cur==='dark' ? 'light':'dark';
        applyTheme(next);
        try { localStorage.setItem('pp_theme', next); } catch(e){}
        queuePrefSync();
    });

    // Expose for other scripts if needed
    window.__applyTheme = applyTheme;
})();

// Sync Preferences (theme & pandasWayLevel) to server if logged in and consent given
function getConsent(){
    try{
        const raw = localStorage.getItem('pp_cookie_consent_v1');
        if(!raw) return null;
        try{ const parsed = JSON.parse(raw); return parsed; }catch(e){
            // legacy value support ('all' or 'necessary')
            if(raw==='all') return { legacy:true, categories:{ necessary:true, preferences:true, analytics:true } };
            if(raw==='necessary') return { legacy:true, categories:{ necessary:true, preferences:false, analytics:false } };
            return null;
        }
    }catch(e){ return null; }
}

function queuePrefSync(){
    if(!window.__prefSyncScheduled){
        window.__prefSyncScheduled = true;
        setTimeout(doPrefSync, 800);
    }
}
async function doPrefSync(){
    window.__prefSyncScheduled = false;
    try {
        const consent = getConsent();
        if(!consent) return; // no decision yet
        // Only sync prefs if preferences category is allowed (support legacy 'all')
        const allowPref = consent.categories ? Boolean(consent.categories.preferences) : (consent==='all');
        if(!allowPref) return;
        const theme = localStorage.getItem('pp_theme') || 'system';
        const lvl = localStorage.getItem('pandasWayLevel') || localStorage.getItem('pandasWayLevelAlt5') || '1';
        // Heuristik: user logged in? server injected flag via data attr on body maybe future; fallback: attempt and ignore 401
        try {
            await apiFetch('/api/user/preferences', { method:'POST', json:{ theme, pandas_way_level: lvl }, csrf:true });
        } catch(e){ if(!(e && e.message && e.message.includes('401'))) console.warn('Pref Sync Fehler', e.message); }
    } catch(e){ console.warn('Pref Sync Exception', e); }
}
document.addEventListener('DOMContentLoaded', ()=>{
    // If preferences from server were injected we could apply them earlier (placeholder for future server->client hydration)
    queuePrefSync();
});

// If consent changes (new structured consent object written), trigger a pref sync if allowed
window.addEventListener('pp:consent', function(ev){
    try{ const detail = ev && ev.detail; if(detail && detail.categories && detail.categories.preferences){ queuePrefSync(); } }catch(e){}
});

// Featured Image Auswahl (Admin Post Editor) über globales Modal
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('selectFeaturedBtn');
        // Inline Buttons (above editor)
        const inlineSelect = document.getElementById('inlineSelectFeaturedBtn');
        const inlineClear = document.getElementById('inlineClearFeaturedBtn');
        if(inlineSelect){
            inlineSelect.addEventListener('click', ()=>{
                openMediaLibraryModal({ filter:'__featuredCombo', returnObject:true, callback:(media)=>{
                    const hidden = document.getElementById('featured_image_id');
                    hidden.value = media.id || '';
                    document.getElementById('inlineFeaturedName').textContent = media.path ? media.path.split('/').pop() : media.filename;
                    // Falls der seitliche Preview vorhanden ist, aktualisieren
                    const preview = document.getElementById('featuredPreview'); if(preview){ preview.src = media.path || ('/uploads/'+media.filename); preview.classList.remove('d-none'); }
                    const wrapper = document.getElementById('featuredPreviewWrapper'); if(wrapper) wrapper.classList.remove('d-none');
                }});
            });
        }
        if(inlineClear){
            inlineClear.addEventListener('click', ()=>{
                document.getElementById('featured_image_id').value='';
                document.getElementById('inlineFeaturedName').textContent='Keines gewählt';
            });
        }
    if(btn){
        btn.addEventListener('click', ()=>{
            openMediaLibraryModal({ filter:'__featuredCombo', returnObject:true, callback:(media)=>{
                const hidden = document.getElementById('featured_image_id');
                hidden.value = media.id || '';
                const preview = document.getElementById('featuredPreview');
                const imgPath = media.path ? media.path.replace(/^\.\/?httpdocs\//,'') : '/uploads/'+media.filename;
                preview.src = imgPath.startsWith('/uploads')? imgPath : ('/uploads/'+media.filename);
                preview.classList.remove('d-none');
                document.getElementById('featuredPreviewWrapper').classList.remove('d-none');
                const hint = document.getElementById('noFeaturedHint'); if(hint) hint.style.display='none';
            }});
        });
    }
    const clearBtn = document.getElementById('clearFeaturedBtn');
    if(clearBtn){
        clearBtn.addEventListener('click', ()=>{
            document.getElementById('featured_image_id').value='';
            document.getElementById('featuredPreview').classList.add('d-none');
            const hint = document.getElementById('noFeaturedHint'); if(hint) hint.style.display='';
        });
    }
    // Mini Media Filter
    const miniFilter = document.getElementById('mini-media-filter');
    if(miniFilter){
        miniFilter.addEventListener('click', e=>{
            const btnEl = e.target.closest('button[data-cat]'); if(!btnEl) return;
            miniFilter.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
            btnEl.classList.add('active');
            const cat = btnEl.dataset.cat;
            document.querySelectorAll('#mini-media-grid .mini-media-item').forEach(item=>{
                const icat = item.getAttribute('data-cat')||'';
                item.style.display = (cat==='all'||icat===cat)?'':'none';
            });
        });
    }
});
