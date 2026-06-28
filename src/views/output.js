'use strict';

const { renderLayout } = require('./layout');
const { escapeHtml, statusText } = require('./components');

function renderOutput({
  outputs = [],
  internalValues = [],
  formMessage = '',
  formError = '',
  dialogMode = '',
  dialogError = '',
  dialogValues = null,
  editingOutputId = null,
} = {}) {
  const body = `        <h1>Output</h1>

        <div class="panel-card">
          <div class="panel-head">
            <div>
              <h2>Outputs</h2>
              <p class="muted">Jeder Output schreibt einen internen Wert an ein Ziel-Topic im ioBroker. Der Wert wird beim Anlegen, Bearbeiten und bei jeder Wertaenderung uebergeben.</p>
            </div>
            <button type="button" class="settings-form button-inline" onclick="openOutputDialog('add')">Hinzufuegen</button>
          </div>
          ${statusText(formError)}
          ${statusText(formMessage, 'success')}
          ${outputs.length ? renderOutputList(outputs) : '<div class="info-card"><p class="muted">Noch kein Output angelegt.</p></div>'}
        </div>

        ${renderOutputDialog({ internalValues, dialogError, dialogValues, dialogMode, editingOutputId })}
        ${renderDeleteDialog()}`;

  const script = `    const outputs = ${JSON.stringify(outputs.map(serializeOutputForClient))};
    const initialDialogMode = ${JSON.stringify(dialogMode)};
    const initialEditingOutputId = ${editingOutputId == null ? 'null' : Number(editingOutputId)};
    const initialDialogValues = ${JSON.stringify(dialogValues || {})};

    function openOutputDialog(mode, outputId) {
      var dialog = document.getElementById('outputDialog');
      if (!dialog) return;
      var form = document.getElementById('outputForm');
      var title = document.getElementById('outputDialogTitle');
      var output = outputs.find(function (item) { return item.id === outputId; }) || null;

      if (mode === 'edit' && output) {
        form.action = '/output/outputs/' + output.id;
        title.textContent = 'Output bearbeiten';
        setOutputFormValues(output);
      } else {
        form.action = '/output/outputs';
        title.textContent = 'Output hinzufuegen';
        setOutputFormValues({ sourceId: '', targetTopic: '' });
      }

      if (typeof dialog.showModal === 'function') dialog.showModal();
    }

    function setOutputFormValues(values) {
      document.getElementById('outputSourceId').value = values.sourceId || '';
      document.getElementById('outputTargetTopic').value = values.targetTopic || '';
    }

    function closeOutputDialog() {
      var dialog = document.getElementById('outputDialog');
      if (dialog) dialog.close();
    }

    function openDeleteDialog(outputId, outputLabel) {
      var dialog = document.getElementById('deleteOutputDialog');
      if (!dialog) return;
      document.getElementById('deleteOutputName').textContent = outputLabel;
      document.getElementById('deleteOutputForm').action = '/output/outputs/' + outputId + '/delete';
      if (typeof dialog.showModal === 'function') dialog.showModal();
    }

    function closeDeleteDialog() {
      var dialog = document.getElementById('deleteOutputDialog');
      if (dialog) dialog.close();
    }

    async function refreshOutputValues() {
      try {
        var response = await fetch('/output/data', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        var data = await response.json();
        data.outputs.forEach(function (output) {
          var node = document.getElementById('output-value-' + output.id);
          if (node) node.textContent = output.currentDisplay == null ? '—' : output.currentDisplay;
        });
      } catch (_) {
        // Anzeige bleibt auf dem letzten gueltigen Stand.
      }
    }

    if (initialDialogMode === 'add') {
      openOutputDialog('add');
      setOutputFormValues(initialDialogValues);
    } else if (initialDialogMode === 'edit' && initialEditingOutputId != null) {
      openOutputDialog('edit', initialEditingOutputId);
      setOutputFormValues(initialDialogValues);
    }

    refreshOutputValues();
    window.addEventListener('homeess:mqtt', refreshOutputValues);
    setInterval(refreshOutputValues, 60000);`;

  return renderLayout({ title: 'Output', activePath: '/output', body, script });
}

