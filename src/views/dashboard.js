'use strict';

const { renderLayout } = require('./layout');
const { escapeHtml, statusText } = require('./components');
const { renderValueCatalog, valueCatalogScript } = require('./value-catalog');

// Dashboard mit frei konfigurierbaren Widgets und Gruppen. Widgets zeigen einen
// internen Wert (gleicher Katalog wie die Outputs) als Live-Kachel und lassen
// sich per Drag&Drop anordnen und in Gruppen verschieben.
function renderDashboard({
  ungrouped = [],
  groups = [],
  groupsForSelect = [],
  groupWidths = [],
  internalValues = [],
  infoFields = [],
  systemInfo = {},
  formMessage = '',
  formError = '',
  dialogMode = '',
  dialogError = '',
  dialogValues = null,
  editingWidgetId = null,
  groupDialogOpen = false,
  groupDialogError = '',
} = {}) {
  const renderCard = (widget) => renderWidgetCard(widget, { infoFields, systemInfo });
  const body = `        <div class="panel-head">
          <div>
            <h1>Dashboard</h1>
          </div>
          <div class="dashboard-toolbar">
            <button type="button" class="secondary-button" onclick="openGroupDialog('add')">Gruppe hinzufuegen</button>
            <button type="button" class="secondary-button" onclick="openWidgetDialog('add')">Widget hinzufuegen</button>
          </div>
        </div>
        ${statusText(formError)}
        ${statusText(formMessage, 'success')}
        ${groupDialogError ? statusText(groupDialogError) : ''}

        <div class="widget-dropzone widget-grid" data-group="">
${ungrouped.map(renderCard).join('\n')}
        </div>

        <div class="widget-groups" id="groupsContainer">
${groups.map((group) => renderGroup(group, { infoFields, systemInfo })).join('\n')}
        </div>

        ${renderWidgetDialog({ internalValues, groupsForSelect, infoFields })}
        ${renderGroupDialog({ groupWidths })}
        ${renderDeleteWidgetDialog()}
        ${renderDeleteGroupDialog()}`;

  const clientWidgets = [...ungrouped, ...groups.flatMap((group) => group.widgets)].map((widget) => ({
    id: widget.id,
    type: widget.type || 'value',
    sourceId: widget.sourceId,
    infoFields: widget.infoFields || null,
    groupId: widget.groupId == null ? '' : widget.groupId,
  }));

  const script = `${valueCatalogScript()}

    var dashboardWidgets = ${JSON.stringify(clientWidgets)};
    var initialDialogMode = ${JSON.stringify(dialogMode)};
    var initialEditingWidgetId = ${editingWidgetId == null ? 'null' : Number(editingWidgetId)};
    var initialDialogValues = ${JSON.stringify(dialogValues || {})};
    var initialGroupDialogOpen = ${groupDialogOpen ? 'true' : 'false'};
    var draggedCard = null;
    var dropZone = null;
    var dropRef = null;
    var draggedGroup = null;
    var groupDropRef = null;

    function openWidgetDialog(mode, widgetId) {
      var dialog = document.getElementById('widgetDialog');
      if (!dialog) return;
      var form = document.getElementById('widgetForm');
      var title = document.getElementById('widgetDialogTitle');
      var widget = null;
      for (var i = 0; i < dashboardWidgets.length; i++) {
        if (dashboardWidgets[i].id === widgetId) { widget = dashboardWidgets[i]; break; }
      }
      if (mode === 'edit' && widget) {
        form.action = '/dashboard/widgets/' + widget.id;
        title.textContent = 'Widget bearbeiten';
        setWidgetFormValues(widget);
      } else {
        form.action = '/dashboard/widgets';
        title.textContent = 'Widget hinzufuegen';
        setWidgetFormValues({ type: 'value', sourceId: '', groupId: '', infoFields: null });
      }
      if (typeof dialog.showModal === 'function') dialog.showModal();
    }

    // Tab/Typ umschalten: versteckten Typ setzen, aktive Registerkarte markieren
    // und das passende Panel zeigen.
    function setWidgetType(type) {
      var input = document.getElementById('widgetType');
      if (input) input.value = type;
      var tabs = document.querySelectorAll('#widgetDialog .dialog-tab');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-tab') === type);
      }
      var panels = document.querySelectorAll('#widgetDialog .tab-panel');
      for (var j = 0; j < panels.length; j++) {
        panels[j].hidden = panels[j].getAttribute('data-panel') !== type;
      }
    }

    function setWidgetFormValues(values) {
      setWidgetType(values.type || 'value');
      valueCatalogSync('widgetSourceId', values.sourceId || '');
      document.getElementById('widgetGroupId').value = values.groupId == null ? '' : String(values.groupId);
      // Info-Felder: ohne Vorgabe (Neuanlage) sind alle aktiv.
      var selected = values.infoFields || null;
      var boxes = document.querySelectorAll('#widgetDialog input[name="infoFields"]');
      for (var i = 0; i < boxes.length; i++) {
        boxes[i].checked = selected ? selected.indexOf(boxes[i].value) !== -1 : true;
      }
    }

    function closeWidgetDialog() {
      var dialog = document.getElementById('widgetDialog');
      if (dialog) dialog.close();
    }

    function openGroupDialog(mode, groupId, groupTitle, groupWidth) {
      var dialog = document.getElementById('groupDialog');
      if (!dialog) return;
      var form = document.getElementById('groupForm');
      var title = document.getElementById('groupDialogTitle');
      var input = document.getElementById('groupTitle');
      var widthInput = document.getElementById('groupWidth');
      if (mode === 'edit' && groupId != null) {
        form.action = '/dashboard/groups/' + groupId;
        title.textContent = 'Gruppe bearbeiten';
        input.value = groupTitle || '';
        if (widthInput) widthInput.value = groupWidth || 'full';
      } else {
        form.action = '/dashboard/groups';
        title.textContent = 'Gruppe hinzufuegen';
        input.value = '';
        if (widthInput) widthInput.value = 'full';
      }
      if (typeof dialog.showModal === 'function') dialog.showModal();
    }

    function closeGroupDialog() {
      var dialog = document.getElementById('groupDialog');
      if (dialog) dialog.close();
    }

    function openDeleteWidgetDialog(widgetId, widgetLabel) {
      var dialog = document.getElementById('deleteWidgetDialog');
      if (!dialog) return;
      document.getElementById('deleteWidgetName').textContent = widgetLabel;
      document.getElementById('deleteWidgetForm').action = '/dashboard/widgets/' + widgetId + '/delete';
      if (typeof dialog.showModal === 'function') dialog.showModal();
    }

    function closeDeleteWidgetDialog() {
      var dialog = document.getElementById('deleteWidgetDialog');
      if (dialog) dialog.close();
    }

    function openDeleteGroupDialog(groupId, groupTitle) {
      var dialog = document.getElementById('deleteGroupDialog');
      if (!dialog) return;
      document.getElementById('deleteGroupName').textContent = groupTitle;
      document.getElementById('deleteGroupForm').action = '/dashboard/groups/' + groupId + '/delete';
      if (typeof dialog.showModal === 'function') dialog.showModal();
    }

    function closeDeleteGroupDialog() {
      var dialog = document.getElementById('deleteGroupDialog');
      if (dialog) dialog.close();
    }

    // --- Drag & Drop ---------------------------------------------------------
    function setupCard(card) {
      var handle = card.querySelector('.widget-drag');
      if (handle) {
        handle.addEventListener('mousedown', function () { card.setAttribute('draggable', 'true'); });
        handle.addEventListener('mouseup', function () { card.removeAttribute('draggable'); });
      }
      card.addEventListener('dragstart', function (event) {
        draggedCard = card;
        dropZone = null;
        dropRef = null;
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        if (event.dataTransfer.setData) event.dataTransfer.setData('text/plain', card.dataset.id);
      });
      card.addEventListener('dragend', function () {
        applyDrop();
        card.classList.remove('dragging');
        card.removeAttribute('draggable');
        draggedCard = null;
        dropZone = null;
        dropRef = null;
        clearDropIndicators();
        persistLayout();
      });
    }

    // Einfügeziel bestimmen, OHNE das DOM zu verändern (verhindert Layout-Flackern):
    // gibt die Kachel zurück, vor der eingefügt würde – oder null für „ans Ende".
    function insertionReference(zone, x, y) {
      var cards = zone.querySelectorAll('.widget-card:not(.dragging)');
      if (!cards.length) return null;
      var nearest = null;
      var nearestDist = Infinity;
      for (var i = 0; i < cards.length; i++) {
        var box = cards[i].getBoundingClientRect();
        var cx = box.left + box.width / 2;
        var cy = box.top + box.height / 2;
        var dist = Math.hypot(x - cx, y - cy);
        if (dist < nearestDist) { nearestDist = dist; nearest = { el: cards[i], cx: cx, cy: cy, h: box.height }; }
      }
      if (!nearest) return null;
      var before = (y < nearest.cy - nearest.h / 2) || (Math.abs(y - nearest.cy) <= nearest.h / 2 && x < nearest.cx);
      var ref = before ? nearest.el : nearest.el.nextElementSibling;
      // Liegt das Ziel direkt vor/nach der gezogenen Kachel, ist es ein No-Op.
      if (ref === draggedCard) ref = draggedCard.nextElementSibling;
      return ref;
    }

    function setupZone(zone) {
      zone.addEventListener('dragover', function (event) {
        if (!draggedCard) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        dropZone = zone;
        dropRef = insertionReference(zone, event.clientX, event.clientY);
        clearDropIndicators();
        zone.classList.add('drag-over');
        if (dropRef && dropRef !== draggedCard) {
          dropRef.classList.add('drop-before');
        } else {
          var rest = zone.querySelectorAll('.widget-card:not(.dragging)');
          if (rest.length) rest[rest.length - 1].classList.add('drop-after');
        }
      });
      zone.addEventListener('drop', function (event) {
        event.preventDefault();
      });
    }

    function clearDropIndicators() {
      var marked = document.querySelectorAll('.widget-card.drop-before, .widget-card.drop-after');
      for (var i = 0; i < marked.length; i++) {
        marked[i].classList.remove('drop-before');
        marked[i].classList.remove('drop-after');
      }
      var zones = document.querySelectorAll('.widget-dropzone.drag-over');
      for (var j = 0; j < zones.length; j++) zones[j].classList.remove('drag-over');
    }

    // Tatsächliche Verschiebung erst beim Loslassen anwenden.
    function applyDrop() {
      if (!draggedCard || !dropZone) return;
      if (dropRef == null) dropZone.appendChild(draggedCard);
      else if (dropRef !== draggedCard) dropZone.insertBefore(draggedCard, dropRef);
    }

    function persistLayout() {
      var items = [];
      var zones = document.querySelectorAll('.widget-dropzone');
      for (var z = 0; z < zones.length; z++) {
        var groupId = zones[z].dataset.group ? Number(zones[z].dataset.group) : null;
        var cards = zones[z].querySelectorAll('.widget-card');
        for (var c = 0; c < cards.length; c++) {
          items.push({ id: Number(cards[c].dataset.id), groupId: groupId, position: c });
        }
      }
      fetch('/dashboard/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets: items })
      }).catch(function () {});
    }

    // --- Gruppen verschieben -------------------------------------------------
    function setupGroup(groupEl) {
      var handle = groupEl.querySelector('.widget-group-drag');
      if (handle) {
        handle.addEventListener('mousedown', function () { groupEl.setAttribute('draggable', 'true'); });
        handle.addEventListener('mouseup', function () { groupEl.removeAttribute('draggable'); });
      }
      groupEl.addEventListener('dragstart', function (event) {
        if (groupEl.getAttribute('draggable') !== 'true') return;
        event.stopPropagation();
        draggedGroup = groupEl;
        groupDropRef = null;
        groupEl.classList.add('group-dragging');
        event.dataTransfer.effectAllowed = 'move';
        if (event.dataTransfer.setData) event.dataTransfer.setData('text/plain', 'group:' + groupEl.dataset.groupId);
      });
      groupEl.addEventListener('dragend', function (event) {
        if (!draggedGroup) return;
        event.stopPropagation();
        applyGroupDrop();
        groupEl.classList.remove('group-dragging');
        groupEl.removeAttribute('draggable');
        draggedGroup = null;
        groupDropRef = null;
        clearGroupIndicators();
        persistGroupOrder();
      });
    }

    function groupInsertionReference(container, x, y) {
      var groupEls = container.querySelectorAll('.widget-group:not(.group-dragging)');
      if (!groupEls.length) return null;
      var nearest = null;
      var nearestDist = Infinity;
      for (var i = 0; i < groupEls.length; i++) {
        var box = groupEls[i].getBoundingClientRect();
        var cx = box.left + box.width / 2;
        var cy = box.top + box.height / 2;
        var dist = Math.hypot(x - cx, y - cy);
        if (dist < nearestDist) { nearestDist = dist; nearest = { el: groupEls[i], cx: cx, cy: cy, h: box.height }; }
      }
      if (!nearest) return null;
      var before = (y < nearest.cy - nearest.h / 2) || (Math.abs(y - nearest.cy) <= nearest.h / 2 && x < nearest.cx);
      var ref = before ? nearest.el : nearest.el.nextElementSibling;
      if (ref === draggedGroup) ref = draggedGroup.nextElementSibling;
      return ref;
    }

    function setupGroupsContainer(container) {
      container.addEventListener('dragover', function (event) {
        if (!draggedGroup) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        groupDropRef = groupInsertionReference(container, event.clientX, event.clientY);
        clearGroupIndicators();
        if (groupDropRef && groupDropRef !== draggedGroup) {
          groupDropRef.classList.add('group-drop-before');
        } else {
          var rest = container.querySelectorAll('.widget-group:not(.group-dragging)');
          if (rest.length) rest[rest.length - 1].classList.add('group-drop-after');
        }
      });
      container.addEventListener('drop', function (event) {
        if (!draggedGroup) return;
        event.preventDefault();
      });
    }

    function clearGroupIndicators() {
      var marked = document.querySelectorAll('.widget-group.group-drop-before, .widget-group.group-drop-after');
      for (var i = 0; i < marked.length; i++) {
        marked[i].classList.remove('group-drop-before');
        marked[i].classList.remove('group-drop-after');
      }
    }

    function applyGroupDrop() {
      var container = document.getElementById('groupsContainer');
      if (!draggedGroup || !container) return;
      if (groupDropRef == null) container.appendChild(draggedGroup);
      else if (groupDropRef !== draggedGroup) container.insertBefore(draggedGroup, groupDropRef);
    }

    function persistGroupOrder() {
      var container = document.getElementById('groupsContainer');
      if (!container) return;
      var items = [];
      var groupEls = container.querySelectorAll('.widget-group');
      for (var i = 0; i < groupEls.length; i++) {
        items.push({ id: Number(groupEls[i].dataset.groupId), position: i });
      }
      fetch('/dashboard/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: items })
      }).catch(function () {});
    }

    function initDragAndDrop() {
      var cards = document.querySelectorAll('.widget-card');
      for (var i = 0; i < cards.length; i++) setupCard(cards[i]);
      var zones = document.querySelectorAll('.widget-dropzone');
      for (var j = 0; j < zones.length; j++) setupZone(zones[j]);
      var groupEls = document.querySelectorAll('.widget-group');
      for (var k = 0; k < groupEls.length; k++) setupGroup(groupEls[k]);
      var groupsContainer = document.getElementById('groupsContainer');
      if (groupsContainer) setupGroupsContainer(groupsContainer);
    }

    async function refreshWidgetValues() {
      try {
        var response = await fetch('/dashboard/data', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        var data = await response.json();
        data.widgets.forEach(function (widget) {
          var node = document.getElementById('widget-value-' + widget.id);
          if (node) node.textContent = widget.currentDisplay == null ? '—' : widget.currentDisplay;
        });
        if (data.system) applySystemInfo(data.system);
      } catch (_) {
        // Anzeige bleibt auf dem letzten gueltigen Stand.
      }
    }

    // Alle Info-Kacheln mit frischen System-Werten versorgen (Text + Balken).
    function applySystemInfo(system) {
      Object.keys(system).forEach(function (key) {
        var field = system[key];
        var vals = document.querySelectorAll('[data-info="' + key + '"]');
        for (var i = 0; i < vals.length; i++) {
          vals[i].textContent = field.display == null ? '—' : field.display;
        }
        if (field.percent != null) {
          var bars = document.querySelectorAll('[data-info-bar="' + key + '"]');
          for (var j = 0; j < bars.length; j++) bars[j].style.width = field.percent + '%';
        }
      });
    }

    if (initialDialogMode === 'add') {
      openWidgetDialog('add');
      setWidgetFormValues(initialDialogValues);
    } else if (initialDialogMode === 'edit' && initialEditingWidgetId != null) {
      openWidgetDialog('edit', initialEditingWidgetId);
      setWidgetFormValues(initialDialogValues);
    }
    if (initialGroupDialogOpen) openGroupDialog('add');

    // MQTT-Events kommen in Bursts (viele Topics gleichzeitig). Ohne Bremse würde
    // jedes Event ein /dashboard/data-Fetch auslösen und den Server fluten
    // (listInternalValues ist teuer). Daher pro Burst nur EIN Nachladen (coalesced).
    var refreshQueued = false;
    function queueWidgetRefresh() {
      if (refreshQueued) return;
      refreshQueued = true;
      setTimeout(function () { refreshQueued = false; refreshWidgetValues(); }, 1000);
    }

    initDragAndDrop();
    refreshWidgetValues();
    window.addEventListener('homeess:mqtt', queueWidgetRefresh);
    setInterval(refreshWidgetValues, 60000);`;

  return renderLayout({ title: 'Dashboard', activePath: '/dashboard', body, script });
}

