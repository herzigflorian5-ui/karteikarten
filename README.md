# Karteikarten — Persönliche Lernkarten-App

Eine mobile-first Progressive Web App (PWA) für Spaced-Repetition-Lernen mit Google-Anmeldung und Cloud-Synchronisation. Läuft komplett im Browser, kein App Store nötig, auf iPhone installierbar.

---

## Features

### Lernstruktur
- **Ordner → Sets → Karten** — Inhalte in beliebig vielen Ordnern und Sets organisieren
- **Fälligkeits-Anzeige** — Jedes Set zeigt, wie viele Karten heute gelernt werden müssen
- **Tabellenansicht** — Alle Karten eines Sets auf einen Blick (mit Bearbeitungsfunktion)

### Karteikarten-Editor
- **Text + Bild** pro Seite (Vorderseite = Frage, Rückseite = Antwort)
- **Bild-Upload** per Datei-Auswahl (auf iPhone: direkt Kamera oder Foto-Bibliothek)
- **Screenshot einfügen** per Strg+V (Paste) direkt ins Textfeld
- **„Speichern & Nächste"** für schnelles Durcharbeiten einer Lernliste
- **Double-Submit-Schutz:** Speichern-Button deaktiviert sich sofort — mehrfaches Tippen erzeugt keine Duplikate

### Lern-Modus
- Karte antippen → Flip-Animation → Antwort erscheint
- **Konfigurierbare Intervalle** pro Set (Standard: 10 Min / 1 Tag / 3 Tage / 5 Tage / 1 Woche)
- Fälligste Karten werden zuerst gezeigt; neue Karten zuerst in der Queue
- Fortschritts-Balken + Zähler während der Session
- **Fertig-Screen** wenn alle fälligen Karten erledigt sind
- **Bild-Vorladen:** Beim Start einer Lern-Session werden alle Bilder sofort parallel heruntergeladen und gecacht — danach funktionieren Bild-Karten auch ohne aktives Netzwerk (z.B. U-Bahn)

### Intervall-System (kein Algorithmus)
Im Gegensatz zu Anki verwendet die App **feste, manuell gewählte Zeitintervalle**. Nach dem Umdrehen einer Karte wählt man selbst, wann man sie wieder sehen möchte. Die Intervalle sind pro Set anpassbar.

### Synchronisation & Offline
- Alle Daten (Karten + Bilder) in **Firebase Cloud** gespeichert → automatische Synchronisation zwischen allen Geräten mit demselben Google-Account
- **Offline-fähig** via Service Worker und IndexedDB-Persistenz (Firebase): einmal geladene Karten funktionieren auch ohne Internet
- Nach einem App-Update: Service Worker aktualisiert den Cache automatisch

### Authentifizierung
- **Google Sign-In** — kein Passwort, kein separater Account
- Jeder Google-Account hat seinen eigenen, vollständig getrennten Datenbereich
- Sicherheitsregeln in Firebase stellen sicher, dass kein Nutzer auf Daten eines anderen zugreifen kann

### Design & Bedienung
- **Dark Mode** als Standard, Light Mode per Schaltfläche umschaltbar (gespeichert im Browser)
- Mobile-first: große Tap-Targets, Intervall-Tasten am unteren Bildschirmrand
- **PWA-installierbar**: auf iPhone via Safari → „Zum Home-Bildschirm" (verhält sich wie eine native App)
- **iPhone Safe Area:** Back-Button und Navigation respektieren Notch / Dynamic Island (`env(safe-area-inset-top/bottom)`)
- **Lade-Indikator:** Grüner Spinner während Firebase-Daten geladen werden — kein unerwartetes Aufpoppen von Inhalten

---

## Tech Stack

| Bereich | Technologie |
|---|---|
| App-Logik | Vanilla JavaScript (ES Modules, kein Framework) |
| Styling | Reines CSS (kein Framework) |
| Authentifizierung | Firebase Auth (Google Sign-In) |
| Datenbank | Firebase Firestore (NoSQL Cloud-Datenbank) |
| Bilder | Firebase Storage |
| Offline | Service Worker (Cache-First für App Shell, Network-First für Firebase) |
| Hosting | GitHub Pages (HTTPS, kostenlos) |
| Build-Schritt | **Keiner** — direkt aus dem Quellcode |

---

## Dateistruktur

```
Karteikarten/
│
├── index.html              ← SPA-Shell (ein einziges HTML-Dokument)
├── style.css               ← Komplettes Styling + Design-System
├── app.js                  ← Gesamte App-Logik (~1100 Zeilen)
├── manifest.json           ← PWA-Manifest (Name, Icons, Theme)
├── sw.js                   ← Service Worker (Offline-Support + Caching)
│
├── firebase-config.js      ← Firebase-Zugangsdaten (eigenen Account verwenden!)
│
└── icons/
    ├── icon-192.png        ← App-Icon (Home Screen, klein)
    ├── icon-512.png        ← App-Icon (Splash Screen, groß)
    └── generate-icons.html ← Tool zum Generieren der Icons im Browser
```

> **Wichtig:** `firebase-config.js` enthält die Zugangsdaten für den Firebase-Account.
> Wer die App selbst betreiben möchte, muss diesen Account durch seinen eigenen ersetzen.
> Anleitung: [SETUP_ANLEITUNG.md](SETUP_ANLEITUNG.md)

---

## Architektur

### Datenmodell (Firestore)

