'use strict';

const crypto = require('crypto');
const config = require('../config');

// Schlanke, DB-gestützte Cookie-Sessions. Ersetzt das frühere prozessweite
// isLoggedIn-Flag und ermöglicht "Passwort merken" sowie mehrere Clients.
// Sessions überleben Neustarts, weil sie in der sessions-Tabelle liegen.

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

// Middleware: setzt req.session = { id } für gültige, nicht abgelaufene Sessions.
function sessionMiddleware(db) {
  return (req, res, next) => {
    const sid = parseCookies(req.headers.cookie)[config.SESSION_COOKIE];
    if (!sid) {
      req.session = null;
      return next();
    }
    db.get('SELECT id, expires_at FROM sessions WHERE id = ?', [sid], (err, row) => {
      if (err || !row || row.expires_at < Date.now()) {
        req.session = null;
      } else {
        req.session = { id: row.id };
      }
      next();
    });
  };
}

// Erzeugt eine Session, schreibt sie in die DB und setzt das Cookie.
// remember=true -> persistentes Cookie (30 Tage), sonst Session-Cookie (12 h).
function createSession(db, res, remember, callback) {
  const id = crypto.randomBytes(32).toString('hex');
  const maxAge = remember ? config.SESSION_REMEMBER_MS : config.SESSION_DEFAULT_MS;
  const expiresAt = Date.now() + maxAge;

  db.run('INSERT INTO sessions (id, expires_at) VALUES (?, ?)', [id, expiresAt], (err) => {
    if (err) return callback(err);
    res.cookie(config.SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // Ohne "merken" kein maxAge -> Cookie endet mit der Browser-Sitzung.
      ...(remember ? { maxAge } : {}),
    });
    callback(null, id);
  });
}

function destroySession(db, req, res, callback) {
  res.clearCookie(config.SESSION_COOKIE, { path: '/' });
  if (!req.session) return callback && callback();
  db.run('DELETE FROM sessions WHERE id = ?', [req.session.id], () => callback && callback());
}

// Schutz-Middleware für authentifizierte Routen.
function requireAuth(req, res, next) {
  if (!req.session) return res.redirect('/');
  next();
}

module.exports = { sessionMiddleware, createSession, destroySession, requireAuth };
