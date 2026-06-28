# PROJECT_CONTEXT — homeESS

> **Zweck dieser Datei:** Einstieg für neue Agent-Sitzungen ohne erneute
> Vollanalyse. Hält Architektur, Konventionen und offene Punkte fest.
> Bei strukturellen Änderungen mitpflegen. Siehe auch [README.md](README.md)
> (Bedienung) und [CHANGELOG.md](CHANGELOG.md) (Verlauf).

## Was ist homeESS?

Basis für ein **Energy Storage System (ESS)**. Der Server abonniert
MQTT-Topics (Quelle: ioBroker-Broker), hält die eingehenden Werte in einem
Cache und soll daraus ableiten, **wie Lasten geschaltet werden** (Regel-Engine,
noch nicht implementiert). Bedienoberfläche ist ein Web-Dashboard mit
vorgeschaltetem Login.

**Aktueller Funktionsstand:**
- Login (Passwort) mit **„Passwort merken"**-Checkbox.
- **Dashboard** mit frei konfigurierbaren **Widgets** (jeder berechnete Wert als
  Live-Kachel) und **Gruppen** (Titel + Breite voll/halb/viertel). Widgets und
  Gruppen per **Drag & Drop** anordbar, Widgets in Gruppen verschiebbar,
  Widgets/Gruppen bearbeit- und löschbar. Quelle der Werte: derselbe
  Wert-Katalog wie die Output-Seite (`output/internal-values.js`).
- **Stromverbrauch**: MQTT-Topic-Felder für Eigenverbrauch L1–L3, Netzbezug
  L1–L3 und Zählerstände; oben Eigenverbrauch/Netzbezug als Phasensummen,
  Woche/Jahr aus Tageswert plus Tagesstart-Abgleich; Jahreswechsel → Vorjahr.
