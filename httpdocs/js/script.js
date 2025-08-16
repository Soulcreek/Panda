// Initialisiert die "Animate On Scroll" Bibliothek
AOS.init({
    duration: 800,
    once: true,
});

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
    
    let apiUrl = '/api/media';
    if (options.filter) {
        apiUrl += `?category=${encodeURIComponent(options.filter)}`;
        modalTitle.textContent = `Wähle aus Kategorie: "${options.filter}"`;
    } else {
        modalTitle.textContent = 'Aus Medienbibliothek auswählen';
    }

    mediaLibraryModal.show();

    try {
        const response = await fetch(apiUrl);
        const mediaItems = await response.json();
        
        grid.innerHTML = '';
        if (mediaItems.length === 0) {
            grid.innerHTML = `<p>Keine Medien in dieser Kategorie gefunden.</p>`;
            return;
        }

        const row = document.createElement('div');
        row.className = 'row g-3';
        
        mediaItems.forEach(item => {
            const col = document.createElement('div');
            col.className = 'col-6 col-sm-4 col-md-3 col-lg-2';
            
            const card = document.createElement('div');
            card.className = 'card h-100 media-library-item';
            card.style.cursor = 'pointer';
            card.dataset.filename = item.filename;
            card.dataset.alttext = item.alt_text || '';

            const img = document.createElement('img');
            img.src = `/uploads/${item.filename}`;
            img.className = 'card-img-top';
            img.style.height = '120px';
            img.style.objectFit = 'contain';
            img.style.padding = '10px';
            img.alt = item.alt_text;

            card.appendChild(img);
            col.appendChild(card);
            row.appendChild(col);
        });
        grid.appendChild(row);

        document.querySelectorAll('.media-library-item').forEach(item => {
            item.addEventListener('click', function() {
                document.querySelectorAll('.media-library-item').forEach(el => el.classList.remove('border-primary', 'border-3'));
                this.classList.add('border-primary', 'border-3');

                selectedMedia = {
                    filename: this.dataset.filename,
                    alt: this.dataset.alttext
                };

                if (options.tinyMCE) {
                    sizeOptions.style.display = 'flex';
                } else {
                    mediaLibraryCallback(selectedMedia.filename);
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

    if (typeof tinymce !== 'undefined' && (document.querySelector('textarea#content_de') || document.querySelector('textarea#content_de_edit'))) {
        tinymce.init({
            selector: 'textarea#content_de, textarea#content_en, textarea#content_de_edit, textarea#content_en_edit',
            plugins: 'code table lists image link media',
            toolbar: 'undo redo | blocks | bold italic | alignleft aligncenter alignright | indent outdent | bullist numlist | code | table | image link media',
            menubar: false,
            height: 350,
            image_advtab: true,
            file_picker_callback: function(callback, value, meta) {
                if (meta.filetype === 'image') {
                    openMediaLibraryModal({
                        tinyMCE: true,
                        callback: function(html) {
                           const editor = tinymce.activeEditor;
                           editor.execCommand('mceInsertContent', false, html);
                        }
                    });
                }
            }
        });
    }

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
                const response = await fetch(`/api/blog/${postId}`);
                if (!response.ok) throw new Error('Post not found');
                const post = await response.json();
                modalTitle.textContent = post.title;
                modalContent.innerHTML = `<div class="blog-post-content">${post.content}</div>`;
                if (post.image_filename) {
                    modalImage.src = `/uploads/${post.image_filename}`;
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
                modalTitle.textContent = 'Fehler';
                modalContent.textContent = 'Der Beitrag konnte nicht geladen werden.';
            }
        });
    }

    // KI Content Generator
    const generateBtn = document.getElementById('generate-content-btn');
    if (generateBtn) {
        generateBtn.addEventListener('click', async function() {
            const spinner = this.querySelector('.spinner-border');
            this.disabled = true;
            spinner.classList.remove('d-none');
            try {
                const response = await fetch('/admin/generate-whats-new', { method: 'POST' });
                const data = await response.json();
                if (!response.ok) throw new Error(data.details || data.error);
                document.getElementById('title_de').value = data.title_de;
                tinymce.get('content_de').setContent(data.content_de);
                document.getElementById('title_en').value = data.title_en;
                tinymce.get('content_en').setContent(data.content_en);
            } catch (error) {
                alert("Der Inhalt konnte nicht generiert werden: " + error.message);
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

    if (generateAltTextBtn && mediaFilesInput) {
        // Button bei mehr als einer Datei de-/aktivieren
        mediaFilesInput.addEventListener('change', () => {
            if (mediaFilesInput.files.length > 1) {
                generateAltTextBtn.disabled = true;
            } else {
                generateAltTextBtn.disabled = false;
            }
        });

        generateAltTextBtn.addEventListener('click', async function() {
            const altTextInput = document.getElementById('altText');
            const spinner = this.querySelector('.spinner-border');

            if (!mediaFilesInput.files || mediaFilesInput.files.length === 0) {
                alert('Bitte wählen Sie zuerst eine Bilddatei aus.');
                return;
            }
            if (mediaFilesInput.files.length > 1) {
                alert('Die automatische Text-Generierung funktioniert nur für einzelne Bilder.');
                return;
            }

            this.disabled = true;
            spinner.classList.remove('d-none');
            
            const formData = new FormData();
            formData.append('image', mediaFilesInput.files[0]);

            try {
                const response = await fetch('/admin/generate-alt-text', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.details || data.error || 'Unbekannter Fehler');
                }
                altTextInput.value = data.altText;
            } catch (error) {
                alert('Fehler beim Generieren des Alternativtextes: ' + error.message);
            } finally {
                this.disabled = false;
                spinner.classList.add('d-none');
            }
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
            const response = await fetch(`/admin/post/toggle-visibility/${postId}`, { method: 'POST' });
            if (response.ok) window.location.reload();
        }
        if (target.classList.contains('delete-post-btn')) {
            if (confirm('Sind Sie sicher, dass Sie diesen Beitrag löschen möchten? Er wird nur archiviert.')) {
                const postId = target.dataset.id;
                const response = await fetch(`/admin/post/delete/${postId}`, { method: 'POST' });
                if (response.ok) document.getElementById(`post-card-${postId}`).remove();
            }
        }
        if (target.classList.contains('toggle-featured-btn')) {
            const postId = target.dataset.id;
            const response = await fetch(`/admin/post/toggle-featured/${postId}`, { method: 'POST' });
            if (response.ok) window.location.reload();
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
                const response = await fetch('/admin/translate-content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.details || 'Translation failed');
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
                const contentToTranslate = tinymce.get(contentSourceId).getContent({ format: 'html' });
                const translatedContent = await translate(contentToTranslate);
                tinymce.get(contentTargetId).setContent(translatedContent);
                
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
