# Karteikarten PWA — App Logic Inventory

A flashcard spaced-repetition app with folder > set > card hierarchy. German UI. Hash-based routing, IndexedDB persistence, clipboard image paste support.

---

## 1. Global State Variables

| Variable | Type | Purpose |
|---|---|---|
| `db` | IDBDatabase | IndexedDB connection (opened on init) |
| `routeHistory` | Array of {route, id} | Stack for back navigation |
| `curFolderId` | number | Current folder ID (set by renderFolder) |
| `curSetId` | number | Current set ID (set by renderSet, renderTable, card editor) |
| `ivEditorOpen` | boolean | Interval editor visibility toggle in set view |
| `studyQueue` | Array of Card | Cards due for review in current study session |
| `studyIndex` | number | Current position in studyQueue |
| `isFlipped` | boolean | Whether front of card is hidden |
| `editCardId` | number\|null | ID of card being edited (null = new card) |
| `frontImgData` | string\|null | Data URL of front image (until saved) |
| `backImgData` | string\|null | Data URL of back image (until saved) |
| `afterSaveView` | string\|null | Which view to render after card save ('table' or null) |
| `nameCallback` | Function\|null | Callback for name modal submit (folder/set creation) |

---

## 2. IndexedDB Schema

**Database:** `karteikarten_v3` (version 1)

### Store: folders
- **keyPath:** `id` (autoIncrement)
- **Indexes:** none
- **Record shape:** `{ id, name, createdAt }`

### Store: sets
- **keyPath:** `id` (autoIncrement)
- **Indexes:** `folderId` on field `folderId`
- **Record shape:** `{ id, name, folderId, intervals: [], createdAt }`

### Store: cards
- **keyPath:** `id` (autoIncrement)
- **Indexes:** `setId` on field `setId`
- **Record shape:** `{ id, setId, front: { text, imageData }, back: { text, imageData }, nextReview, createdAt }`

---

## 3. Router

**Type:** Hash-based (manual history stack)

**Routes:**
- `navigate(route, id)` → Pushes {route, id} to history, calls show()
- `goBack()` → Pops history, shows previous state
- `show(route, id)` → Hides all views, activates requested view, calls render function

| Route | Render Function | ID Param |
|---|---|---|
| `'home'` | renderHome() | — |
| `'folder'` | renderFolder(id) | folderId |
| `'set'` | renderSet(id) | setId |
| `'study'` | renderStudy(id) | setId |
| `'table'` | renderTable(id) | setId |
| `'done'` | (CSS only) | — |

---

## 4. Data Layer Functions

### Generic DB Operations (all return Promise)

| Function | Params | Returns | Purpose |
|---|---|---|---|
| `dbAll(store)` | store: string | Array | Fetch all records from store |
| `dbGet(store, key)` | store, key: PK | Object\|undefined | Fetch single record by primary key |
| `dbPut(store, obj)` | store, obj: Record | PK value | Insert or update record |
| `dbDel(store, key)` | store, key: PK | void | Delete record by primary key |
| `dbByIndex(store, idx, key)` | store, idx: string, key: FK | Array | Fetch all records where index field = key |

### Folder Operations

| Function | Params | Effect |
|---|---|---|
| `delFolder(id)` | folderId | Cascades: deletes all sets and their cards, then folder. Re-renders home. |

### Set Operations

| Function | Params | Effect |
|---|---|---|
| `delSet(id)` | setId | Cascades: deletes all cards in set, then set. Re-renders folder. |
| `saveSetIntervals()` | — | Reads interval rows, validates, saves to set.intervals, updates UI, closes editor. |

### Card Operations

| Function | Params | Effect |
|---|---|---|
| `delCard(id)` | cardId | Deletes card. Re-renders set. |
| `pickInterval(iv)` | interval: {value, unit} | Updates card.nextReview = now + ivMs(iv), saves, advances study queue. |

---

## 5. Views

### Home View (`view-home`)

**Renders:** Folder list with set counts.

**DOM elements:**
- `#folder-list` — UL for folder items

**Events wired:**
- "New Folder" button → `openNameModal('folder')`
- Each folder → `navigate('folder', folderId)`
- Delete icon on each folder → `delFolder(id)`

**Calls:** `renderHome()` on init or after folder create/delete

**Key logic:**
- Loads all folders, counts sets per folder
- Shows empty message if no folders

---

### Folder View (`view-folder`)

**Renders:** Sets within a folder + set counts + due counts.

**DOM elements:**
- `#folder-title` — H1 folder name
- `#set-list` — UL for set items

**Events wired:**
- Back button → `goBack()`
- "New Set" button → `openNameModal('set')`
- Each set → `navigate('set', setId)`
- Delete icon → `delSet(id)`

**Calls:** `renderFolder(folderId)` when navigated to a folder