- **Photovoltaik**: verwaltet mehrere PV-Anlagen (Stammdaten, Zelltyp,
  **Konverter-/Reglertyp**, MQTT-Topics). Je Anlage **aktuelle Leistung groß,
  Clear-Sky-Idealwert klein**.
  Ideal = `kWp × Einstrahlung/1000 × Wirkungsgrad × Zell-Temperaturfaktor ×
  Konverter-Wirkungsgrad`; der **Wirkungsgrad wirkt als Kalibrierfaktor**, die
  Zell-Temperaturkorrektur ist zelltyp-spezifisch bezogen auf 20 °C, der
  **Konverter-Wirkungsgrad** (MPPT-Regler, Wechselrichter, …) ist typ- und
  temperaturabhängig (Geräte auf Außentemperaturniveau, Referenz 25 °C,
  `converters.js`). Der **Sonnenstand** nutzt die echte Ortssonnenzeit: die per
  MQTT gelieferte Wanduhrzeit wird über **Längengrad, Zeitzonen-UTC-Versatz
  (inkl. Sommerzeit) und Zeitgleichung** umgerechnet (`aggregation.js`,
  `buildSolarContext`); ohne Längengrad/Zeitzone gilt die unkorrigierte Ortszeit.
  **Direkte-Sonne-Erkennung** je Anlage über `Ist/Ideal ≥ zelltyp-Schwelle`
  (☀️/☁️) und globales **Himmelssymbol in der Titelzeile** (☀️/☁️/🌙 je
  Sonnenstand, via `/live/header`). Bewertet wird nur, solange die Anlage als
  **Sonnenreferenz** taugt (siehe Sonnenintensität). Ertrag heute/Woche/Jahr inkl.
  Vorjahr.
  **PV-Prognose** (`photovoltaik/forecast.js`): Prognosestreifen unter den
  KPI-Kacheln mit erwartetem Tagesertrag (kWh) für Heute + 3 Tage. Quelle ist die
  stündliche Strahlungsprognose von **Open-Meteo** (`wetter/client.js`, kostenlos,
  kein API-Key, 30-min-In-Memory-Cache, Startup-Prime + 30-min-Refresh in
  `app.js`). Die Prognose nutzt **dieselbe** Transposition + Skalierung wie der
  Live-Idealwert (gemeinsame Helfer `solarGeometryAt`, `transposePlaneIrradiance`,
  `idealPowerFromIrradiance` in `aggregation.js`) — nur mit prognostizierter statt
  modellierter Clear-Sky-Strahlung, daher konsistent mit dem Live-Modell. Read-only;
  clientseitig über `/photovoltaik/forecast` aktualisiert (15-min-Takt). Die
  **Heute-Karte** zeigt zusätzlich den **bis jetzt** erwarteten und den **noch
  erwarteten** Ertrag (Aufteilung des Tagesgesamtwerts an der lokalen Uhrzeit,
  laufende Stunde anteilig).
  **Selbstkalibrierung** (`photovoltaik/calibration.js`, je Anlage per Checkbox
  `auto_calibrate`): ein **pro Tageszeit-Bucket (15 min, 0..95)** hinterlegter
  Kalibrierfaktor (`pv_calibration_buckets`). Je abgeschlossenem 15-min-Fenster wird
  der **gemessene Leistungs-Durchschnitt** der letzten 15 Minuten gegen die von
  **Open-Meteo gelieferte Strahlung desselben Fensters** (`minutely_15`, in
  erwartete Leistung umgerechnet) verglichen und der Bucket sanft per EMA (α≈0,05)
  auf `gemessen/erwartet` nachgezogen. Weil die Wetter-Strahlung die Bewölkung
  bereits enthält, fällt das frühere Klarhimmel-Gate weg; verbleibende Gates: hoher
  Sonnenstand (erwartet ≥ 20 % Peak), kein voller Akku (`batterie.soc`, Abregelung),
  Verhältnis plausibel (0,4–1,3). Der Messdurchschnitt wird über die 60-s-Ticks im
  Speicher akkumuliert. Ein **neuer Bucket** übernimmt den Faktor des vorangehenden
  Buckets als Startwert (statt 1,0); der frisch berechnete Faktor wird zudem auf den
  neuen (aktuellen) Bucket übernommen, sofern dort noch kein Wert (z. B. aus dem
  Vorjahr) liegt. Sobald ein Bucket einen Wert besitzt, multipliziert sein Faktor den
  Idealwert (`idealEffektiv = idealBasis × factor`) — wirkt auf Live-Ideal,
  Sonnenintensität **und** Prognose und bildet u. a. Verschattung ab. Der aktuelle
  Faktor wird zur Diagnose in der Anlagenzeile angezeigt. Tick im 60-s-Job
  (`app.js`). **Bucket-Reset** beim Löschen einer Anlage sowie bei Änderung von
  Ausrichtung oder Gesamtleistung (`plants.js`).
- **Sonnenintensität** (`photovoltaik/sun-intensity.js`): Ist/Ideal in %,
  gedeckelt auf 100 %, nur über Anlagen gebildet, die aktuell als **Sonnenreferenz**
  taugen — d. h. ihr Klarhimmel-Idealwert erreicht mindestens den anlagenweise
  konfigurierten **größenrelativen Cutoff** (`isSunReference`/`sunCutoffWatt` in
  `aggregation.js`: `idealBasis ≥ kWp × 1000 × Cutoff%`, Cutoff getrennt für
  morgens/abends, Default 10 %). So fließen off-axis-Anlagen (z. B. die große
  Südanlage morgens) nicht ein und ziehen das Verhältnis nicht künstlich hoch.
  Momentanwert plus 10-Minuten-/Tages-/Vortagsmittel aus periodischen Samples
  (`sun_intensity_samples`, Sampling im 60-s-Intervall in `app.js`).
- **Batterie** (`/batterie`): voll implementiert. MQTT-Topics für SoC (%),
  Leistung (W, positiv = laden), Spannung (V), Temperatur (°C) konfigurierbar;
  KPI-Kacheln nur wenn Topic gesetzt; SoC-Balken farbcodiert (grün/dunkelgelb/rot).
  Live-Updates via SSE. State-Definitionen integriert (kein Ad-hoc-System).
  **Titelzeile:** Batterie-Ladeanzeige als Icon mit Füllstand + Prozentzahl,
  erscheint automatisch sobald `batterie.soc`-Wert im Cache vorhanden ist.
- **Output** (`/output`): beliebige berechnete Werte (Wert-Katalog) an
  ioBroker-**Ziel-Topics** zurückgeben. Die **Engine** (`output/engine.js`)
  wertet den Katalog debounced bei MQTT-Änderungen + alle 60 s aus und
  publiziert je Output nur bei Wertänderung (`client.publish` gemäß MQTT.md).
