
# JustSpace

JustSpace ist eine Open-Source-Plattform für Projektmanagement, Wissensmanagement und kollaborative Arbeit. Sie kombiniert ein modernes Next.js-Frontend mit einem Go-Backend und einer PostgreSQL-Datenbank. Das System ist für Selbsthosting und individuelle Anpassung ausgelegt.

---

## Features

- **Projekte & Aufgaben:** Kanban-Board, Statusverwaltung, Zeitplanung
- **Task-Tags:** Freie Tags pro Aufgabe mit Filterung im Projektkontext
- **Gespeicherte Ansichten & Suche:** Projektansichten mit Filtern speichern und per Command Palette schneller finden
- **Erinnerungen & Wiederholungen:** Deadline-Reminders, persistente Abhängigkeiten und automatisch nachlaufende wiederkehrende Tasks
- **Wiki & Snippets:** Markdown-basierte Wissensdatenbank und Code-Snippet-Verwaltung
- **Aktivitäts-Feed & Versionierung**
- **Verschlüsselung:** Optionale Verschlüsselung sensibler Daten
- **PWA-Installation:** Als installierbare Desktop-App mit Dock-Support in kompatiblen Browsern
- **Moderne UI:** HeroUI v3, Tailwind CSS v4
- **WebSocket-Unterstützung**

---

## Schnellstart (lokal mit Docker Compose)

1. **Repository klonen:**
	```bash
	git clone https://github.com/JustLabV1/justspace.git
	cd justspace
	```

2. **Umgebungsvariablen setzen:**
	- Kopiere `.env.example` nach `.env` und passe die Werte ggf. an.
	- Für das relationale Schema und Persistenzdetails siehe `POSTGRES_SCHEMA.md`.

3. **Container starten:**
	```bash
	docker-compose up --build
	```
	- Frontend: http://localhost:3000
	- Backend-API: http://localhost:8080
	- PostgreSQL: localhost:5432

4. **(Optional) Datenbankmigrationen:**
	- Migrationen werden beim Start automatisch angewendet.

---

## Manuelle Entwicklung (ohne Docker)

### Voraussetzungen
- Node.js >= 20, pnpm empfohlen
- Go >= 1.25
- PostgreSQL >= 15

### Backend (Go)
```bash
cd backend
go run ./cmd/server
```

### Frontend (Next.js)
```bash
pnpm install
pnpm run dev
# oder
npm run dev
```

---

## Konfiguration

Siehe `.env.example` für alle relevanten Umgebungsvariablen (DB, API, JWT, CORS, etc.).

**Wichtige Variablen:**
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`
- `JWT_SECRET` (Backend)
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` (Frontend)

---

## Datenbank

Das System nutzt PostgreSQL als primäre Persistenzschicht.

Siehe [POSTGRES_SCHEMA.md](POSTGRES_SCHEMA.md) für das relationale Schema, Task-Metadaten und Migrationshinweise.

---

## Deployment

### Docker Compose (empfohlen)
```bash
docker-compose up --build -d
```

### Manuell (z.B. für eigene Server)
1. Backend bauen: `cd backend && go build -o server ./cmd/server/`
2. Frontend bauen: `pnpm run build`
3. Reverse Proxy (z.B. nginx) für Port 3000 (Frontend) und 8080 (Backend) einrichten

### PWA-Hinweise

- Die App liefert jetzt ein Web App Manifest und einen Service Worker für installierbare Browser aus.
- In lokaler Entwicklung wird der Service Worker automatisch entfernt, damit keine veralteten Frontend-Bundles aus dem PWA-Cache geladen werden.
- Für die Installation außerhalb von `localhost` ist HTTPS erforderlich.
- Chrome und Edge können eine Installationsaufforderung anzeigen.
- Safari auf macOS verwendet stattdessen den Menüpunkt `File > Add to Dock`.

---

## Update & Migration

1. Repository aktualisieren: `git pull`
2. Abhängigkeiten aktualisieren: `pnpm install` (Frontend), `go mod tidy` (Backend)
3. Datenbankmigrationen prüfen/anwenden

---

## Lizenz

MIT License — siehe [LICENSE](LICENSE)

---

## Community & Support

Fragen, Feature-Requests oder Bugs? Erstelle ein Issue oder nutze die Discussions im GitHub-Repo.

---

**Viel Spaß mit JustSpace!**
