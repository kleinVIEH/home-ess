'use strict';

const { statusText } = require('./components');

// Login-Seite — eigenständige Hülle (vor der Anmeldung gibt es keine Sidebar).
// renderLogin({ error, remember })
function renderLogin({ error = false, remember = false } = {}) {
  const checked = remember ? ' checked' : '';
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="page-login">
  <div class="login-card">
    <h2>Login</h2>
    ${error ? statusText('Ungültiges Passwort') : ''}
    <form action="/login" method="POST">
      <input type="password" name="password" placeholder="Passwort" required autofocus>
      <label class="remember-row">
        <input type="checkbox" name="remember"${checked}>
        <span>Passwort merken</span>
      </label>
      <button type="submit">Anmelden</button>
    </form>
  </div>
</body>
</html>`;
}

module.exports = renderLogin;