function groupWidthClass(width) {
  if (width === 'half') return 'widget-group--half';
  if (width === 'quarter') return 'widget-group--quarter';
  return 'widget-group--full';
}

function renderGroup(group, ctx = {}) {
  return `          <div class="widget-group ${groupWidthClass(group.width)}" data-group-id="${group.id}">
            <div class="widget-group-head">
              <span class="widget-group-drag" title="Gruppe verschieben" aria-hidden="true">⠿</span>
              <span class="widget-group-title">${escapeHtml(group.title)}</span>
              <div class="widget-group-actions">
                <button type="button" class="widget-icon-btn" title="Gruppe bearbeiten" onclick="openGroupDialog('edit', ${group.id}, ${toJsStringLiteral(group.title)}, ${toJsStringLiteral(group.width)})">✎</button>
                <button type="button" class="widget-icon-btn" title="Gruppe entfernen" onclick="openDeleteGroupDialog(${group.id}, ${toJsStringLiteral(group.title)})">🗑</button>
              </div>
            </div>
            <div class="widget-dropzone widget-grid" data-group="${group.id}">
${group.widgets.map((widget) => renderWidgetCard(widget, ctx)).join('\n')}
            </div>
          </div>`;
}

function widgetCardHead(widget, label) {
  return `              <div class="widget-card-head">
                <span class="widget-drag" title="Zum Verschieben ziehen" aria-hidden="true">⠿</span>
                <div class="widget-actions">
                  <button type="button" class="widget-icon-btn" title="Widget bearbeiten" onclick="openWidgetDialog('edit', ${widget.id})">✎</button>
                  <button type="button" class="widget-icon-btn" title="Widget entfernen" onclick="openDeleteWidgetDialog(${widget.id}, ${toJsStringLiteral(label)})">🗑</button>
                </div>
              </div>`;
}