function renderOutputList(outputs) {
  const sorted = [...outputs].sort((a, b) =>
    String(a.label || a.sourceId).localeCompare(String(b.label || b.sourceId), 'de')
  );
  return `<div class="output-list">
${sorted.map(renderOutputRow).join('\n')}
          </div>`;
}

function renderOutputRow(output) {
  const label = output.label || output.sourceId;
  const currentDisplay = output.currentDisplay == null ? '—' : output.currentDisplay;
  return `            <div class="output-row">
              <span class="output-row-label">${escapeHtml(label)}</span>
              <span class="output-row-topic muted">→ ${escapeHtml(output.targetTopic)}</span>
              <span class="output-row-value" id="output-value-${output.id}">${escapeHtml(currentDisplay)}</span>
              <div class="output-row-actions">
                <button type="button" class="secondary-button" onclick="openOutputDialog('edit', ${output.id})">Bearbeiten</button>
                <button type="button" class="icon-button" aria-label="Output loeschen" title="Output loeschen" onclick="openDeleteDialog(${output.id}, ${toJsStringLiteral(label)})">🗑</button>
              </div>
            </div>`;
}

function renderOutputDialog({ internalValues, dialogError, dialogValues, dialogMode, editingOutputId }) {
  const values = dialogValues || { sourceId: '', targetTopic: '' };
  const action =
    dialogMode === 'edit' && editingOutputId != null
      ? `/output/outputs/${editingOutputId}`
      : '/output/outputs';

  return `        <dialog id="outputDialog" class="value-dialog">
          <form id="outputForm" action="${escapeHtml(action)}" method="POST" class="dialog-form">
            <div class="dialog-hero">
              <div>
                <h3 id="outputDialogTitle">Output hinzufuegen</h3>
                <p class="muted">Internen Wert auswaehlen und Ziel-Topic im ioBroker angeben.</p>
              </div>
            </div>
            ${statusText(dialogError)}
            <div class="dialog-grid">
              <label class="field-block" for="outputSourceId">
                <span>Interner Wert</span>
                <select id="outputSourceId" name="sourceId" required>
                  <option value="">Bitte waehlen</option>
                  ${internalValues
                    .map(
                      (value) =>
                        `<option value="${escapeHtml(value.id)}"${value.id === values.sourceId ? ' selected' : ''}>${escapeHtml(value.label)}</option>`
                    )
                    .join('')}
                </select>
                ${internalValues.length ? '' : '<small class="muted form-hint">Noch keine internen Werte verfuegbar. Bitte zuerst MQTT-Quellen konfigurieren.</small>'}
              </label>
              <label class="field-block" for="outputTargetTopic">
                <span>Ziel-Topic</span>
                <input type="text" id="outputTargetTopic" name="targetTopic" value="${escapeHtml(values.targetTopic)}" placeholder="z.B. 0_userdata.0.homeess.SoC" required>
                <small class="muted form-hint">State-ID oder Topic im ioBroker. Command-Topics (_SET/.SET//SET) werden als Rohwert geschrieben.</small>
              </label>
            </div>
            <div class="button-row">
              <button type="submit">Speichern</button>
              <button type="button" class="secondary-button" onclick="closeOutputDialog()">Abbrechen</button>
            </div>
          </form>
        </dialog>`;
}

function renderDeleteDialog() {
  return `        <dialog id="deleteOutputDialog" class="value-dialog">
          <form id="deleteOutputForm" method="POST" class="dialog-form">
            <h3>Output loeschen</h3>
            <p class="muted">Soll der Output <strong id="deleteOutputName"></strong> wirklich geloescht werden?</p>
            <div class="button-row">
              <button type="submit">Ja, loeschen</button>
              <button type="button" class="secondary-button" onclick="closeDeleteDialog()">Abbrechen</button>
            </div>
          </form>
        </dialog>`;
}

function serializeOutputForClient(output) {
  return {
    id: output.id,
    sourceId: output.sourceId,
    targetTopic: output.targetTopic,
  };
}

function toJsStringLiteral(value) {
  return JSON.stringify(String(value == null ? '' : value)).replace(/"/g, '&quot;');
}

module.exports = renderOutput;