**Key logic:**
- Sets `curFolderId` on entry
- Loads sets by folderId index
- Shows due count (nextReview ≤ now) per set

---

### Set View (`view-set`)

**Renders:** Cards list, interval editor, study button.

**DOM elements:**
- `#set-title` — H1 set name
- `#study-start-btn` — Button with due count in text
- `#iv-chips` — DIV with interval display
- `#iv-box`, `#iv-editor-set`, `#iv-rows` — Interval editor UI
- `#card-list` — UL for cards

**Events wired:**
- Back button → `goBack()`
- "Add Card" button → `openCardEditor(null)`
- "Table" button → `navigate('table', setId)`
- Study button → `startStudy()`
- Interval box header → `toggleIvEditor()`
- "+Add Interval" → `addSetIvRow()`
- "Save Intervals" → `saveSetIntervals()`
- Each card → `openCardEditor(cardId)`
- Delete icon → `delCard(id)`

**Calls:** `renderSet(setId)` on navigation

**Key logic:**
- Loads intervals from set or uses DEFAULT_INTERVALS
- Renders interval editor with update previews
- Badges show "Neu", "fällig", or formatted next-review date
- Study button text includes due count

---

### Card Editor Modal

**Renders:** Two-sided card form (front/back) with image upload.

**DOM elements (modal `#card-modal`):**
- `#front-text`, `#back-text` — Textareas
- `#front-file`, `#back-file` — File inputs
- `#front-img-wrap`, `#back-img-wrap` — Image preview containers
- `#front-img-preview`, `#back-img-preview` — IMG tags
- Save / Save & Next / Cancel buttons

**Events wired:**
- "Save" → `saveCard(false)`
- "Save & Next" → `saveCard(true)`
- "Cancel" → `closeCardModal()`
- File inputs → `loadImg(input, side)`
- Image remove buttons → `removeImg(side)`
- Click overlay → `closeCardModal()`
- Paste on textareas → handled by setupPasteHandlers

**Calls:** `openCardEditor(cardId|null)` from set/table view

**Key logic:**
- If editing (cardId != null), loads existing card data
- Preserves nextReview and createdAt on edit
- Sets afterSaveView to 'table' if called from table view
- Resets form completely on open (prevents stale data leaks)
- Image preview shows inline with remove button

---

### Study Mode (`view-study`)

**Renders:** Single card with flip animation + progress bar + interval buttons.

**DOM elements:**
- `#study-bar` (progress fill), `#study-count` — Progress display
- `#card-inner`, `#card-front`, `#card-back` — Flipped card
- `#study-hint` — "Tap to flip" or "Choose interval"
- `#iv-bar` — Interval button container (appears on flip)

**Events wired:**
- Tap card → `flipCard()`
- Each interval button → `pickInterval(iv)`
- Back button → `goBack()`

**Calls:** `renderStudy(setId)` on study route, `startStudy()` from set view

**Flow:**
1. Load set intervals, build interval buttons
2. Load studyQueue (cards with nextReview ≤ now, sorted by nextReview)
3. Call `showCard()` for each card in queue
4. On flip, show interval buttons
5. On interval pick, update card.nextReview, advance studyIndex
6. When queue empty, show done view

---

### Done Screen (`view-done`)

**Renders:** Celebration message ("All cards done!").

**Events wired:**
- "Back to Set" button → `goBack()`

**Shown when:** studyIndex >= studyQueue.length

---

### Table View (`view-table`)

**Renders:** All cards in current set as table (front/back text + thumbnails).

**DOM elements:**
- `#table-title` — H1 set name
- `#cards-table` → `#cards-table-body` — Table rows
- `#table-empty` — Message if no cards

**Events wired:**
- Back button → `goBack()`
- Edit button (✏️) per row → `tableEditCard(cardId)`

**Calls:** `renderTable(setId)` on table route

**Key logic:**
- Renders text with `esc()` (XSS prevention)
- Inline images as thumbnails
- Single edit button per row sets `afterSaveView = 'table'` and opens card editor
- After save, returns to table view (not set view)

---

## 6. Modal System

### Name Modal (Folder / Set Creation)

**Flow:**
1. `openNameModal(type)` — Sets up callback, opens modal, focuses input
2. User enters name, presses Enter or clicks submit
3. `submitName()` — Validates (non-empty), **saves callback to local var**, closes modal, calls callback
4. `closeNameModal()` — Closes modal, nulls nameCallback

**Critical bug fix (line 794):**
```javascript
const cb = nameCallback;   // ← MUST save before closing
closeNameModal();
if (cb) await cb(name);
```
Without this, closeNameModal() would null nameCallback before we try to call it, causing the callback to never execute.

**Keyboard binding:** Enter key calls submitName()

**Callback types:**
- `type === 'folder'` → Creates folder, re-renders home
- `type === 'set'` → Creates set, re-renders folder

