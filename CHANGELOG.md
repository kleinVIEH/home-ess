# Changelog

Alle nennenswerten Änderungen an homeESS. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [0.7.0] — 2026-06-28

### Hinzugefügt

- **PV-Prognose** (`photovoltaik/forecast.js`, `wetter/client.js`):
  Prognosestreifen unter den KPI-Kacheln mit erwartetem Tagesertrag (kWh) für
  **Heute + 3 Tage**. Quelle ist die stündliche Strahlungsprognose
  (GHI/DNI/DHI + Temperatur + Bewölkung) von **Open-Meteo** — kostenlos, kein
  API-Key, 30-min-In-Memory-Cache mit Stale-on-Error, Startup-Prime und
  30-min-Refresh in `app.js`. Standortbezug über die tatsächlich genutzten
  Open-Meteo-Gitterkoordinaten als Label im Streifen.
  - Die Prognose nutzt **dieselbe** Geometrie + Transposition + Skalierung wie der
    Live-Idealwert (gemeinsame Helfer `solarGeometryAt`, `transposePlaneIrradiance`,
    `idealPowerFromIrradiance` aus `aggregation.js`) — nur mit prognostizierter statt
    modellierter Clear-Sky-Strahlung. Read-only; clientseitig über
    `/photovoltaik/forecast` im 15-min-Takt aktualisiert.
  - **Heute-Karte aufgeteilt**: großer Tagesgesamtwert (Vorsatz „gesamt") plus
    **„bis jetzt"** (laut Prognose bis zum aktuellen Moment erwarteter Ertrag) und
    **„noch erwartet"** (Rest des Tages). Aufteilung anhand der lokalen Uhrzeit,
    laufende Stunde anteilig; Open-Meteo-Strahlung als Mittel der vorangehenden
    Stunde berücksichtigt.

- **Selbstkalibrierung** (`photovoltaik/calibration.js`, je Anlage per Checkbox
  **„Automatische Kalibrierung"**): ein **pro Tageszeit-Bucket (15 min, 0..95)**
  hinterlegter Kalibrierfaktor (`pv_calibration_buckets`, Default 1,0). Je
  abgeschlossenem 15-min-Fenster wird der **gemessene Leistungs-Durchschnitt** der
  vergangenen 15 Minuten gegen die von **Open-Meteo gelieferte Strahlung desselben
  Fensters** (`minutely_15`, in erwartete Leistung umgerechnet) verglichen und der
  Bucket sanft per EMA (α≈0,05) auf `gemessen/erwartet` nachgezogen. Da die
  Wetter-Strahlung die tatsächliche Bewölkung bereits enthält, isoliert das
  Verhältnis anlagenspezifische, tageszeit-abhängige Effekte (v. a.
  **Verschattung**) — ein Klarhimmel-Gate ist dafür nicht mehr nötig.
  - Gates: **hoher Sonnenstand** (erwartete Leistung ≥ 20 % Peak), **kein voller
    Akku** (`batterie.soc` < 95 %, Abregelungsschutz), Verhältnis plausibel (0,4–1,3).
  - **Startwert-Übernahme**: ein neuer Bucket übernimmt den Faktor des vorangehenden
    Buckets als Startwert (statt 1,0); der frisch berechnete Faktor wird zudem auf den
    neuen (aktuellen) Bucket übernommen — es sei denn, dort liegt bereits ein Wert
    (z. B. aus dem Vorjahr).
  - Der wirksame Faktor multipliziert den Idealwert (`idealEffektiv = idealBasis ×
    factor`), sobald der Bucket einen Wert besitzt — wirkt auf Live-Ideal,
    Sonnenintensität **und** Prognose. Der aktuelle Faktor wird zur Diagnose in der
    Anlagenzeile angezeigt. Mess-Akkumulation und Fensterauswertung im 60-s-Job
    (`app.js`).
  - **Bucket-Reset**: Wird eine Anlage **gelöscht** oder ihre **Ausrichtung bzw.
    Gesamtleistung** geändert, werden ihre Buckets verworfen (passen nicht mehr zur
    Geometrie/Skalierung) und neu gelernt.

- **Wert-Katalog** (`output/internal-values.js`) um **Prognosewerte** erweitert
  (für Outputs und Dashboard-Widgets):
  - Erwarteter Tagesertrag **heute / morgen / in 2 Tagen / in 3 Tagen**.
  - **Heute bisher** (`pv.forecast.today.elapsed`) und **heute noch erwartet**
    (`pv.forecast.today.remaining`).
  - Die Kalibrierfaktoren sind bewusst **nicht** im Katalog (reine Diagnose).

### Geändert

- **Sonnenreferenz-Cutoff jetzt größenrelativ** statt absoluter 50-W-Schwelle
  (`photovoltaik/aggregation.js`, `sun-intensity.js`, `plants.js`): Eine Anlage zählt
  nur noch dann als Sonnenreferenz (für Sonnenintensität **und** ☀️/☁️-Erkennung),
  wenn ihr Klarhimmel-Idealwert mindestens einen konfigurierbaren **Anteil ihrer
  kWp-Spitzenleistung** erreicht — die Sonne also brauchbar auf ihre Modulebene
  scheint. Behebt, dass eine **große, off-axis stehende Anlage** (z. B. Südanlage
  morgens bei Sonne im Osten) trotz Bewölkung aus Diffuslicht weit mehr als ihren
  winzigen Idealwert lieferte und so das Ist/Ideal-Verhältnis verfälschte
  (scheinbare Sonne trotz Wolken). Der absolute 50-W-Boden entfällt; der relative
  Cutoff skaliert automatisch für kleine **und** große Anlagen. Neue Helfer
  `sunCutoffWatt` / `isSunReference`; off-axis-Anlagen fallen aus Zähler **und**
  Nenner der Sonnenintensität.
  - **Pro Anlage konfigurierbar**, getrennt für **morgens / abends** (vor bzw. nach
    Sonnenhöchststand, `decimalHours < 12`), neue Spalten `sun_cutoff_morning` /
    `sun_cutoff_evening` in `pv_plants` (Default **10 %**, Migration vorhanden), zwei
    neue Formularfelder im PV-Anlagen-Dialog.

- **PV-Aggregation refaktoriert** (`photovoltaik/aggregation.js`): Clear-Sky-Geometrie
  und Plane-of-Array-Transposition in wiederverwendbare Helfer ausgelagert
  (`solarGeometryAt`, `transposePlaneIrradiance`, `idealPowerFromIrradiance`), die
  Live-Pfad **und** Prognose teilen — verhaltensneutral (numerisch identisch zum
  bisherigen Live-Ergebnis).

### Geändert

- **Poolsteuerung — Probelauf sonnenabhängig** (`pool/automation.js`): Der
  Probebetrieb der Solarpumpe startet jetzt nur noch bei direkter
  Sonneneinstrahlung. Der Sonnenzustand (`hasSun`) wird einmalig pro Tick
  ermittelt und in beiden Pfaden (Temp-Modus + normaler Betrieb) genutzt:
  - Eine bereits **laufende Probe** wird bei einsetzender Beschattung zu Ende
    geführt (volle konfigurierte Einschaltdauer) — erst danach schaltet die
    Pumpe ab.
  - Der **Pausenzähler** (`tempCycleStart`) wird nur zurückgesetzt, wenn eine
    Probe regulär abgeschlossen wurde. Bei Beschattung ohne laufende Probe läuft
    er still weiter. Kehrt die Sonne zurück und ist die Pausenzeit abgelaufen,
    startet sofort eine neue Probe.

### Behoben

- **Fresh-DB-Crash** `pool_config has no column named solar_pump_status_topic`:
  `CREATE TABLE pool_config` deklariert jetzt alle Spalten vollständig (mit Defaults),
  statt sie nur per Migration nachzurüsten — beseitigt das Seed/Migration-Race auf
  einer frischen Datenbank. Migration bleibt als No-op-Upgrade für Bestands-DBs.

### Datenmodell

- `pv_plants` um **`auto_calibrate`** erweitert (Migration; Default 0).
- Neue Tabelle **`pv_calibration_buckets`** (`plant_id`, `bucket 0..95`, `factor`,
  `sample_count`, `updated_at`, `window_minutes`; FK → `pv_plants` ON DELETE CASCADE).
  Bei der Umstellung von 10- auf 15-min-Buckets werden Bestandsdaten einmalig
  verworfen (Migration `migratePvCalibrationBuckets`, Marker-Spalte `window_minutes`).

---

## [0.6.0] — 2026-06-27

### Hinzugefügt

- **Batterie-Seite** (`/batterie`) vollständig implementiert:
  - MQTT-Topics für SoC, Leistung, Spannung, Temperatur konfigurierbar.
  - KPI-Kacheln nur wenn jeweiliges Topic konfiguriert.
  - SoC-Balken mit Farbwechsel (grün ≥ 50 %, dunkelgelb 20–49 %, rot < 20 %).
  - Leistungsanzeige mit Richtungsindikator (Laden · X W / Entladen · X W / Bereit).
  - Live-Updates via SSE-Event `homeess:mqtt` + 30-s-Fallback-Poll.
  - `src/batterie/config.js`: load/save, `buildBatterieStateDefinitions`,
    `readBatterieData`. Battery-Topics gehen in die State-Definitionen ein
    (Standard-Subscription, kein Ad-hoc-System).
  - `batterie_config`-Tabelle in SQLite.

- **Batterie-Ladeanzeige in der Titelzeile**: Icon in Batterieform rechts im
  Header, erscheint automatisch sobald ein SoC-Wert im Cache vorliegt.
  Füllstand, Farbwechsel und Prozentzahl werden über `/live/header` + SSE
  live aktualisiert. Feste Zeichenbreite verhindert Layout-Shift bei
  Stellenänderung.

- **Optionale Module** (`src/modules/index.js`): generische Registry + In-Memory-
  Enabled-State; neue Seite `/module` zum Aktivieren/Deaktivieren.
  Aktivierte Module erscheinen automatisch in der Sidebar-Navigation.

- **Poolsteuerung** (`/pool`, optionales Modul):
  - **Zwei Pumpen**: Solarpumpe + Filterpumpe, je mit Status- und
    Steuerungs-Topic, Priorität 1–5 (Solar: Standard 2, Filter: Standard 4).
  - KPI-Kacheln nur wenn Topic konfiguriert (Wassertemperatur, Pumpen, pH, Chlor).
  - **Drei Modus-Buttons pro Pumpe** (An / Aus / Automatik), aktiver Button
    farblich hervorgehoben; Modus bleibt bis zur nächsten Änderung, Automatik
    nach Server-Neustart.
  - **Solarsteuerung**: sonnenbasiert (Himmelszustand), 2-Minuten-Mindesthaltedauer,
    optionale Maximaltemperatur mit konfigurierbarer Probezyklus-Einschaltdauer
    (s) und Pause (min).
  - **Filtersteuerung**: bis zu 3 Zeitfenster, Follow-Solar-Option,
    Akku-Override (zusätzliches Einschalten ab konfigurierbarem SoC-Schwellwert —
    liest `batterie.soc` aus dem zentralen Cache, kein eigenes Topic).
  - **„Für Probelauf die Filterpumpe verwenden"**: Checkbox nur aktiv wenn
    Filter-Status- und Steuerungs-Topic konfiguriert; bei aktiviertem Haken
    übernimmt die Filterpumpe die Probeläufe, Solarpumpe wird beim Eintritt in
    den Temp-Modus sofort abgeschaltet und beim Austritt die Filterpumpe.
  - **MQTT Ad-hoc-Subscriptions** für Pool-Topics (außerhalb der normalen
    State-Definitionen, mit vollem `mqttReadCandidates`/`mqttSubscribeCandidates`-
    und `/get`-Mechanismus gemäß MQTT.md).
  - **Prioritätshandler** `getEffectivePriority(which, cfg)` in
    `src/pool/automation.js`: gibt während eines Filter-Probelaufs die
    Solarpumpen-Priorität für die Filterpumpe zurück — Vorarbeit für das
    spätere Last-Management.
  - Neue DB-Tabellen: `modules`, `pool_config`.

- **Wert-Katalog** (`output/internal-values.js`) erweitert:
  - Batterie-Werte: SoC (%), Leistung (W), Spannung (V), Temperatur (°C) —
    je nach konfigurierten Topics.
  - Pool-Werte: Wassertemperatur, Solarumpen-Status, Filterpumpen-Status,
    pH-Wert, Chlor — nur wenn Pool-Modul aktiv und Topic konfiguriert.
  - Alle neuen Werte stehen Outputs und Dashboard-Widgets zur Verfügung.

### Geändert

- **Batterie-Seite** von Stub auf vollständige Implementierung mit Config-Formular
  und Live-Daten aktualisiert.
- **Pool-Akku-Override**: kein eigenes SoC-Topic mehr — liest den Wert über
  `batterie.soc` aus dem zentralen MQTT-Cache. Checkbox ausgegraut wenn kein
  Batterie-SoC-Topic konfiguriert ist.
- **`/live/header`** gibt jetzt zusätzlich `batterySoc` zurück.
- **`loadAllStateDefinitions`** integriert Batterie-State-Definitionen.
- **Batterie-Farben** vereinheitlicht: dunkelgelb `#d4a500` für 20–49 %
  (statt Orange) — identisch in Header-Icon und Batterie-Seite.

---

## [0.5.0] — 2026-06-27

### Hinzugefügt
- **Einstellungen — Standort & Zeit**: Felder **Längengrad** und **Zeitzone**
  (Auswahlliste) sowie Checkbox **„automatische Zeitumstellung"** (Sommer-/
  Winterzeit). Dienen ausschließlich der Präzisierung des Clear-Sky-Modells und
  haben keinen Einfluss auf übermittelte Uhrzeit/Datum.
- **Einstellungen — Karten-Layout**: Seite in Karten gegliedert (Passwort,
  Standort & Zeit, MQTT-Verbindung, MQTT-Topics, Aktionen/Protokoll).
- **PV-Anlagen — Konverter/Regler** (`photovoltaik/converters.js`): Auswahl des
  Gerätetyps (MPPT-/PWM-Solarladeregler, String-/Hybrid-/Mikro-/Zentral-/
  Insel­wechselrichter, DC-Direktmessung, Sonstiges) mit hinterlegten
  **typischen, temperaturabhängigen Geräte-Wirkungsgraden**. Geht zusätzlich
  zum Anlagen-Wirkungsgrad in den Idealwert ein.
- **Zelltypische Vorgabe-Wirkungsgrade**: Bei Auswahl des Zelltyps wird ein
  typischer Wert ins Wirkungsgrad-Feld vorbelegt (nur Startwert, frei
  feinkalibrierbar — **keine direkte** Modellnutzung).

### Geändert
- **Clear-Sky-Modell — wahre Ortssonnenzeit** (`photovoltaik/aggregation.js`):
  Die per MQTT empfangene lokale Wanduhrzeit wird in die echte Sonnenzeit am
  Standort umgerechnet — über **Längengrad-Versatz zum Zeitzonen-Bezugsmeridian**,
  **UTC-Versatz der Zeitzone inkl. Sommerzeit** und **Zeitgleichung**. Vorher
  wurde die Wanduhrzeit direkt als Sonnenzeit verwendet (Sonnenhöchststand stur
  bei 12:00, in Mitteleuropa im Sommer > 1 h daneben). Greift nur, wenn
  Längengrad und Zeitzone gesetzt sind; sonst unverändertes Altverhalten.
- **PV-Idealleistung** berücksichtigt zusätzlich den **Konverter-Wirkungsgrad**
  (temperaturabhängig, Geräte auf Außentemperaturniveau, Referenz 25 °C):
  `kWp × Einstrahlung/1000 × Wirkungsgrad × Zell-Temperaturfaktor × Konverter-Wirkungsgrad`.
- `mqtt_config` um **`longitude`, `timezone`, `dst_enabled`** erweitert (Migration).
- `pv_plants` um **`converter_type`** erweitert (Migration; Default `Direkt`).

## [0.4.0] — 2026-06-26

### Hinzugefügt
- **Output-Seite** (`/output`): beliebige berechnete Werte an ioBroker-Ziel-Topics
  zurückgeben. Publish-Engine (`output/engine.js`) wertet den Wert-Katalog debounced
  bei MQTT-Änderungen + alle 60 s aus und schreibt je Output nur bei Wertänderung.
  Kompakte, alphabetisch sortierte Zeilenliste.
- **MQTT-Publish** (`client.publish`) gemäß MQTT.md: normale States `/set` (Rohwert)
  **und** Haupt-Topic (`{val, ack:false}`), Command-Topics (`_SET`/`.SET`/`/SET`)
  nur Rohwert.
- **Wert-Katalog** (`output/internal-values.js`): nur **berechnete** Werte
  (Leistungen, Erträge, Eigenverbrauch/Netzbezug/Summen, Zählersummen, direkte
  Sonne, Sonnenintensität, Schatten-Grenzleistung) — keine Roh-Inputs; alphabetisch.
- **Clear-Sky-Idealwert** je PV-Anlage (aktuelle Leistung groß, Idealwert klein).
- **Direkte-Sonne-Erkennung** je Anlage (☀️/☁️, zelltyp-spezifische Schwelle)
  und **Himmelssymbol in der Titelzeile** (☀️/☁️/🌙 nach Sonnenstand, via
  `/live/header`).
- **Sonnenintensität** in % (gedeckelt): aktuell + 10-Minuten-/Tages-/Vortagsmittel
  (`photovoltaik/sun-intensity.js`, Tabelle `sun_intensity_samples`). Das
  10-Minuten-Mittel läuft über alle Samples; Tages-/Vortagsmittel nur über
  Samples mit mindestens einer Anlage oberhalb des Idealwert-Cutoffs.
- **PV-Leistung Schatten**: Grenzleistung Schatten→direkte Sonne (Summe + je Anlage).
- **Dashboard-Widgets**: frei konfigurierbare Live-Kacheln aus dem Wert-Katalog,
  hinzufügen/bearbeiten/löschen, Live-Update.
- **Dashboard-Gruppen** mit Titel und **Breite (voll/halb/viertel)**; nicht-volle
  Gruppen liegen nebeneinander. **Drag & Drop** für Widgets und Gruppen
  (flicker-frei: Einfügemarke beim Ziehen, Verschiebung beim Loslassen).
- **SSE-Live-Layer** (`/live/events`, `/live/header`).
- Tabellen: `outputs`, `dashboard_groups`, `dashboard_widgets`,
  `sun_intensity_samples`, `stromverbrauch_counter_state`.

### Geändert
- **PV-Idealleistung**: Formel auf
  `kWp × Einstrahlung/1000 × Wirkungsgrad × Temperaturfaktor` umgestellt — der
  hinterlegte **Wirkungsgrad wirkt jetzt als Kalibrierfaktor** (vorher kürzte er
  sich heraus). Temperaturkorrektur zelltyp-spezifisch, bezogen auf 20 °C
  Außentemperatur.
- **Sonnenintensität** wird nur über Anlagen gebildet, die Ist- **und** Idealwert
  liefern (fehlende MQTT-Werte verfälschen den Mittelwert nicht mehr).
- `sun_intensity_samples` markiert Samples mit `day_average_eligible`, damit
  Tages-/Vortagsmittel Dämmerungszeiten unterhalb des Idealwert-Cutoffs
  auslassen, während das 10-Minuten-Mittel weiterhin 24 Stunden berechnet wird.
- **Read-only Wert-Provider** (`readPhotovoltaikValues`, `readStromverbrauchValues`)
  eingeführt, damit häufige Auswertung keine DB-Writes/Races auslöst.
- `mqtt_config` um Standort/Umgebungs-Topics erweitert (Breitengrad, Außentemp.,
  Uhrzeit, Datum) für Clear-Sky und Header.

## [0.3.0] — 2026-06-26

### Geändert
- **Stromverbrauch** speichert jetzt MQTT-Topics fuer **Eigenverbrauch L1-L3**,
  **Netzbezug L1-L3** und **Verbrauch heute** direkt auf der Seite.
- **Diese Woche** und **Dieses Jahr** werden automatisch aus dem Tageswert
  fortgeschrieben; beide KPI-Karten haben einen **"Wert setzen"**-Dialog fuer
  den Abgleich zum Tagesstart.
- **Stromverbrauch** fuehrt jetzt statt `Dieser Monat` den Wert `Dieses Jahr`
  mit kleinem `Vorjahr` darunter; am Jahreswechsel wird der Endstand als
  Vorjahr uebernommen und der Jahreszaehler auf `0` gesetzt.
- **Photovoltaik** verwaltet jetzt mehrere Anlagen mit Name, kWp, Wirkungsgrad,
  Ausrichtung, Neigung, Zelltyp, MQTT-Topics und Kennzeichen fuer die
  Verbraucherseite; verbraucherseitige PV-Leistung wird in den Eigenverbrauch
  auf der Strom-Seite eingerechnet.
- **PV-Ertrag Woche/Jahr** wird jetzt global oben gefuehrt statt pro Anlage
  vervielfacht. `Ertrag Gesamt` wurde in `Ertrag Jahr` umbenannt; am
  Jahreswechsel wird der Endstand als `Vorjahr` gespeichert und die Zaehlung
  startet wieder bei `0`.

### Hinzugefügt
- **Seite Stromverbrauch** (`/stromverbrauch`): KPI-Kacheln für Aktuell, Heute,
  Diese Woche, Dieses Jahr. Bereit für MQTT-Datenanbindung.
- **Seite Photovoltaik** (`/photovoltaik`): KPI-Kacheln für aktuelle Leistung,
  Ertrag heute/Woche/Gesamt.
- **Seite Batterie** (`/batterie`): KPI-Kacheln für SoC, Leistung, Spannung,
  Temperatur sowie animierter SoC-Fortschrittsbalken.
- Alle drei Seiten in der **Sidebar-Navigation** (NAV-Registry in `layout.js`).
- **CSS-Klassen** für KPI-Kacheln (`.kpi-card`, `.kpi-row`, farbige Varianten
  `--pv` und `--bat`), Info-Karte (`.info-card`) und SoC-Balken (`.soc-bar-*`).
- **systemd-Service** `home-ess.service` unter
  `/etc/systemd/system/home-ess.service` — enabled, startet automatisch beim
  Systemboot, Restart bei Fehler.

## [0.2.0] — 2026-06-26

### Geändert (Umstrukturierung)
- **Monolithisches `server.js` (294 Z.) in modulare Struktur unter `src/`
  aufgeteilt.** Eine Datei pro Funktion; Trennung in `auth/`, `mqtt/`,
  `routes/`, `views/` plus Infrastruktur (`config.js`, `db.js`, `app.js`).
  `server.js` ist nur noch schlanker Einstiegspunkt.
- Alle Seiten werden weiterhin **dynamisch** gerendert; Rendering in eigene
  View-Module (`src/views/`) ausgelagert, gemeinsame App-Hülle mit
  Navigations-Registry (`layout.js`).

### Hinzugefügt
- **„Passwort merken"**-Checkbox im Login. Aktiviert → persistentes 30-Tage-
  Cookie, sonst Session-Cookie.
- **Echte Sessions** (`src/auth/session.js`): DB-gestützt (Tabelle `sessions`),
  überleben Neustarts, mehrere Clients möglich. Ersetzt das frühere
  prozessweite `isLoggedIn`-Flag.
- **Passwort-Hashing** via Node `crypto.scrypt` (`src/auth/password.js`).
  Automatische Migration bestehender Klartext-Passwörter beim Start.
- **MQTT-Schicht** (`src/mqtt/`): Topic-Helfer aus [MQTT.md](MQTT.md) als reine
  Funktionen (`topics.js`), Config-Persistenz (`config.js`), Verbindungs-Manager
  mit Reconnect-Handling, Wert-Cache und Verbindungstest (`client.js`).
- **HTML-Escaping** für dynamische Werte (`src/views/components.js`).
- Env-Overrides `PORT` und `HOME_ESS_DB`.
- Projektdokumente: `README.md`, `PROJECT_CONTEXT.md`, `CHANGELOG.md`.
- `npm start` / `npm run dev` Scripts.

### Entfernt
- Tote Platzhalter `src/server.js`, `src/mqttClient.js`, `config/settings.json`.
- Ungenutzte statische `public/index.html` (Login wird dynamisch gerendert).

### Sicherheit
- Passwörter nicht mehr im Klartext in der DB.
- Session-Cookies `HttpOnly` + `SameSite=Lax`.

## [0.1.0] — vor Umstrukturierung (Commit `13a40e4`)
- Erste lauffähige Basis: monolithischer Express-Server mit Login
  (prozessweites Flag, Klartext-Passwort), leerem Dashboard und
  Einstellungsseite (Passwort, MQTT-Config + Test).