- **Optionale Module** (`src/modules/index.js`): generische Registry +
  In-Memory-Enabled-State; Seite `/module` zum Aktivieren/Deaktivieren.
  Aktivierte Module erscheinen automatisch in der Sidebar. Aktuell:
  - **Poolsteuerung** (`/pool`): Solarpumpe + Filterpumpe mit je Status-/
    Steuerungs-Topic, Priorität 1–5. KPI-Kacheln (Temperatur, Pumpen, pH, Chlor)
    nur wenn konfiguriert. **Drei Modus-Buttons** (An/Aus/Automatik) je Pumpe,
    aktiver Button hervorgehoben.
    - *Solarautomatik*: sonnenbasiert, 2-Min-Mindesthaltedauer, Maximaltemperatur
      mit konfigurierbarer Probezyklus-Einschaltdauer (s) und Pause (min).
      Option „Filterpumpe für Probelauf verwenden" (wenn Filterpumpe konfiguriert).
      **Probeläufe nur bei Sonneneinstrahlung** (`hasSun`): Neue Proben starten nur
      wenn Sonne scheint. Eine bereits laufende Probe wird bei Beschattung vollständig
      zu Ende geführt. Der Pausenzähler (`tempCycleStart`) läuft bei Beschattung still
      weiter (kein Reset); kehrt die Sonne zurück und ist die Pausenzeit abgelaufen,
      startet sofort eine neue Probe.
    - *Filterautomatik*: bis zu 3 Zeitfenster, Follow-Solar, Akku-Override
      (liest `batterie.soc` aus dem zentralen Cache — kein eigenes Topic).
    - Polling `/pool/status` alle 5 s (Pool-Topics außerhalb der normalen
      State-Definitionen, via Ad-hoc-Subscription-System in `client.js`).
    - `getEffectivePriority(which, cfg)` liefert während Filter-Probeläufen die
      Solarpumpen-Priorität — Schnittstelle für das künftige Last-Management.
- **Wert-Katalog** (`output/internal-values.js`): berechnete und gemessene Werte
  für Outputs und Dashboard-Widgets. Enthält PV, Stromverbrauch, Sonnenintensität,
  **PV-Prognose** (erwarteter Tagesertrag heute/morgen/+2/+3 sowie heute bisher /
  heute noch erwartet) **sowie Batterie-Werte** (SoC, Leistung, Spannung,
  Temperatur) und **Pool-Werte** (Wassertemperatur, Pumpen-Status, pH, Chlor — nur
  wenn Modul aktiv). Die Kalibrierfaktoren sind bewusst **nicht** im Katalog (reine
  Diagnose). Alle Einträge haben `id`, `label`, `value`, `display`.
- Einstellungen (Karten-Layout): Passwort ändern, **Standort & Zeit**
  (Breiten-/Längengrad, Zeitzone, automatische Zeitumstellung — Eingangsgrößen
  fürs Clear-Sky-Modell), MQTT-Broker konfigurieren + Verbindung testen.
- MQTT-Verbindungs-Manager (Connect/Reconnect/Cache **+ publish**); abonnierte
  Topics ergeben sich aus den konfigurierten States (`mqtt/state-definitions.js`)
  plus Ad-hoc-Abonnements für Pool-Topics.
- **Live-Updates** per SSE (`/live/events`); Header-Werte + Himmelssymbol +
  Batterie-SoC über `/live/header`.
- **systemd-Service** `home-ess` — startet automatisch beim Systemstart.

## Leitprinzipien (vom Auftraggeber vorgegeben)

1. **Keine statischen Seiten.** Jede Seite wird serverseitig dynamisch
   gerendert (Template-Funktionen in `src/views/`). `public/` enthält nur
   statische Assets (CSS).
2. **Eine Datei pro Funktion.** Jede neue Funktion/Feature kommt in eine eigene
   kleine `.js`-Datei, um Dateien überschaubar zu halten und den Ausbau zu
   vereinfachen.
