// Catalog of known/possible feature flags to assist admins when creating/updating flags.
// Each entry: { key, label, description, suggestedVariant? }

/** @type {Array<{key:string,label:string,description:string,suggestedVariant?:string}>} */
const KNOWN_FLAGS = [
  { key: 'purview_public', label: 'Purview öffentlich', description: 'Öffnet die Purview-Übersicht und APIs öffentlich sichtbar.' },
  { key: 'new_editor_ui', label: 'Neues Editor UI', description: 'Aktiviert neue Editor-Ansichten und verbesserte Medienauswahl.' },
  { key: 'ai_assist', label: 'AI Assist', description: 'Zeigt KI-Hilfen (Titel/Teaser/Tags) im Editor an.' },
  { key: 'media_thumb_worker', label: 'Thumbnails Worker', description: 'Hintergrund-Thumbnail-Generierung und Watcher aktivieren.' },
  { key: 'podcasts_audio_only_layout', label: 'Podcasts Audio-Layout', description: 'Vereinfachtes Audio-only Layout für Podcast-Seiten.' },
  { key: 'consent_banner', label: 'Cookie/Consent Banner', description: 'Blendet Consent-Banner auf öffentlichen Seiten ein.' },
  { key: 'csp_strict', label: 'Strengere CSP', description: 'Schaltet auf strengere CSP (keine inline Scripts) nach Soak-Test um.' },
  { key: 'blog_home_v2', label: 'Blog Home v2', description: 'Aktiviert die neue Blog-Startseite (Layout V2).', suggestedVariant: 'beta' },
  { key: 'timeline_permissions_v2', label: 'Timeline Berechtigungen v2', description: 'Neue Berechtigungslogik für Timeline-Editor aktivieren.' },
  { key: 'purview_tracking', label: 'Purview Tracking', description: 'Aktiviert anonymisierte Nutzungsmetriken für Purview.' }
];

module.exports = { KNOWN_FLAGS };
