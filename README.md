# Email Company Client Portal

A client-facing dashboard for Email Company agency partners to view campaign performance, analytics, and generate white-label reports.

## Features

- 📊 **Dashboard** - KPIs, send trends, open rates by campaign
- 📈 **Analytics** - Daily/weekly/monthly performance charts
- ✉️ **Campaigns** - View and manage active campaigns
- 📄 **Reports** - White-label PDF report generation
- ⚙️ **Settings** - Agency profile and branding

## Tech Stack

- Node.js + Express
- SQLite (better-sqlite3)
- Chart.js for visualizations
- Vanilla JS frontend (no framework)

## Demo Login

- Email: `demo@agency.com`
- Password: `demo2026`

## Local Development

```bash
npm install
npm start
# Visit http://localhost:3340
```

## Environment Variables

- `PORT` - Server port (default: 3340)
- `SESSION_SECRET` - Session encryption key
- `DATABASE_PATH` - SQLite database path

## Deployment

Configured for Railway deployment. Push to deploy.

---

Built for Email Company by Ash 🔥
