'use strict';

const { renderLayout } = require('./layout');
const { escapeHtml } = require('./components');

// Module-Verwaltungsseite: zeigt alle optionalen Module mit Status und Toggle.
function renderModules({ registry = [], enabledKeys = new Set(), message = '' } = {}) {
  const cards = registry
    .map((mod) => {
      const enabled = enabledKeys.has(mod.key);
      const statusLabel = enabled ? 'Aktiv' : 'Inaktiv';
      const statusClass = enabled ? 'module-status--on' : 'module-status--off';
      const actionLabel = enabled ? 'Deaktivieren' : 'Aktivieren';
      const actionClass = enabled ? 'button-danger' : '';
      const action = enabled
        ? `/module/${escapeHtml(mod.key)}/disable`
        : `/module/${escapeHtml(mod.key)}/enable`;

      return `          <div class="module-card">
            <div class="module-card-info">
              <div class="module-card-title">
                ${escapeHtml(mod.label)}
                <span class="module-status ${statusClass}">${statusLabel}</span>
              </div>
              <p class="module-card-desc">${escapeHtml(mod.description)}</p>
            </div>
            <form action="${action}" method="POST" class="module-card-action">
              <button type="submit" class="module-toggle-btn ${actionClass}">${actionLabel}</button>
            </form>
          </div>`;
    })
    .join('\n');

  const body = `        <h1>Module</h1>
        <p class="muted" style="margin-bottom: 20px;">Optionale Module können hier aktiviert oder deaktiviert werden. Aktivierte Module erscheinen in der Navigation.</p>
        ${message ? `<p class="module-message">${escapeHtml(message)}</p>` : ''}
        <div class="module-list">
${cards}
        </div>`;

  return renderLayout({ title: 'Module', activePath: '/module', body });
}

module.exports = renderModules;
