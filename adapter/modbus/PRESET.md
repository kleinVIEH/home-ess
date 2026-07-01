# PRESET.md — Regelwerk für Modbus-Presets

> Presets beschleunigen das Anlegen von States im Modbus-Adapter. Statt jedes
> Register von Hand einzutragen, lädt man ein gerätespezifisches Preset und wählt
> aus, welche Register man als States benötigt. Diese Datei legt das **Dateiformat**
> der Presets fest. Das allgemeine Adapter-Regelwerk steht in
> [../../ADAPTER.md](../../ADAPTER.md).

Inhalt: [Zweck & Ablauf](#zweck--ablauf) · [Speicherort](#speicherort) ·
[Dateiformat](#dateiformat) · [`defaults`](#defaults) · [`registers[]`](#registers)
· [Modbus-Adressierung](#modbus-adressierung) · [Datentypen](#datentypen) ·
[Byte-/Word-Reihenfolge](#byte--word-reihenfolge) · [Skalierung & Einheit](#skalierung--einheit)
· [Schreibbare Register](#schreibbare-register) · [Abbildung auf States](#abbildung-auf-homeess-states)
· [Validierung](#validierung) · [Versionierung](#versionierung) · [Beispiel](#beispiel)

## Zweck & Ablauf

Ein Preset beschreibt **ein Gerät oder Profil** (z. B. „Victron Cerbo GX",
„SMA Sunny Island") als Liste von Modbus-Registern. homeESS nutzt Presets so:

- **Preset laden** → homeESS zeigt die im Preset enthaltenen Register in einer
  Liste. Man **wählt die benötigten** aus; nur diese werden als States in der
  **Adapter-Instanz selbst** angelegt (gespeichert in den Instanz-Einstellungen).
- **States als Preset speichern** → die aktuelle Registerliste der Instanz wird als
  Preset-JSON in `presets/` exportiert (gleiches Format wie unten).
- **Preset hochladen** → eine Preset-Datei vom PC wird nach `presets/` übernommen
  (nach Validierung).

Ein Preset ist also reine **Vorlage**: Das Laden kopiert ausgewählte Register in
die Instanz. Spätere Änderungen am Preset wirken sich nicht rückwirkend auf bereits
angelegte States aus.

## Speicherort

```
/adapter/modbus/
  PRESET.md                 ← dieses Regelwerk
  presets/
    victron-cerbo.json      ← ein Preset = eine Datei = ein Gerät/Profil
    sma-sunny-island.json
```

Dateiname: `^[a-z0-9][a-z0-9_-]*\.json$` (Kleinbuchstaben, Ziffern, `-`/`_`). Der
Dateiname ist nur eine Kennung; der Anzeigename kommt aus dem Feld `name`.

## Dateiformat

Eine Preset-Datei ist ein **JSON-Objekt** auf oberster Ebene:

```json
{
  "presetFormat": 1,
  "name": "Victron Cerbo GX (Modbus TCP)",
  "manufacturer": "Victron Energy",
  "device": "Cerbo GX",
  "version": "1.0.0",
  "description": "Batterie-, PV- und Netzwerte über das Victron-Modbus-TCP-Register.",
  "author": "homeESS",
  "defaults": { "...": "..." },
  "registers": [ { "...": "..." } ]
}
```

| Feld           | Typ     | Pflicht | Bedeutung |
|----------------|---------|:------:|-----------|
| `presetFormat` | int     | ja     | Formatversion. Aktuell **`1`**. Unbekannte/höhere Versionen werden abgelehnt. |
| `name`         | string  | ja     | Anzeigename des Presets (im Lade-Dialog). |
| `manufacturer` | string  | nein   | Hersteller. |
| `device`       | string  | nein   | Gerätebezeichnung/Modell. |
| `version`      | string  | nein   | Preset-Version (Doku/Pflege). |
| `description`  | string  | nein   | Kurzbeschreibung. |
| `author`       | string  | nein   | Ersteller. |
| `defaults`     | object  | nein   | Standardwerte für alle Register (siehe unten). |
| `registers`    | array   | ja     | Liste der Register-Definitionen (mind. 1). |

## `defaults`

Optionales Objekt mit Vorgabewerten, die für **jedes** Register gelten, sofern es
sie nicht selbst überschreibt. Erlaubt sind alle **optionalen** Register-Felder:
`unitId`, `registerType`, `dataType`, `byteOrder`, `wordOrder`, `scale`, `offset`,
`length`, `pollIntervalMs`, `category`, `writable`. So lässt sich z. B. eine
geräteweit einheitliche `unitId` oder `byteOrder` an einer Stelle setzen.

Auflösungsreihenfolge je Feld: **Register-Wert → `defaults` → eingebauter
Standard** (siehe Tabelle).

## `registers[]`

Jedes Element beschreibt **ein Register = einen späteren State**.

| Feld             | Typ     | Pflicht | Standard | Bedeutung |
|------------------|---------|:------:|----------|-----------|
| `unitId`         | int     | nein   | `1`      | **Modbus-Unit-/Slave-ID**. Erste Adressebene: eine Instanz kann mehrere Units abfragen. Zusammen mit `address` eindeutig. |
| `address`        | string  | ja     | —        | **State-Adresse** (Topic-Suffix nach der Unit). Pro `unitId` eindeutig. Regeln s. [ADAPTER.md](../../ADAPTER.md) (Schrägstriche zur Gruppierung erlaubt, z. B. `batterie/soc`). |
| `name`           | string  | ja     | =address | Anzeigename des States. |
| `register`       | int     | ja     | —        | Modbus-Registeradresse, **0-basiert** (siehe Adressierung). |
| `registerType`   | enum    | nein   | `holding`| `coil` \| `discrete` \| `input` \| `holding`. |
| `dataType`       | enum    | nein   | `uint16` | Roh-Interpretation (siehe Datentypen). |
| `length`         | int     | nein   | abgeleitet | Anzahl 16-bit-Register. Aus `dataType` abgeleitet; bei `string` **Pflicht**. |
| `bit`            | int     | nein   | —        | Nur bei `dataType: "bit"`: Bitposition `0..15` im Register → Boolean. |
| `byteOrder`      | enum    | nein   | `big`    | `big` \| `little` (siehe Byte-/Word-Reihenfolge). |
| `wordOrder`      | enum    | nein   | `big`    | `big` \| `little`. Nur relevant bei >1 Register. |
| `scale`          | number  | nein   | `1`      | Multiplikativer Skalierungsfaktor. |
| `offset`         | number  | nein   | `0`      | Additiver Offset (nach `scale`). |
| `unit`           | string  | nein   | `""`     | Einheit für die Anzeige (z. B. `V`, `W`, `%`, `°C`). |
| `category`       | string  | nein   | `Allgemein` | Gruppe im States-Baum. |
| `writable`       | bool    | nein   | `false`  | State beschreibbar (nur `coil`/`holding`, siehe unten). |
| `pollIntervalMs` | int     | nein   | `5000`   | Leseintervall in ms (Mindestwert 250). |
| `description`    | string  | nein   | `""`     | Erläuterung; im Lade-Dialog als Hilfetext. |

Felder außerhalb dieser Liste werden ignoriert (vorwärtskompatibel).

## Modbus-Adressierung

Die Adresse wird **0-basiert** als reine Registernummer angegeben (`register`)
plus **expliziter** `registerType`. Die mehrdeutige 4xxxx-/3xxxx-Notation wird
**nicht** verwendet — sie vermischt Adresse und Typ und ist je nach Doku 0- oder
1-basiert.

| `registerType` | Objekt              | Zugriff | Breite | Lese-FC | Schreib-FC |
|----------------|---------------------|---------|--------|---------|------------|
| `coil`         | Coil                | R/W     | 1 Bit  | 01      | 05/15      |
| `discrete`     | Discrete Input      | R       | 1 Bit  | 02      | —          |
| `input`        | Input Register      | R       | 16 Bit | 04      | —          |
| `holding`      | Holding Register    | R/W     | 16 Bit | 03      | 06/16      |

> Beispiel: Steht in der Gerätedoku „Holding Register 40844 (SoC)", ist das
> 1-basiert in der 4xxxx-Schreibweise. 0-basiert lautet die Adresse
> `register: 843`, `registerType: "holding"`.

### Unit-/Slave-ID als erste Adressebene

Die **Unit-ID gehört zum Register**, nicht zur Instanz: So fragt **eine** Instanz
mehrere Units (Slaves) am selben Server ab. Die Unit-ID ist die erste Ebene der
State-Adresse:

```
modbus://<instanz>/<unitId>/<address>
```

Beispiel: `unitId: 1`, `address: "batterie/soc"` →
`modbus://victron/1/batterie/soc`. Damit dürfen zwei Units denselben `address`
tragen (z. B. zwei baugleiche BMS auf Unit 1 und 2) — eindeutig ist das Paar
(`unitId`, `address`).

## Datentypen

`dataType` bestimmt, wie die Roh-Register zu einem Wert zusammengesetzt werden, und
damit die abgeleitete `length`:

| `dataType` | Register (`length`) | Ergebnis |
|------------|:-------------------:|----------|
| `bool`     | 1 (Bit)             | true/false — für `coil`/`discrete`. |
| `bit`      | 1                   | true/false aus `bit` (0..15) eines 16-bit-Registers. |
| `int16`    | 1                   | vorzeichenbehaftet 16 Bit |
| `uint16`   | 1                   | vorzeichenlos 16 Bit |
| `int32`    | 2                   | vorzeichenbehaftet 32 Bit |
| `uint32`   | 2                   | vorzeichenlos 32 Bit |
| `int64`    | 4                   | vorzeichenbehaftet 64 Bit |
| `uint64`   | 4                   | vorzeichenlos 64 Bit |
| `float32`  | 2                   | IEEE-754 Single |
| `float64`  | 4                   | IEEE-754 Double |
| `string`   | `length` (Pflicht)  | ASCII, 2 Zeichen je Register, an `\0` abgeschnitten |

Bei `coil`/`discrete` ist nur `bool` sinnvoll; ein abweichender `dataType` wird auf
`bool` normalisiert.

## Byte-/Word-Reihenfolge

Modbus überträgt jedes 16-bit-Register big-endian (High-Byte zuerst). Werte über
mehrere Register hinweg legen Geräte aber unterschiedlich ab. Zwei unabhängige
Schalter decken die vier gängigen Kombinationen ab (Beispielbytes `A B C D`,
A = höchstwertig):

| `wordOrder` | `byteOrder` | Reihenfolge | gängiger Name |
|-------------|-------------|-------------|---------------|
| `big`       | `big`       | `A B C D`   | Big-Endian (Standard) |
| `big`       | `little`    | `B A D C`   | Big-Endian, Byte-Swap |
| `little`    | `big`       | `C D A B`   | Word-Swap |
| `little`    | `little`    | `D C B A`   | Little-Endian |

- `wordOrder`: `big` = erstes Register ist das höchstwertige Wort; `little` =
  erstes Register ist das niederwertigste Wort.
- `byteOrder`: `big` = High-Byte zuerst innerhalb eines Registers (Modbus-Norm);
  `little` = Bytes innerhalb des Registers getauscht.

Bei 1-Register-Typen (`int16`/`uint16`/`bit`) ist `wordOrder` ohne Wirkung.

## Skalierung & Einheit

Der angezeigte/weitergegebene Wert berechnet sich als:

```
wert = roh * scale + offset
```

Beispiel: Ein `uint16` liefert roh `2353`, mit `scale: 0.01` und `unit: "V"` →
`23.53 V`. `scale`/`offset` gelten nicht für `bool`/`bit`/`string`.

## Schreibbare Register

`writable: true` ist nur für `registerType` `coil` und `holding` zulässig (sonst
wird es ignoriert/auf `false` gesetzt). Schreibvorgänge aus homeESS (z. B. ein
Output auf `modbus://instanz/<address>`) werden vom Adapter über die passende
Schreib-Funktion zurück ins Gerät geschrieben — bei skalierten Werten in
**umgekehrter** Reihenfolge: `roh = (wert - offset) / scale`.

## Abbildung auf homeESS-States

Beim Laden wird je ausgewähltem Register **ein State** angelegt (vgl.
[ADAPTER.md](../../ADAPTER.md)):

| Register-Feld        | State-Feld   | Topic |
|----------------------|--------------|-------|
| `unitId` + `address` | `address`    | `modbus://<instanz>/<unitId>/<address>` |
| `name`               | `name`       | |
| `category`           | `category`   | |
| `unit`               | `unit`       | |
| `writable`           | `writable`   | |

Die übrigen Felder (`register`, `dataType`, `byteOrder`, …) bleiben adapterintern
und steuern das Lesen/Schreiben am Gerät.

## Validierung

Beim Laden/Hochladen prüft homeESS das Preset. **Ungültiges Preset** (wird komplett
abgelehnt, mit Meldung):

- kein gültiges JSON-Objekt,
- `presetFormat` fehlt oder ist > unterstützte Version,
- `registers` fehlt oder ist leer.

**Ungültiges einzelnes Register** (wird übersprungen, Rest bleibt nutzbar):

- `address` fehlt oder das Paar (`unitId`, `address`) ist im Preset doppelt,
- `register` fehlt oder ist keine Ganzzahl ≥ 0,
- `registerType`/`dataType`/`byteOrder`/`wordOrder` außerhalb der erlaubten Werte,
- `dataType: "string"` ohne `length`,
- `dataType: "bit"` ohne gültiges `bit` (0..15).

Beim **Anlegen in der Instanz** gilt zusätzlich: Eine `address`, die in der Instanz
bereits existiert, wird nicht doppelt angelegt (der Nutzer entscheidet beim Laden
über Überschreiben/Überspringen).

## Versionierung

`presetFormat` ist die Formatversion dieses Regelwerks (aktuell **1**). Neue
Pflichtfelder oder geänderte Bedeutungen erhöhen sie. Adapter lehnen Presets mit
höherer `presetFormat` ab, statt sie falsch zu interpretieren. Zusätzliche,
unbekannte Felder sind erlaubt und werden ignoriert (vorwärtskompatibel).

## Beispiel

```json
{
  "presetFormat": 1,
  "name": "Beispielgerät (Modbus TCP)",
  "manufacturer": "ACME",
  "device": "Demo-WR",
  "version": "1.0.0",
  "description": "Minimalbeispiel mit Batterie- und Netzwerten.",
  "defaults": {
    "unitId": 1,
    "registerType": "holding",
    "byteOrder": "big",
    "wordOrder": "big",
    "pollIntervalMs": 5000,
    "category": "Allgemein"
  },
  "registers": [
    {
      "unitId": 1,
      "address": "batterie/soc",
      "name": "Batterie SoC",
      "category": "Batterie",
      "register": 843,
      "dataType": "uint16",
      "unit": "%"
    },
    {
      "unitId": 1,
      "address": "batterie/leistung",
      "name": "Batterieleistung",
      "category": "Batterie",
      "register": 842,
      "dataType": "int32",
      "wordOrder": "little",
      "scale": 1,
      "unit": "W"
    },
    {
      "unitId": 2,
      "address": "netz/spannung_l1",
      "name": "Netzspannung L1 (Unit 2)",
      "category": "Netz",
      "register": 770,
      "dataType": "uint16",
      "scale": 0.1,
      "unit": "V"
    },
    {
      "unitId": 1,
      "address": "steuerung/einspeisung_aktiv",
      "name": "Einspeisung aktiv",
      "category": "Steuerung",
      "registerType": "coil",
      "register": 12,
      "dataType": "bool",
      "writable": true
    }
  ]
}
```
