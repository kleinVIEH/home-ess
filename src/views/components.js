'use strict';

// Kleine, wiederverwendbare HTML-Helfer für die dynamisch gerenderten Seiten.

// Escaping für Werte, die in HTML-Attribute oder -Text eingesetzt werden.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Statusmeldung (Fehler/Erfolg) — leerer String, wenn nichts anzuzeigen ist.
function statusText(message, kind = 'error') {
  if (!message) return '';
  const cls = kind === 'success' ? 'success-text' : 'error-text';
  return `<p class="${cls}">${escapeHtml(message)}</p>`;
}

module.exports = { escapeHtml, statusText };