Alle Daten liegen unter dem Pfad `users/{uid}/` — jeder Google-Nutzer hat seinen eigenen, isolierten Bereich.

```
users/
  {uid}/
    folders/
      {folderId}/
        name: string
        createdAt: number (Unix ms)
    sets/
      {setId}/
        name: string
        folderId: string
        intervals: Array<{ value: number, unit: 'Minuten'|'Tage'|'Wochen'|'Monate' }>
        createdAt: number
    cards/
      {cardId}/
        setId: string
        front: { text: string, storagePath: string|null }
        back:  { text: string, storagePath: string|null }
        nextReview: number|null    ← null = neue Karte, sonst Unix ms
        createdAt: number
```

**Lern-Logik:** Eine Karte ist fällig wenn `nextReview == null` (neue Karte) oder `nextReview <= Date.now()`. Nach Auswahl eines Intervalls: `nextReview = Date.now() + interval_in_ms`.

### Bilder (Firebase Storage)

Bilder werden unter `users/{uid}/cards/{cardId}-{front|back}` gespeichert. In Firestore steht nur der Pfad (`storagePath`), nicht die Bilddaten selbst.

**URL-Caching:** `getImageUrl()` speichert jeden abgerufenen Download-URL in einer session-lokalen `Map`. Wiederholte Aufrufe für denselben Pfad (z.B. Editor nach Lernmodus) erzeugen keinen zweiten Firebase-Request.

**Vorladen beim Lernstart:** `startStudy()` ruft alle Bild-URLs der fälligen Karten parallel via `Promise.all` ab und lädt die Bilder sofort per `new Image().src` in den Browser-Cache. Danach laufen Bild-Karten ohne Netzwerk-Anfragen.

### Router

Kein URL-Router — die App navigiert intern über einen Stack (`routeHistory`):

```
navigate('folder', id) → schreibt in Stack → zeigt View
goBack()               → nimmt letzten Eintrag → zeigt vorherigen View
```

Views: `home`, `folder`, `set`, `study`, `table`, `done`

### Firebase-Datenschicht

Alle Firestore-Operationen laufen über 5 generische Hilfsfunktionen in `app.js`:

```javascript
fsAll(colName)                  // alle Dokumente einer Collection
fsGet(colName, id)              // ein Dokument per ID
fsAdd(colName, data)            // Dokument hinzufügen (gibt ID zurück)
fsUpdate(colName, id, data)     // Dokument aktualisieren
fsDel(colName, id)              // Dokument löschen
fsByField(colName, field, val)  // Filtern nach Feldwert
```

Alle Funktionen ergänzen automatisch den richtigen User-Pfad (`users/{uid}/`).

---

## Lokal entwickeln

**Voraussetzung:** Python ist installiert.

```bash
cd C:\Users\herzi\OneDrive\Karteikarten
python -m http.server 8787
```

Dann im Browser öffnen: `http://localhost:8787`

> Die App kann **nicht** per Doppelklick als `index.html` geöffnet werden — ES Modules funktionieren nur über HTTP(S), nicht über `file://`.

Alternativ: In Claude Code den Dev-Server `karteikarten-dev` starten (aus `.claude/launch.json`).

---

## PWA-Icons generieren

Die Icons (`icons/icon-192.png` und `icons/icon-512.png`) müssen einmalig generiert werden:

1. `icons/generate-icons.html` im Browser öffnen (z.B. über den Dev-Server)
2. Beide Icons herunterladen
3. In den `icons/`-Ordner speichern
4. Zu GitHub pushen

---

## Bekannte Einschränkungen

- **Desktop-Layout:** Die App ist primär für mobile Nutzung optimiert. Auf breiten Bildschirmen sind manche Elemente (z.B. Karten in der Tabellenansicht) breiter als nötig.
- **Kein Import:** Es gibt keinen CSV- oder Anki-Import. Karten werden manuell angelegt.
- **Offline:** Bilder werden beim Lernstart vorgeladen und sind danach für die Dauer der Session aus dem Browser-Cache abrufbar. Wird die App direkt im U-Bahn-Tunnel geöffnet (noch nie geladen), stehen Bild-Karten nicht zur Verfügung.
- **Keine Statistiken:** Es gibt keine Lernstatistiken oder Wiederholungshistorie.

---

## Changelog (letzte Änderungen)

### iOS-Fixes & Performance (Sep 2026)
- **Karteikarte füllt Bildschirm:** Root Cause war `display: block` statt `flex` in `showMainScreen()` — die gesamte Flex-Kette hat dadurch nicht funktioniert
- **Bilder nutzen verfügbaren Platz:** `.card-img` bekommt `flex: 1; min-height: 0` statt fixer `max-height: 200px`. Kein Scroll innerhalb der Karte (`overflow: hidden`)
- **Notch/Dynamic Island:** Top-Bar respektiert `env(safe-area-inset-top)`, Bottom-Bar bereits vorher korrekt
- **iOS Auto-Zoom deaktiviert:** Alle Input-Felder auf `font-size: 16px` — darunter zoomt Safari beim Antippen automatisch rein
- **Double-Submit-Schutz:** Speichern-Button deaktiviert sich sofort beim ersten Tippen
- **Lade-Spinner:** CSS-Spinner erscheint während Firebase-Navigationen
- **Bild-Vorladen:** Alle Session-Bilder werden beim Lernstart parallel gecacht (`Promise.all` + `new Image()`)
