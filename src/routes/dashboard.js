'use strict';

const express = require('express');
const { requireAuth } = require('../auth/session');
const mqttClient = require('../mqtt/client');
const {
  listWidgets,
  createWidget,
  updateWidget,
  deleteWidget,
  reorderWidgets,
  normalizeWidgetInput,
} = require('../dashboard/widgets');
const {
  GROUP_WIDTHS,
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
} = require('../dashboard/groups');
const { listInternalValues } = require('../output/internal-values');
const renderDashboard = require('../views/dashboard');

function enrichWidget(widget, valuesById) {
  const entry = valuesById.get(widget.sourceId);
  return {
    ...widget,
    label: entry ? entry.label : widget.sourceId,
    currentDisplay: entry ? entry.display : '—',
  };
}

async function renderPage(db, res, options = {}) {
  const [groups, widgets, internalValues] = await Promise.all([
    listGroups(db),
    listWidgets(db),
    listInternalValues(db, mqttClient.getCache()),
  ]);
  const valuesById = new Map(internalValues.map((entry) => [entry.id, entry]));
  const enriched = widgets.map((widget) => enrichWidget(widget, valuesById));

  res.send(
    renderDashboard({
      ungrouped: enriched.filter((widget) => widget.groupId == null),
      groups: groups.map((group) => ({
        ...group,
        widgets: enriched.filter((widget) => widget.groupId === group.id),
      })),
      groupsForSelect: groups,
      groupWidths: GROUP_WIDTHS,
      internalValues: internalValues.map((entry) => ({ id: entry.id, label: entry.label })),
      formMessage: options.formMessage || '',
      formError: options.formError || '',
      dialogMode: options.dialogMode || '',
      dialogError: options.dialogError || '',
      dialogValues: options.dialogValues || null,
      editingWidgetId: options.editingWidgetId != null ? options.editingWidgetId : null,
      groupDialogOpen: options.groupDialogOpen || false,
      groupDialogError: options.groupDialogError || '',
    })
  );
}

function dashboardRoutes(db) {
  const router = express.Router();

  router.get('/dashboard', requireAuth, async (req, res, next) => {
    try {
      await renderPage(db, res, {});
    } catch (err) {
      next(err);
    }
  });

  router.get('/dashboard/data', requireAuth, async (req, res, next) => {
    try {
      const [widgets, internalValues] = await Promise.all([
        listWidgets(db),
        listInternalValues(db, mqttClient.getCache()),
      ]);
      const valuesById = new Map(internalValues.map((entry) => [entry.id, entry]));
      res.json({
        widgets: widgets.map((widget) => {
          const entry = valuesById.get(widget.sourceId);
          return { id: widget.id, currentDisplay: entry ? entry.display : '—' };
        }),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/dashboard/widgets', requireAuth, async (req, res, next) => {
    try {
      await createWidget(db, req.body);
      await renderPage(db, res, { formMessage: 'Widget hinzugefuegt.' });
    } catch (err) {
      if (err.validation) {
        return renderPage(db, res, {
          dialogMode: 'add',
          dialogError: err.message,
          dialogValues: normalizeWidgetInput(req.body),
        });
      }
      next(err);
    }
  });

  router.post('/dashboard/widgets/:id', requireAuth, async (req, res, next) => {
    try {
      await updateWidget(db, Number(req.params.id), req.body);
      await renderPage(db, res, { formMessage: 'Widget gespeichert.' });
    } catch (err) {
      if (err.validation) {
        return renderPage(db, res, {
          dialogMode: 'edit',
          dialogError: err.message,
          dialogValues: normalizeWidgetInput(req.body),
          editingWidgetId: Number(req.params.id),
        });
      }
      next(err);
    }
  });

  router.post('/dashboard/widgets/:id/delete', requireAuth, async (req, res, next) => {
    try {
      await deleteWidget(db, Number(req.params.id));
      await renderPage(db, res, { formMessage: 'Widget entfernt.' });
    } catch (err) {
      next(err);
    }
  });

  router.post('/dashboard/layout', requireAuth, async (req, res, next) => {
    try {
      const body = req.body || {};
      if (Array.isArray(body.widgets)) await reorderWidgets(db, body.widgets);
      if (Array.isArray(body.groups)) await reorderGroups(db, body.groups);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/dashboard/groups', requireAuth, async (req, res, next) => {
    try {
      await createGroup(db, req.body);
      await renderPage(db, res, { formMessage: 'Gruppe hinzugefuegt.' });
    } catch (err) {
      if (err.validation) {
        return renderPage(db, res, { groupDialogOpen: true, groupDialogError: err.message });
      }
      next(err);
    }
  });

  router.post('/dashboard/groups/:id', requireAuth, async (req, res, next) => {
    try {
      await updateGroup(db, Number(req.params.id), req.body);
      await renderPage(db, res, { formMessage: 'Gruppe gespeichert.' });
    } catch (err) {
      if (err.validation) {
        return renderPage(db, res, { groupDialogOpen: true, groupDialogError: err.message });
      }
      next(err);
    }
  });

  router.post('/dashboard/groups/:id/delete', requireAuth, async (req, res, next) => {
    try {
      await deleteGroup(db, Number(req.params.id));
      await renderPage(db, res, { formMessage: 'Gruppe entfernt.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = dashboardRoutes;
