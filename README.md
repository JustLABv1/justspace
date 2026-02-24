
# JustSpace

JustSpace ist eine Open-Source-Plattform für Projektmanagement, Wissensmanagement und kollaborative Arbeit. Sie kombiniert ein modernes Next.js-Frontend mit einem Go-Backend und einer PostgreSQL-Datenbank. Das System ist für Selbsthosting und individuelle Anpassung ausgelegt.

---

## Features

- **Projekte & Aufgaben:** Kanban-Board, Statusverwaltung, Zeitplanung
- **Wiki & Snippets:** Markdown-basierte Wissensdatenbank und Code-Snippet-Verwaltung
- **Aktivitäts-Feed & Versionierung**
- **Verschlüsselung:** Optionale Verschlüsselung sensibler Daten
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
	- Für Appwrite-Integration siehe `POSTGRES_SCHEMA.md` und ggf. `.env.local`.

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

## Datenbank & Appwrite

Das System nutzt primär PostgreSQL. Für optionale Features (z.B. verschlüsselte User-Daten, erweiterte Authentifizierung) kann Appwrite integriert werden.

Siehe [POSTGRES_SCHEMA.md](POSTGRES_SCHEMA.md) für das relationale Schema und Hinweise zur Appwrite-Einbindung.

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
