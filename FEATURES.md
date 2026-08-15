# Karteikarten-App — Bestätigte Features (nach Prototyp-Test)

## Architektur

- **Platform:** PWA (Progressive Web App) — läuft im Browser, auf iPhone installierbar via "Zum Home-Bildschirm"
- **Hosting:** GitHub Pages (kostenlos, HTTPS)
- **Daten (Prototyp):** IndexedDB (lokal im Browser)
- **Daten (finale App):** Firebase Firestore — Cloud-Sync + eingebauter Offline-Modus (Änderungen werden offline gepuffert, bei nächster Verbindung automatisch synchronisiert)
- **Login:** Google-Sign-In (über Firebase Auth) → Karten sind privat & geräteübergreifend
- **Sprache:** Deutsch
- **Stack:** Reines HTML / CSS / JavaScript, kein Framework, kein Build-Schritt

## Datenmodell

```
folders  { id, name, createdAt }
sets     { id, folderId, name, intervals: [{value, unit}], createdAt }
cards    { id, setId,
           front: { text: string, imageData: base64|null },
           back:  { text: string, imageData: base64|null },
           nextReview: timestamp|null,
           createdAt }
```

## Navigation

```
Home
  └─ Ordner-Liste  (+ Neuer Ordner)
       └─ Set-Liste  (+ Neues Set)
            └─ Set-Ansicht
                 ├─ ▶ Lernen
                 ├─ + Karte hinzufügen
                 ├─ 📋 Alle Karten (Tabelle)
                 ├─ Intervall-Editor (aufklappbar)
                 └─ Karten-Liste
                      └─ Lern-Modus → Fertig!-Screen
```

## Feature-Liste

### Ordner & Sets
- Ordner erstellen / löschen
- Sets innerhalb von Ordnern erstellen / löschen
- Badge-Anzeige: Karten-Anzahl, fällige Karten (rot)

### Karten erstellen / bearbeiten
- Vorderseite + Rückseite, jeweils: Text + optionales Bild
- Bild hinzufügen: File-Upload (öffnet auf iPhone Kamera/Bibliothek)
- Bild hinzufügen: **Strg+V** fügt Screenshot aus Zwischenablage ein (grüner Flash als Bestätigung)
- Bild entfernen: ✕-Button in der Vorschau
- **"Speichern & Nächste"** — Modal bleibt offen, direkt nächste Karte anlegen
- Karten bearbeiten (aus Karten-Liste und aus Tabellen-Ansicht)
- Karten löschen

### Intervalle (pro Set, individuell konfigurierbar)
- Gespeichert im Set-Objekt: `intervals: [{value, unit}]`
- Einheiten: Minuten / Tage / Wochen / Monate
- Label wird automatisch generiert: "1 Tag", "10 Minuten", "2 Wochen" etc.
- Kollabierbare Bearbeitungsbox im Set-View: Zahl + Dropdown + Live-Vorschau + ✕
- Standard-Intervalle: 10 Min · 1 Tag · 3 Tage · 5 Tage · 1 Woche
- **Kein globales Intervall-Setting** — jedes Set hat seine eigenen

### Lern-Modus
- Fällige Karten: `nextReview <= jetzt` (+ neue Karten ohne nextReview)
- Sortierung: älteste fällige zuerst
- Karte antippen → Flip-Animation → Antwort sichtbar
- Intervall-Leiste unten (fixed, daumenfreundlich): Buttons aus den Set-Intervallen
- Klick auf Intervall → `nextReview = jetzt + interval_ms` → sofort in DB gespeichert
- Fortschrittsbalken + "X / Y"-Zähler
- **Offline-fähig:** speichert sofort lokal, keine Verbindung nötig
- Fertig!-Screen wenn alle Karten abgearbeitet

### Tabellen-Ansicht
- Button "📋 Alle Karten (Tabelle)" im Set-View
- Tabelle: # | Vorderseite (Text + Thumbnail) | Rückseite (Text + Thumbnail) | ✏️
- ✏️ öffnet Karten-Editor, nach Speichern → zurück zur Tabelle

### Offline & Sync
- **Auf einem Gerät:** Immer offline-fähig (IndexedDB/Firestore-Cache)
- **Geräteübergreifend:** Firebase Firestore mit automatischem Offline-Puffer
- U-Bahn / kein Internet: Intervall-Entscheidungen werden lokal gepuffert, bei nächster Verbindung sync
- **Prototyp:** Export/Import als JSON (für manuellen Transfer zwischen Geräten)

### PWA (finale App)
- `manifest.json` + App-Icon
- Service Worker → App-Shell gecacht → lädt auch ohne Internet
- "Zum Home-Bildschirm" auf iPhone (verhält sich wie native App)

## Was NICHT drin ist (bewusste Entscheidung)
- Kein SM2/Anki-Algorithmus — feste, selbst gewählte Intervalle
- Kein CSV-Import
- Kein globales Intervall-Setting
- Keine Statistiken / Heatmaps (noch nicht besprochen)

## Aktuelle Dateien
- `prototype.html` — funktionierender Prototyp (alle Features außer Firebase/PWA)

## Status
- ✅ Phase 1: Funktionaler Prototyp — getestet, abgenommen
- 🔜 Phase 2: Design-Mockup
- ⏳ Phase 3: Finale App (Firebase, PWA, Service Worker)