3. **Modulgrenzen:** Rendering (`views/`), HTTP-Routen (`routes/`, `auth/`),
   Fachlogik (`mqtt/`, `auth/`, Module-Unterverzeichnisse), Infrastruktur
   (`db.js`, `config.js`, `app.js`).

## Verzeichnisstruktur

```
server.js                 Einstiegspunkt: App bauen + listen
src/
  config.js               Zentrale Konstanten (Port, Cookie, DB-Pfad, Timeouts)
  db.js                   SQLite öffnen, Schema, Seed, Migrationen
  app.js                  Express-App zusammenbauen + periodische Jobs
  modules/
    index.js              Modul-Registry + In-Memory-Enabled-State
  auth/
    password.js           scrypt-Hashing
    session.js            DB-gestützte Cookie-Sessions + requireAuth
    routes.js             /, POST /login, /logout
  mqtt/
    topics.js             ioBroker-Topic-Helfer (reine Funktionen, aus MQTT.md)
    config.js             MQTT-Config + Umgebungs-Snapshot (Temp/Zeit/Datum)
    client.js             Verbindungs-Manager + publish + testConnection
                          + Ad-hoc-Subscription-API (subscribeAdHoc)
    state-definitions.js  Sammelt alle abonnierten Topics (mqtt/strom/pv/batterie)
  stromverbrauch/
    config.js             Topics laden/speichern + buildStateDefinitions
    aggregation.js        Aggregation (schreibend) + readStromverbrauchValues
  photovoltaik/
    plants.js             CRUD + MQTT-State-Definitionen + Zelltyp-Vorgabewerte
    converters.js         Konverter-/Reglertypen + temperaturabh. Wirkungsgrad
    aggregation.js        Clear-Sky/Ideal, direkte Sonne, Himmelszustand,
                          readPhotovoltaikValues (read-only); gemeinsame Helfer
                          solarGeometryAt/transposePlaneIrradiance/
                          idealPowerFromIrradiance (von Live + Prognose genutzt)
    forecast.js           PV-Prognose: Open-Meteo-Strahlung → Tageserträge (kWh)
    calibration.js        Selbstkalibrierung: 15-min-Kalibrierfaktor je Anlage/Bucket
                          (gemessen vs. Open-Meteo-Strahlung, EMA, Gates SoC/Sonne)
    sun-intensity.js      Momentane Intensität + Sampling + Mittelwerte
  wetter/
    client.js             Open-Meteo-Abruf (GHI/DNI/DHI/Temp, stündlich +
                          minutely_15) + In-Memory-Cache
  batterie/
    config.js             Topics laden/speichern, buildBatterieStateDefinitions,
                          readBatterieData
  pool/
    config.js             Topics laden/speichern, rowToConfig, subscribePoolTopics,
                          readPoolValue
    automation.js         Pump-Automation (solar/filter), Modus-Buttons,
                          getEffectivePriority, getPumpMode/setPumpMode
  output/
    internal-values.js    Katalog (PV, Strom, Batterie, Pool, Sonne)
    outputs.js            Output-CRUD
    engine.js             Publish-Engine (diff, debounced)
  dashboard/
    groups.js             Gruppen-CRUD
    widgets.js            Widget-CRUD
  routes/
    dashboard.js          GET /dashboard + Widget/Gruppen-CRUD + /layout + /data
    stromverbrauch.js     GET /stromverbrauch + Topic/Abgleich-POSTs + /data
    photovoltaik.js       GET /photovoltaik + CRUD + /data + /forecast
    batterie.js           GET /batterie + POST /batterie/topics + GET /batterie/data
    output.js             GET /output + Output-CRUD + /data
    settings.js           GET /settings, POST password/mqtt/mqtt-test
    live.js               SSE /live/events + /live/header
    modules.js            GET /module + POST /module/:key/enable|disable
    pool.js               GET /pool + POST /pool/config + GET /pool/status
                          + POST /pool/pump/:which/:mode
  views/
    components.js         escapeHtml, statusText
    layout.js             App-Hülle + Nav + Header-Live-Script (inkl. Batterie-Icon)
    login.js              Login-Seite
    dashboard.js          Dashboard: Widgets/Gruppen, Drag&Drop, Dialoge
    stromverbrauch.js     Stromverbrauch — KPI-Kacheln + Config
    photovoltaik.js       Photovoltaik — Anlagenliste
    batterie.js           Batterie — KPI-Kacheln + SoC-Balken + Config
    output.js             Output — Zeilenliste
    settings.js           Einstellungen
    modules.js            Modul-Verwaltung
    pool.js               Pool — KPI-Kacheln + Pumpen-Buttons + Config
public/styles.css         Einziges statisches Asset
data/app.db               SQLite (gitignored)
MQTT.md                   Referenz: ioBroker-MQTT-Regeln
```

