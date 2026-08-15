# Setup-Anleitung — Karteikarten-App selbst einrichten

Diese Anleitung erklärt Schritt für Schritt, wie du die App **mit deinem eigenen Account** betreibst — kostenlos, auf deiner eigenen Firebase-Infrastruktur und deinem eigenen GitHub.

**Zeitaufwand:** ca. 20–30 Minuten

---

## Was du brauchst

- Ein **Google-Konto** (für Firebase und die App selbst)
- Ein **GitHub-Konto** (für das Hosting der App) → kostenlos unter [github.com](https://github.com)
- Einen modernen Browser (Chrome empfohlen)
- **Git** auf deinem Computer installiert → [git-scm.com](https://git-scm.com) (kostenlos)

---

## Übersicht

```
1. Code herunterladen
2. Firebase-Projekt erstellen
3. Google-Anmeldung aktivieren
4. Firestore-Datenbank einrichten
5. Firebase Storage einrichten
6. firebase-config.js befüllen
7. GitHub-Repository erstellen + Code hochladen
8. GitHub Pages aktivieren
9. Firebase: GitHub-Domain freischalten
10. Testen + PWA-Icons generieren (optional)
```

---

## Schritt 1 — Code herunterladen

Lade alle Dateien dieses Projekts herunter und speichere sie in einem Ordner auf deinem Computer (z.B. `C:\Meine Apps\Karteikarten\` oder `/Users/name/Karteikarten/`).

Folgenden Dateien müssen vorhanden sein:
- `index.html`
- `style.css`
- `app.js`
- `manifest.json`
- `sw.js`
- `firebase-config.js`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/generate-icons.html`

---

## Schritt 2 — Firebase-Projekt erstellen

1. Gehe zu [console.firebase.google.com](https://console.firebase.google.com)
2. Melde dich mit deinem Google-Konto an
3. Klicke auf **„Projekt hinzufügen"**
4. Wähle einen Namen für dein Projekt (z.B. `karteikarten-meinname`)
5. Google Analytics: kann deaktiviert werden → **„Projekt erstellen"**
6. Warte bis das Projekt erstellt ist → **„Weiter"**

---

## Schritt 3 — Google-Anmeldung aktivieren (Authentication)

1. Im Firebase-Dashboard: linke Seitenleiste → **„Build"** → **„Authentication"**
2. Klicke auf **„Jetzt loslegen"**
3. Tab **„Sign-in-Methode"** → Klicke auf **„Google"**
4. Schalter auf **„Aktivieren"** stellen
5. Eine E-Mail-Adresse als Support-E-Mail angeben (deine eigene)
6. Klicke auf **„Speichern"**

---

## Schritt 4 — Firestore-Datenbank einrichten

### 4a — Datenbank erstellen

1. Linke Seitenleiste → **„Build"** → **„Firestore Database"**
2. Klicke auf **„Datenbank erstellen"**
3. **Standort wählen:** `europe-west3` (Frankfurt) empfohlen für Europa
4. **Sicherheitsmodus:** Wähle **„Im Produktionsmodus starten"**
5. Klicke auf **„Erstellen"**

### 4b — Sicherheitsregeln setzen

Nach dem Erstellen: Tab **„Regeln"** → Ersetze den gesamten Inhalt durch folgendes:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Klicke auf **„Veröffentlichen"**.

> Diese Regel stellt sicher, dass jeder Nutzer nur auf seine eigenen Daten zugreifen kann.

---

## Schritt 5 — Firebase Storage einrichten

### 5a — Storage aktivieren

1. Linke Seitenleiste → **„Build"** → **„Storage"**
2. Klicke auf **„Jetzt loslegen"**
3. **Sicherheitsmodus:** Wähle **„Im Produktionsmodus starten"**
4. **Standort:** Nimm denselben wie bei Firestore (z.B. `europe-west3`)
5. Klicke auf **„Fertig"**

### 5b — Storage-Sicherheitsregeln setzen

Tab **„Regeln"** → Ersetze den gesamten Inhalt durch folgendes:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Klicke auf **„Veröffentlichen"**.

---

## Schritt 6 — firebase-config.js befüllen

### 6a — Web-App in Firebase registrieren

1. Im Firebase-Dashboard: Klicke oben auf das **Zahnrad-Symbol** → **„Projekteinstellungen"**
2. Scrolle nach unten zu **„Deine Apps"**
3. Klicke auf das **`</>`** Symbol (Web-App hinzufügen)
4. Vergib einen Namen (z.B. `Karteikarten Web`)
5. **Firebase Hosting:** Haken weglassen (wir verwenden GitHub Pages)
6. Klicke auf **„App registrieren"**
7. Du siehst jetzt einen Code-Block mit deiner Konfiguration — er sieht so aus:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "dein-projekt.firebaseapp.com",
  projectId: "dein-projekt",
  storageBucket: "dein-projekt.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 6b — Werte in firebase-config.js eintragen

Öffne die Datei `firebase-config.js` in einem Texteditor und ersetze alle Werte durch deine eigenen aus Schritt 6a:

```javascript
export const firebaseConfig = {
  apiKey:            "dein-apiKey-hier",
  authDomain:        "dein-projekt.firebaseapp.com",
  projectId:         "dein-projekt",
  storageBucket:     "dein-projekt.firebasestorage.app",
  messagingSenderId: "deine-messagingSenderId",
  appId:             "deine-appId",
};
```

> **Hinweis:** Der Firebase API-Key ist kein Geheimnis — er ist ein öffentlicher Identifikator. Die Sicherheit wird durch die Firestore- und Storage-Regeln aus Schritten 4b und 5b gewährleistet.

**Datei speichern.**

---

## Schritt 7 — GitHub-Repository erstellen und Code hochladen

### 7a — Repository auf GitHub erstellen

1. Gehe zu [github.com](https://github.com) und melde dich an
2. Klicke oben rechts auf **„+"** → **„New repository"**
3. **Repository name:** `karteikarten` (oder ein anderer Name — wird Teil der URL)
4. **Visibility:** `Public` (für GitHub Pages kostenlos nötig)
5. Alle anderen Optionen weglassen
6. Klicke auf **„Create repository"**
7. Kopiere die angezeigte Repository-URL (Format: `https://github.com/dein-name/karteikarten.git`)

### 7b — Code hochladen

Öffne ein Terminal (PowerShell auf Windows, Terminal auf Mac/Linux) und navigiere in deinen Karteikarten-Ordner:

```bash
cd "Pfad/zu/deinem/Karteikarten-Ordner"
```

Dann führe diese Befehle aus:

```bash
git init
git config user.email "deine-email@gmail.com"
git config user.name "dein-name"
git add .
git commit -m "Initial commit: Karteikarten App"
git branch -M main
git remote add origin https://github.com/dein-github-name/karteikarten.git
git push -u origin main
```

> Beim ersten Push fragt Git nach deinen GitHub-Zugangsdaten. Verwende deinen GitHub-Benutzernamen und ein **Personal Access Token** (kein Passwort) — wie man eines erstellt: GitHub → Settings → Developer Settings → Personal access tokens → Generate new token → Scope „repo" auswählen.

---

## Schritt 8 — GitHub Pages aktivieren

1. Gehe auf dein GitHub-Repository (`github.com/dein-name/karteikarten`)
2. Klicke auf **„Settings"** (Tab in der Repository-Navigation)
3. Linke Seitenleiste → **„Pages"**
4. Unter **„Branch"**: wähle `main` und `/root` (Stammverzeichnis)
5. Klicke auf **„Save"**
6. Warte 1–2 Minuten bis die Seite deployt ist

Deine App ist dann erreichbar unter:
```
https://dein-github-name.github.io/karteikarten/
```

---

## Schritt 9 — GitHub Pages-Domain in Firebase freischalten

Damit Google Sign-In von deiner GitHub Pages-URL aus funktioniert:

1. Firebase Console → **„Authentication"** → Tab **„Einstellungen"**
2. Scrolle zu **„Autorisierte Domains"**
3. Klicke auf **„Domain hinzufügen"**
4. Trage ein: `dein-github-name.github.io`
5. Klicke auf **„Hinzufügen"**

---

## Schritt 10 — Testen

1. Öffne deine App-URL: `https://dein-github-name.github.io/karteikarten/`
2. Klicke auf **„Mit Google anmelden"** → Pop-up erscheint → Anmelden
3. Erstelle einen Ordner → Set → Karte
4. Drücke **„Lernen"** → Karte umdrehen → Intervall wählen

Wenn alles funktioniert: **Fertig!** 🎉

---

## Optional — PWA auf iPhone installieren

1. Öffne die App-URL in **Safari** auf deinem iPhone
2. Tippe auf das **Teilen-Symbol** (Rechteck mit Pfeil nach oben)
3. Wähle **„Zum Home-Bildschirm"**
4. Bestätige mit **„Hinzufügen"**

Die App erscheint jetzt als eigenes Icon auf dem Home-Bildschirm und verhält sich wie eine native App (kein Browser-UI, Vollbild).

---

## Optional — PWA-Icons generieren

Damit das App-Icon auf dem iPhone schön aussieht:

1. Starte einen lokalen Webserver im Karteikarten-Ordner:
   ```bash
   python -m http.server 8787
   ```
2. Öffne im Browser: `http://localhost:8787/icons/generate-icons.html`
3. Lade beide Icons herunter (`icon-192.png` und `icon-512.png`)
4. Speichere sie in den `icons/`-Ordner
5. Lade die Icons zu GitHub hoch:
   ```bash
   git add icons/icon-192.png icons/icon-512.png
   git commit -m "Add PWA icons"
   git push
   ```

---

## Probleme & Lösungen

| Problem | Ursache | Lösung |
|---|---|---|
| Weißer Bildschirm nach Öffnen | `firebase-config.js` falsch oder leer | Werte aus Schritt 6 prüfen |
| Google Sign-In schlägt fehl | Domain nicht autorisiert | Schritt 9 wiederholen, Domain prüfen |
| Bilder laden nicht | Storage-Regeln fehlen | Schritt 5b prüfen |
| App zeigt alte Version | Service Worker cached alte Dateien | Browser-Cache leeren (Strg+Shift+R) oder SW in DevTools deregistrieren |
| `git push` schlägt fehl | Falsche Zugangsdaten | Personal Access Token statt Passwort verwenden |

---

## Kosten

Diese App ist bei normaler Einzelnutzung **komplett kostenlos**:

- **GitHub Pages:** kostenlos für öffentliche Repositories
- **Firebase Spark Plan (kostenlos):**
  - Authentication: kostenlos (unbegrenzt)
  - Firestore: 1 GB Speicher, 50.000 Lesevorgänge/Tag, 20.000 Schreibvorgänge/Tag
  - Storage: 5 GB Speicher, 1 GB/Tag Download

Bei sehr intensiver Nutzung mit sehr vielen Bildern kann die Storage-Grenze erreicht werden — für normale Lernkarten-Nutzung ist das jedoch weit entfernt.