function renderWidgetCard(widget, ctx = {}) {
  if (widget.type === 'info') return renderInfoCard(widget, ctx);
  const label = widget.label || widget.sourceId;
  const currentDisplay = widget.currentDisplay == null ? '—' : widget.currentDisplay;
  return `            <div class="widget-card" data-id="${widget.id}">
${widgetCardHead(widget, label)}
              <div class="widget-label">${escapeHtml(label)}</div>
              <div class="widget-value" id="widget-value-${widget.id}">${escapeHtml(currentDisplay)}</div>
            </div>`;
}

// Info-Kachel: listet die gewählten System-Felder untereinander. „usage"-Felder
// bekommen einen Fortschrittsbalken. Die Werte werden per data-info-Attribut
// live aktualisiert (siehe applySystemInfo).
function renderInfoCard(widget, { infoFields = [], systemInfo = {} } = {}) {
  const selected = widget.infoFields || infoFields.map((field) => field.key);
  const selectedSet = new Set(selected);
  const rows = infoFields
    .filter((field) => selectedSet.has(field.key))
    .map((field) => {
      const info = systemInfo[field.key] || {};
      const display = info.display == null ? '—' : info.display;
      if (field.type === 'usage') {
        const percent = info.percent == null ? 0 : info.percent;
        return `                <div class="info-row info-row--bar">
                  <div class="info-row-head">
                    <span class="info-row-key">${escapeHtml(field.label)}</span>
                    <span class="info-row-val" data-info="${escapeHtml(field.key)}">${escapeHtml(display)}</span>
                  </div>
                  <div class="progress"><div class="progress-bar" data-info-bar="${escapeHtml(field.key)}" style="width:${percent}%"></div></div>
                </div>`;
      }
      return `                <div class="info-row">
                  <span class="info-row-key">${escapeHtml(field.label)}</span>
                  <span class="info-row-val" data-info="${escapeHtml(field.key)}">${escapeHtml(display)}</span>
                </div>`;
    })
    .join('\n');
  return `            <div class="widget-card widget-card--info" data-id="${widget.id}">
${widgetCardHead(widget, 'System')}
              <div class="widget-label">System</div>
              <div class="info-list">
${rows}
              </div>
            </div>`;
}