## Datenmodell (SQLite)

- `users(id, password)` — Passwort als scrypt-Hash.
- `mqtt_config(id=1, host, port, username, password, latitude, longitude, timezone,
  dst_enabled, outdoor_temperature_topic, clock_time_topic, clock_date_topic)`
- `sessions(id, expires_at)`
- `stromverbrauch_config(id=1, eigenverbrauch_l1-3_topic, netzbezug_l1-3_topic,
  netzbezug_zaehler_l1-3_topic, einspeisung_zaehler_l1-3_topic)`
- `stromverbrauch_aggregation(id=1, week/year_import/export_offset, previous_year_*, ...)`
- `stromverbrauch_counter_state(counter_key, last_raw_value, day_total, last_day_key)`
- `pv_plants(id, name, kw_peak, efficiency, orientation, tilt, is_consumer_side,
  cell_type, converter_type, power_topic, today_yield_topic, auto_calibrate,
  sun_cutoff_morning, sun_cutoff_evening)` — die beiden Cutoff-Spalten (Prozent,
  Default 10) steuern den größenrelativen Sonnenreferenz-Cutoff morgens/abends.
- `pv_aggregation(plant_id, ...)` / `pv_summary_aggregation(id=1, ...)`
- `pv_calibration_buckets(plant_id, bucket 0..95, factor, sample_count, updated_at,
  window_minutes)` — je Anlage und 15-Min-Tageszeit-Bucket ein langsam nachgeführter
  Kalibrierfaktor (`window_minutes` dokumentiert die Fensterbreite und dient als
  Migrations-Marker; Altbestand wird einmalig verworfen).
- `sun_intensity_samples(id, recorded_at, day_key, intensity, day_average_eligible)`
- `outputs(id, source_id, target_topic)`
- `dashboard_groups(id, title, width, position)`
- `dashboard_widgets(id, source_id, group_id, position)`
- `batterie_config(id=1, soc_topic, power_topic, voltage_topic, temperatur_topic)`
- `modules(key TEXT PRIMARY KEY, enabled INTEGER)` — aktivierte optionale Module.
- `pool_config(id=1, temperature_topic, solar_pump_status_topic,
  solar_pump_command_topic, solar_pump_priority, solar_pump_max_temp,
  solar_pump_temp_on_seconds, solar_pump_temp_pause_minutes,
  solar_pump_temp_use_filter, filter_pump_status_topic,
  filter_pump_command_topic, filter_pump_priority, filter_pump_follow_solar,
  filter_time_1_start/end, filter_time_2_start/end, filter_time_3_start/end,
  filter_battery_enabled, filter_battery_soc, ph_topic, chlor_topic)`

> **Wert-Katalog** (`output/internal-values.js`): Outputs **und** Dashboard-Widgets
> beziehen ihre Werte aus demselben Katalog. Enthält PV (Leistungen, Erträge,
> Sonne), Stromverbrauch (Leistungen, Energien je Zeitraum, Zählersummen),
> Sonnenintensität, **PV-Prognose** (Tagesertrag heute/morgen/+2/+3 sowie heute
> bisher / noch erwartet), **Batterie** (SoC, Leistung, Spannung, Temperatur — wenn
> konfiguriert), **Pool** (Wassertemperatur, Pumpen-Status, pH, Chlor — wenn
> Modul aktiv). Jeder Eintrag hat `id`, `label`, `value`, `display`.

## MQTT Ad-hoc-Subscriptions (Pool)

Pool-Topics liegen außerhalb der normalen State-Definitionen (Pool ist optional,
Topics ändern sich per Config). `client.subscribeAdHoc(configuredTopic, cacheKey)`
registriert alle `mqttReadCandidates` als Routen und abonniert alle
`mqttSubscribeCandidates` (inkl. Wildcard für Slash-States). `/get`-Anfragen
werden beim Subscribe und beim Reconnect gesendet. Cache-Keys: `pool:<topic>`.
Abgerufen über `readPoolValue(cache, topic)`.

