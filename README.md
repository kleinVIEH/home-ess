# homeESS

Basis für ein **Energy Storage System**. Der Server abonniert MQTT-Topics eines
ioBroker-Brokers und soll daraus ableiten, wie Lasten zu schalten sind.
Bedienung über ein Web-Dashboard mit vorgeschaltetem Login.

> Architektur & Entwickler-Einstieg: siehe [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).
> ioBroker-MQTT-Regelwerk: siehe [MQTT.md](MQTT.md).

## Features (aktuell)

- 🔐 **Login** mit Passwort und „Passwort merken" (persistentes Cookie).
- 🖥️ **Dashboard** — frei konfigurierbare **Widgets** (jeder berechnete Wert als
  Live-Kachel), **Gruppen** mit Titel und Breite (voll/halb/viertel),
  Anordnung per **Drag & Drop** (Widgets und Gruppen); Widgets per Drag in
  Gruppen verschiebbar, Widgets/Gruppen bearbeit- und löschbar.
- ⚡ **Stromverbrauch** — KPI-Kacheln: Eigenverbrauch, Netzbezug, Heute,
  Woche, Jahr (inkl. Vorjahr), konfigurierbare MQTT-Topics je Phase sowie
  Tagesstart-Abgleich für Woche/Jahr.
- ☀️ **Photovoltaik** — PV-Anlagenverwaltung mit MQTT-Topics und Metadaten
  (Zelltyp, **Konverter-/Reglertyp**); je Anlage **aktuelle Leistung groß,
  Idealwert (Clear-Sky-Modell) klein**. Idealwert berücksichtigt Zelltyp- und
  **Konverter-Wirkungsgrad** (temperaturabhängig); Sonnenstand via echter
  **Ortssonnenzeit** (Längengrad, Zeitzone inkl. Sommerzeit, Zeitgleichung).
  **Direkte-Sonne-Erkennung** je Anlage und globales **Himmelssymbol in der
  Titelzeile** (☀️/☁️/🌙). Ertrag heute/Woche/Jahr inkl. Vorjahr.
  - **Sonnenreferenz-Cutoff** je Anlage (getrennt morgens/abends, Default 10 %):
    nur Anlagen, auf die die Sonne brauchbar scheint (Idealwert ≥ Anteil der
    kWp-Spitze), zählen für Sonnenintensität und ☀️/☁️ — verhindert falsche
    Sonnenwerte einer groß dimensionierten, off-axis stehenden Anlage.
  - **PV-Prognose** (Open-Meteo, kostenlos & ohne API-Key): erwarteter Tagesertrag
    für **Heute + 3 Tage**; die Heute-Karte zeigt zusätzlich *bis jetzt* und
    *noch erwartet*. Nutzt dasselbe Clear-Sky-Modell wie der Live-Idealwert.
  - **Selbstkalibrierung** (je Anlage aktivierbar): tageszeit-abhängiger
    Kalibrierfaktor je **15-Minuten-Fenster**, der den gemessenen Schnitt der
    letzten 15 Minuten mit der von Open-Meteo gelieferten Strahlung desselben
    Fensters vergleicht und sich sanft nachzieht — erkennt u. a. Verschattungen und
    fließt in Idealwert und Prognose ein.
- 🔋 **Batterie** — Das zentrale Element der Plattform.
  - Konfigurierbare MQTT-Topics für SoC, Leistung, Spannung, Temperatur.
  - KPI-Kacheln (nur wenn Topic konfiguriert), SoC-Balken mit Farbwechsel
    (grün ≥ 50 %, dunkelgelb 20–49 %, rot < 20 %), Leistungsanzeige mit
    Richtungsindikator (Laden/Entladen/Bereit).
  - **Batterie-Ladeanzeige in der Titelzeile**: Icon in Batterieform mit
    Füllstand und Prozentzahl, erscheint automatisch sobald SoC-Daten
    vorliegen, live aktualisiert via SSE.
- 🏊 **Poolsteuerung** (optionales Modul, aktivierbar unter `/module`):
  - Solarpumpe und Filterpumpe mit je Status-/Steuerungs-Topic und Priorität.
  - **Drei Modus-Buttons** je Pumpe: An / Aus / Automatik.
  - Solarautomatik: sonnenbasiert, 2-Min-Mindesthaltedauer, Maximaltemperatur
    mit Probezyklus (Filterpumpe optional). Probeläufe starten nur bei direkter
    Sonneneinstrahlung; eine laufende Probe läuft bei Beschattung zu Ende; der
    Pausenzähler läuft bei Beschattung weiter — nach Sonnenrückkehr startet
    sofort eine neue Probe wenn die Pausenzeit abgelaufen ist.
  - Filterautomatik: bis zu 3 Zeitfenster, Follow-Solar, Akku-Override
    (liest Batterie-SoC aus dem zentralen Cache).
  - KPI-Kacheln für Wassertemperatur, Pumpen, pH, Chlor (je nach Konfiguration).
