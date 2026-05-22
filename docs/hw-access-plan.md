# Technické zadání

## HW integrace pro NextIntranet (Browser-first, hybridní Agent + Web API)

---

## 1. Cíl

Navrhnout a implementovat systém, ve kterém webová aplikace **NextIntranet (React)** dokáže používat lokální hardware a služby, které nejsou běžně dostupné z prohlížeče, a to dvěma způsoby:

1. **Přes lokální nebo síťové agenty** (stabilní a doporučený režim)
2. **Přímo v prohlížeči** pomocí nativních Web API (Chrome/Chromium)

Primární platforma: **Linux**
Klient: **Google Chrome / Chromium (Chrome-only akceptováno)**

---

## 2. Základní architektura

* NextIntranet běží jako webová aplikace (HTTPS).
* Hardware je obsluhován:

  * buď **agentem** (samostatná služba v OS nebo v LAN),
  * nebo **přímo v prohlížeči** (např. Web Serial API).
* Frontend komunikuje vždy přes jednotné rozhraní **`nextIO`**, které abstrahuje způsob připojení.

```
[ NextIntranet (React) ]
          |
        nextIO
      /          \
[ Agent ]   [ Browser API ]
 serial        WebSerial
 tisk          WebHID
 váha           …
```

---

## 3. `nextIO` – jednotné aplikační rozhraní

### 3.1 Požadavky

* `nextIO` je **TypeScript knihovna** použitelná v Reactu.
* Poskytuje jednotné API bez ohledu na transport:

  * agent
  * browser-native
* Umožňuje připojení **více zařízení současně** (i přes různé agenty).

### 3.2 Logické rozhraní

```ts
nextIO.status()
nextIO.serial.*
nextIO.scanner.*
nextIO.print.*
nextIO.devices.*
nextIO.on(event, handler)
```

Aplikační logika **nikdy neřeší**, zda zařízení běží:

* přes agenta
* nebo přes Web Serial / Web HID

---

## 4. Agent – definice a role

### 4.1 Účel agenta

Agent je lokální nebo síťová služba, která:

* obsluhuje HW a systémové služby,
* vystavuje **HTTP(S) API + event stream**,
* řeší stabilitu, reconnect a systémová oprávnění.

### 4.2 Funkce agenta (podle capability)

* **Serial** (USB CDC, RS-232…)
* **Scanner / HID**
* **Tisk** (CUPS / IPP / RAW)
* **HTTP zařízení** (např. váha v LAN)

### 4.3 Základní API agenta (v1)

* `GET /v1/status`
* WebSocket `/ws/events` + `/ws/station/<station_id>` (stejný event formát jako realtime WS)

#### Serial

* `GET /v1/serial/ports`
* `POST /v1/serial/open`
* `POST /v1/serial/write`
* `POST /v1/serial/close`
* event: `serial.data`

#### Scanner

* event: `scanner.data`

#### Print

* `GET /v1/print/printers`
* `POST /v1/print/job`
* event: `print.job`

#### Devices (např. váha)

* `GET /v1/devices`
* event: `weight.value`

---

## 5. Browser-native režim (hybridní přístup)

### 5.1 Podporované technologie (MVP)

* **Web Serial API** (Chrome/Chromium)
* Přímý **keyboard-wedge scanner** (standardní klávesnice + fokus)

### 5.2 Použití

* Uživatel explicitně vybere zařízení (`navigator.serial.requestPort()`).
* Povolení je jednorázové a svázané s browser profilem.
* Data jsou normalizována do stejných eventů jako u agenta.

Příklad mapování:

```
Web Serial → serial.line → scanner.data
```

---

## 6. Normalizace dat (povinné)

Bez ohledu na transport musí mít aplikace jednotná data:

* `scanner.data` → `{ text, ts, source }`
* `serial.data` → `{ bytesBase64, ts, source }`
* `weight.value` → `{ grams, stable, unit, ts }`
* `print.job` → `{ jobId, state, ts }`

---

## 7. Konfigurace pracovního místa

NextIntranet musí umožnit uložit **profil stanice**, který obsahuje:

* seznam agentů (URL + token)
* seznam browser-native zařízení (typ, parametry, label)

Profil je **per-user / per-stanice**, nikoliv globální OS nastavení.

Volitelně může profil ukládat **agent config (JSON)** pro výchozí volby zařízení,
např. defaultní tiskárnu, port nebo CUPS options (velikost papíru, media, apod.).

---

## 8. Bezpečnostní požadavky

### 8.1 Agent

* Striktní **CORS** (bez `*`)
* Tokenová autentizace (`X-Agent-Token`, pro WS `?token=...`)
* Omezení přístupu podle capability (serial / print / scanner)

### 8.2 Browser-native

* Připojení pouze po explicitní akci uživatele
* Žádné automatické nebo skryté připojování zařízení
* Jasná indikace stavu zařízení v UI

---

## 9. Doporučené použití (shrnutí)

* **Browser-native**:

  * jednoduché serial zařízení (scanner, váha)
  * prototypy, laboratorní a málo vytížené stanice
* **Agent**:

  * tisk (CUPS)
  * HID mimo fokus
  * vyšší spolehlivost / kiosk / více zařízení

---

## 10. Shrnutí

Navržený systém:

* funguje **bez desktop wrapperu**,
* umožňuje **více agentů současně**,
* podporuje **přímé připojení zařízení v prohlížeči**,
* má **jedno stabilní API (`nextIO`)**,
* je dlouhodobě udržitelný a rozšiřitelný.