function renderWidgetDialog({ internalValues, groupsForSelect, infoFields = [] }) {
  const infoChecklist = infoFields
    .map(
      (field) => `                <label class="info-check">
                  <input type="checkbox" name="infoFields" value="${escapeHtml(field.key)}" checked>
                  <span>${escapeHtml(field.label)}</span>
                </label>`
    )
    .join('\n');
  return `        <dialog id="widgetDialog" class="value-dialog">
          <form id="widgetForm" action="/dashboard/widgets" method="POST" class="dialog-form">
            <div class="dialog-hero">
              <div>
                <h3 id="widgetDialogTitle">Widget hinzufuegen</h3>
              </div>
            </div>
            <input type="hidden" id="widgetType" name="type" value="value">
            <div class="dialog-tabs" role="tablist">
              <button type="button" class="dialog-tab is-active" data-tab="value" onclick="setWidgetType('value')">Wert</button>
              <button type="button" class="dialog-tab" data-tab="info" onclick="setWidgetType('info')">Info-Kachel</button>
            </div>
            <div class="dialog-grid">
              <label class="field-block" for="widgetGroupId">
                <span>Gruppe</span>
                <select id="widgetGroupId" name="groupId">
                  <option value="">Direkt aufs Dashboard (keine Gruppe)</option>
                  ${groupsForSelect
                    .map((group) => `<option value="${group.id}">${escapeHtml(group.title)}</option>`)
                    .join('')}
                </select>
              </label>
            </div>
            <div class="tab-panel" data-panel="value">
              ${renderValueCatalog({ values: internalValues, inputId: 'widgetSourceId', name: 'sourceId', selectedId: '', label: 'Wert' })}
            </div>
            <div class="tab-panel" data-panel="info" hidden>
              <div class="field-block">
                <span>Angezeigte Informationen</span>
                <div class="info-check-list">
${infoChecklist}
                </div>
              </div>
            </div>
            <div class="button-row">
              <button type="submit">Speichern</button>
              <button type="button" class="secondary-button" onclick="closeWidgetDialog()">Abbrechen</button>
            </div>
          </form>
        </dialog>`;
}