## Prioritäten / Last-Management (Vorbereitung)

Jeder Aktor hat eine konfigurierbare Priorität 1–5 (1 = höchste). Aktuell
rein informativer Wert. Schnittstelle für das künftige Last-Management:
`poolAutomation.getEffectivePriority(which, cfg)` — gibt während eines
Filter-Probelaufs (Filterpumpe übernimmt Solarprobelauf) die
Solarpumpen-Priorität für die Filterpumpe zurück. Neue Module sollen eine
analoge `getActors(cfg)`-Funktion exportieren, die ein zentrales Modul
(`src/load-management/priority.js`, noch nicht existiert) aggregiert.

## Wichtige Entscheidungen / Eigenheiten

- **Sessions statt Flag:** Cookie-Name `ess_sid`. „Merken" → 30-Tage-Cookie;
  sonst Session-Cookie (serverseitig 12 h gültig).
- **Passwörter gehasht** (Node `crypto.scrypt`). Default beim ersten Start: `admin`.
- **MQTT/ioBroker-Regeln** in [MQTT.md](MQTT.md) und in `mqtt/topics.js` umgesetzt.
- **Batterie = zentrales Element**: `batterie.soc` ist der einzige SoC-Wert
  der gesamten Plattform. Der Pool-Akku-Override liest diesen State direkt aus
  dem Cache — kein eigenes Topic. Das Batterie-SoC-Icon in der Titelzeile ist
  permanent sichtbar (sobald konfiguriert).
- **DB-Pfad** via Env `HOME_ESS_DB`, Port via `PORT`.

## Nächste sinnvolle Schritte (Roadmap)

1. **Last-Management / Regel-Engine:** zentrales Modul das Aktoren nach Priorität
   schaltet, wenn Batterie-SoC unter/über Schwellwerte fällt. Basis: `getEffectivePriority`.
2. **Watchdog/Reconnect-Härtung** gemäß MQTT.md (stille Subscriptions erkennen).
3. **Session-Cleanup:** abgelaufene `sessions`-Zeilen periodisch löschen.
4. **Drag&Drop für Touch** (aktuell native HTML5-DnD, nur Maus/Desktop).
5. **Sample-Pflege:** `sun_intensity_samples` werden beim Sampling zwar gekürzt
   (2 Tage) — bei langem Stillstand des Samplers ggf. separater Cleanup.
6. **Selbstkalibrierung (umgesetzt):** 15-min-Kalibrierfaktor je Anlage/Bucket aus
   gemessenem Schnitt vs. Open-Meteo-Strahlung (`calibration.js`,
   `pv_calibration_buckets`). Mögliche Verfeinerungen: Solar-Zeit- statt
   Wanduhr-Buckets (saisonstabilere Verschattung), UI-Kurve der Faktoren über den
   Tag, Persistenz des laufenden 15-min-Messfensters über Neustarts hinweg.

## Konventionen für read-only Wert-Provider

- Die Snapshot-Builder `buildStromverbrauchSnapshot` / `buildPhotovoltaikSnapshot`
  **schreiben** in die DB. Sie laufen nur in den 60-s-Intervallen in `app.js`.
- Für häufige Auswertung: **schreibfreie** Provider `readStromverbrauchValues` /
  `readPhotovoltaikValues` / `readBatterieData`. Neue „Live"-Verbraucher **immer**
  diese read-only Varianten nutzen.

## Service-Verwaltung (systemd)

```bash
systemctl status home-ess      # Status
systemctl restart home-ess     # Neustart nach Code-Änderungen
systemctl stop home-ess        # Stoppen
journalctl -u home-ess -f      # Live-Log
```

Unit-Datei: `/etc/systemd/system/home-ess.service`
WorkingDirectory: `/opt/home-ess`, User: `root`, Restart: `on-failure`.

## Lokaler Start / Test

```bash
npm install
npm start                 # Port 3000, Login mit "admin"
npm run dev               # mit --watch
HOME_ESS_DB=/tmp/t.db PORT=3001 npm start   # Wegwerf-DB für Tests
```
