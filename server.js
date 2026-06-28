'use strict';

// Einstiegspunkt: App zusammenbauen und Server starten.
// Die eigentliche Logik liegt modular unter src/.
const config = require('./src/config');
const { createApp } = require('./src/app');

const { app } = createApp();

app.listen(config.PORT, () => {
  console.log(`homeESS läuft auf Port ${config.PORT}`);
});