function renderGroupDialog({ groupWidths = [] } = {}) {
  return `        <dialog id="groupDialog" class="value-dialog">
          <form id="groupForm" action="/dashboard/groups" method="POST" class="dialog-form">
            <h3 id="groupDialogTitle">Gruppe hinzufuegen</h3>
            <div class="dialog-grid dialog-grid--two">
              <label class="field-block" for="groupTitle">
                <span>Titel</span>
                <input type="text" id="groupTitle" name="title" required>
              </label>
              <label class="field-block" for="groupWidth">
                <span>Breite</span>
                <select id="groupWidth" name="width">
                  ${groupWidths
                    .map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
                    .join('')}
                </select>
              </label>
            </div>
            <div class="button-row">
              <button type="submit">Speichern</button>
              <button type="button" class="secondary-button" onclick="closeGroupDialog()">Abbrechen</button>
            </div>
          </form>
        </dialog>`;
}

function renderDeleteWidgetDialog() {
  return `        <dialog id="deleteWidgetDialog" class="value-dialog">
          <form id="deleteWidgetForm" method="POST" class="dialog-form">
            <h3>Widget entfernen</h3>
            <p class="muted">Soll das Widget <strong id="deleteWidgetName"></strong> wirklich entfernt werden?</p>
            <div class="button-row">
              <button type="submit">Ja, entfernen</button>
              <button type="button" class="secondary-button" onclick="closeDeleteWidgetDialog()">Abbrechen</button>
            </div>
          </form>
        </dialog>`;
}

function renderDeleteGroupDialog() {
  return `        <dialog id="deleteGroupDialog" class="value-dialog">
          <form id="deleteGroupForm" method="POST" class="dialog-form">
            <h3>Gruppe entfernen</h3>
            <p class="muted">Soll die Gruppe <strong id="deleteGroupName"></strong> entfernt werden? Die enthaltenen Widgets bleiben als freie Dashboard-Widgets erhalten.</p>
            <div class="button-row">
              <button type="submit">Ja, entfernen</button>
              <button type="button" class="secondary-button" onclick="closeDeleteGroupDialog()">Abbrechen</button>
            </div>
          </form>
        </dialog>`;
}

function toJsStringLiteral(value) {
  return JSON.stringify(String(value == null ? '' : value)).replace(/"/g, '&quot;');
}

module.exports = renderDashboard;