---

### Card Modal

**Opens:** `openCardEditor(cardId|null)`

**Closes:** `closeCardModal()` or click overlay

**Notable:** Completely resets form on open (line 715-718) to prevent stale image/text from previous edits leaking into new card creation.

---

## 7. Image Handling

### Clipboard Paste (`setupPasteHandlers`)

**Setup:** Called once on DB open (line 844)

**Behavior:**
- Listens to paste events on `#front-text` and `#back-text`
- Checks clipboard items for image MIME types
- Prevents default paste, reads image as data URL
- Sets frontImgData / backImgData
- Shows green flash (`.paste-flash` border) for UX feedback

**Effect:** User can Ctrl+V screenshot directly into either textarea

### File Upload (`loadImg`)

- Triggered by file input `onchange`
- Reads file as data URL via FileReader
- Updates frontImgData / backImgData
- Calls `setImgPreview(side, data)` to show thumbnail

### Preview & Remove

- `setImgPreview(side, data)` — Shows preview, displays remove button
- `removeImg(side)` — Clears image, hides preview, resets file input

**Stored as:** Base64 data URLs in card.front.imageData / card.back.imageData

---

## 8. Critical Bug Fixes

### 1. NameCallback Null-Before-Use Fix
**Location:** Line 794 in submitName()
**Problem:** closeNameModal() nulls nameCallback, so calling it after close would fail
**Solution:**
```javascript
const cb = nameCallback;   // Save reference BEFORE close
closeNameModal();
if (cb) await cb(name);
```

### 2. afterSaveView State-Leak Fix
**Locations:** Line 715 (open new card), line 759-762 (after save)
**Problem:** afterSaveView could persist from a table edit into an unrelated new card, causing wrong view to render after save
**Solution:**
```javascript
// When opening NEW card from set view:
if (cardId === null) afterSaveView = null;

// When saving with Save & Next:
if (andNext) {
    afterSaveView = null;
    openCardEditor(null);
}
```

### 3. Form Reset on Card Editor Open
**Location:** Lines 716-718
**Problem:** Stale text/images from previous card edit could appear in new card form
**Solution:** Always clear all inputs, textareas, and file inputs when opening modal:
```javascript
['front-text','back-text'].forEach(id => document.getElementById(id).value = '');
['front-file','back-file'].forEach(id => document.getElementById(id).value = '');
['front-img-wrap','back-img-wrap'].forEach(id => document.getElementById(id).style.display = 'none');
```

---

## 9. Interval Logic

### Constants

**DEFAULT_INTERVALS** (lines 355–361):
```javascript
[
  { value: 10, unit: 'Minuten' },  // 10 minutes
  { value: 1,  unit: 'Tage' },     // 1 day
  { value: 3,  unit: 'Tage' },     // 3 days
  { value: 5,  unit: 'Tage' },     // 5 days
  { value: 1,  unit: 'Wochen' }    // 1 week
]
```

**UNIT_MS** (line 363): Maps unit names to milliseconds
```javascript
{ Minuten: 60_000, Tage: 86_400_000, Wochen: 604_800_000, Monate: 2_592_000_000 }
```

**SINGULAR** (line 364): Plural → singular for display
```javascript
{ Minuten: 'Minute', Tage: 'Tag', Wochen: 'Woche', Monate: 'Monat' }
```

### Functions

| Function | Input | Output | Purpose |
|---|---|---|---|
| `ivMs(iv)` | {value, unit} | number | Returns milliseconds (value × UNIT_MS[unit]) |
| `ivLabel(iv)` | {value, unit} | string | Returns display string ("1 Tag" or "3 Tage") |

### Lifecycle

1. **Set creation:** Set.intervals defaults to DEFAULT_INTERVALS
2. **Set view:** Interval editor builds UI rows from set.intervals
3. **Save intervals:** Reads input values, rebuilds array, updates set.intervals in DB
4. **Study mode:** Builds buttons for each interval in set.intervals
5. **Pick interval:** On card review, `card.nextReview = Date.now() + ivMs(interval)`
6. **Due calculation:** Cards with nextReview ≤ Date.now() are due for review

---

## Key Implementation Notes

- **No server/API:** All data in IndexedDB, client-side only
- **No sync:** Data persists locally only (no cross-device sync)
- **Image format:** Base64 data URLs (practical for small sets, not suitable for large image libraries)
- **Study state volatile:** studyQueue lives in memory; navigating away loses progress
- **Cascade deletes:** Folder delete cascades to sets and cards; set delete cascades to cards
- **XSS prevention:** All user content escaped via `esc()` function before display
- **Paste UX:** Green flash feedback for clipboard image success

---

**Total code:** ~846 lines HTML/CSS/JS. Render functions ~200 lines. DB layer ~50 lines. Modals ~40 lines. Study logic ~80 lines.