- 📤 **Output** — beliebige berechnete Werte an ioBroker-Ziel-Topics zurückgeben;
  Übergabe automatisch bei Wertänderung (Publish gemäß [MQTT.md](MQTT.md)).
- 🧩 **Module** — Verwaltungsseite zum Aktivieren/Deaktivieren optionaler Module;
  aktive Module erscheinen automatisch in der Sidebar.
- 🌤️ **Sonnenintensität** (% des Clear-Sky-Ideals, auf 100 % gedeckelt):
  aktuell sowie 10-Minuten-/Tages-/Vortagsmittel. Nur Anlagen oberhalb ihres
  größenrelativen Sonnenreferenz-Cutoffs fließen ein.
- ⚙️ **Einstellungen** (Karten-Layout): Passwort ändern, **Standort & Zeit**
  (Breiten-/Längengrad, Zeitzone, automatische Zeitumstellung — für das
  Clear-Sky-Modell), MQTT-Broker konfigurieren & Verbindung testen.
- 📡 MQTT-Verbindungs-Manager mit Reconnect-Handling, Wert-Cache und **Publish**
  (nach den Regeln aus [MQTT.md](MQTT.md)); Live-Updates per SSE (`/live/events`).
- 🚀 **systemd-Service** — startet automatisch beim Systemboot.

Alle Seiten werden **dynamisch** serverseitig gerendert — es gibt keine
statischen HTML-Seiten.

## Voraussetzungen

- Node.js ≥ 20.17
- Ein erreichbarer MQTT-Broker (z. B. ioBroker) — optional zum Start.

## Installation & Start

### Automatische Installation (Debian/Ubuntu/Raspberry Pi OS)

homeESS lässt sich auf einem frischen System mit einem Befehl installieren:

```bash
curl -fsSL https://raw.githubusercontent.com/kleinVIEH/home-ess/main/install.sh | sudo bash
```

Das Skript installiert die System- und Node.js-Abhängigkeiten, klont homeESS
nach `/opt/home-ess`, legt eine neue Datenbank unter
`/var/lib/home-ess/app.db` an und aktiviert den systemd-Dienst. Eine vorhandene
Installation oder Datenbank wird aus Sicherheitsgründen nicht überschrieben.

### Manuelle Installation

```bash
npm ci
npm start          # startet auf http://localhost:3000
```

Entwicklung mit Auto-Reload:

```bash
npm run dev        # node --watch
```

### Erster Login

Standard-Passwort beim ersten Start: **`admin`**.
Nach dem Login unter **Einstellungen → Neues Passwort** ändern.

### Konfiguration über Umgebungsvariablen

| Variable      | Default            | Beschreibung                         |
| ------------- | ------------------ | ------------------------------------ |
| `PORT`        | `3000`             | HTTP-Port                            |
| `HOME_ESS_DB` | `./data/app.db`    | Pfad zur SQLite-Datenbank            |

## Service-Verwaltung

Der Server läuft als systemd-Service und startet automatisch beim Systemboot.

```bash
systemctl status home-ess      # Status prüfen
systemctl restart home-ess     # Neustart (z. B. nach Updates)
journalctl -u home-ess -f      # Live-Log
```

## Projektstruktur (Kurzform)

```
server.js          Einstiegspunkt
src/
  config.js        Konstanten
  db.js            SQLite (Schema, Seed, Migration)
  app.js           Express-App + periodische Jobs
  modules/         Modul-Registry (optionale Features)
  auth/            Passwort-Hashing, Sessions, Login-Routen
  mqtt/            Topic-Helfer, Config, Verbindungs-Manager (inkl. publish,
                   Ad-hoc-Subscriptions), State-Definitionen
  stromverbrauch/  Topic-Konfiguration + Aggregation
  photovoltaik/    PV-Anlagen, Clear-Sky-Modell, Konvertertypen, Sonnenintensität,
                   Prognose (forecast.js), Selbstkalibrierung (calibration.js)
  wetter/          Open-Meteo-Abruf (Strahlungsprognose) + In-Memory-Cache
  batterie/        Topic-Konfiguration + State-Definitionen + Cache-Reader
  pool/            Pool-Config + Pump-Automation (solar/filter)
  output/          Wert-Katalog (PV, Prognose, Strom, Batterie, Pool, Sonne),
                   Output-CRUD, Publish-Engine
  dashboard/       Widget- und Gruppen-CRUD
  routes/          Eine Datei je Seite/Feature
  views/           Dynamische HTML-Renderer (je Seite eine Datei)
public/styles.css  Statisches Asset (CSS)
```

## Daten

SQLite unter `data/app.db` (gitignored). Wichtige Tabellen:
`users`, `mqtt_config`, `sessions`,
`stromverbrauch_config`/`_aggregation`/`_counter_state`,
`pv_plants`/`pv_aggregation`/`pv_summary_aggregation`/`pv_calibration_buckets`,
`sun_intensity_samples`,
`batterie_config`,
`modules`, `pool_config`,
`outputs`, `dashboard_groups`, `dashboard_widgets`.

Passwörter werden als scrypt-Hash gespeichert.

## Lizenz

ISC
