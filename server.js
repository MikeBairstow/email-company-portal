const express = require('express');
const session = require('express-session');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3340;

// Database setup
const db = new Database(process.env.DATABASE_PATH || './data/portal.db');
db.pragma('journal_mode = WAL');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    company_name TEXT NOT NULL,
    logo_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    inboxes INTEGER DEFAULT 1,
    daily_sends INTEGER DEFAULT 0,
    daily_limit INTEGER DEFAULT 500,
    open_rate REAL DEFAULT 0,
    reply_rate REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    emails_sent INTEGER DEFAULT 0,
    opens INTEGER DEFAULT 0,
    replies INTEGER DEFAULT 0,
    bounces INTEGER DEFAULT 0,
    UNIQUE(client_id, date),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    date_from TEXT,
    date_to TEXT,
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );
`);

// Seed demo data if empty
const clientCount = db.prepare('SELECT COUNT(*) as count FROM clients').get();
if (clientCount.count === 0) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('demo2026', 10);
  
  const insertClient = db.prepare('INSERT INTO clients (email, password, company_name) VALUES (?, ?, ?)');
  const result = insertClient.run('demo@agency.com', hash, 'Demo Agency');
  const clientId = result.lastInsertRowid;

  // Seed campaigns
  const insertCampaign = db.prepare('INSERT INTO campaigns (client_id, name, status, inboxes, daily_sends, daily_limit, open_rate, reply_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertCampaign.run(clientId, 'SaaS Outreach - Q1', 'active', 3, 450, 500, 42.5, 12.8);
  insertCampaign.run(clientId, 'Product Launch - Beta', 'paused', 1, 0, 200, 35.1, 8.4);
  insertCampaign.run(clientId, 'Follow-up Sequence', 'active', 2, 150, 250, 55.9, 18.2);
  insertCampaign.run(clientId, 'Lost Leads Re-engagement', 'active', 1, 75, 100, 28.3, 4.5);
  insertCampaign.run(clientId, 'Event Invitation', 'paused', 1, 0, 300, 61.2, 22.7);

  // Seed 30 days of metrics
  const insertMetric = db.prepare('INSERT INTO daily_metrics (client_id, date, emails_sent, opens, replies, bounces) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const sent = Math.floor(Math.random() * 2000) + 3000;
    const opens = Math.floor(sent * (0.38 + Math.random() * 0.15));
    const replies = Math.floor(sent * (0.08 + Math.random() * 0.08));
    const bounces = Math.floor(sent * (0.02 + Math.random() * 0.02));
    insertMetric.run(clientId, dateStr, sent, opens, replies, bounces);
  }

  // Seed reports
  const insertReport = db.prepare('INSERT INTO reports (client_id, name, type, date_from, date_to) VALUES (?, ?, ?, ?, ?)');
  insertReport.run(clientId, 'Weekly Summary - Feb 5', 'weekly', '2026-01-29', '2026-02-05');
  insertReport.run(clientId, 'Monthly Performance - Jan', 'monthly', '2026-01-01', '2026-01-31');
  insertReport.run(clientId, 'Campaign Report - Cold Outreach', 'campaign', '2026-01-15', '2026-02-05');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'email-company-portal-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.clientId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Auth routes
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const bcrypt = require('bcryptjs');
  
  const client = db.prepare('SELECT * FROM clients WHERE email = ?').get(email);
  if (!client || !bcrypt.compareSync(password, client.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  db.prepare('UPDATE clients SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(client.id);
  req.session.clientId = client.id;
  res.json({ success: true, company: client.company_name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const client = db.prepare('SELECT id, email, company_name, logo_url FROM clients WHERE id = ?').get(req.session.clientId);
  res.json(client);
});

// Dashboard API
app.get('/api/dashboard', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  
  // Get totals from last 30 days
  const metrics = db.prepare(`
    SELECT 
      SUM(emails_sent) as total_sent,
      SUM(opens) as total_opens,
      SUM(replies) as total_replies,
      SUM(bounces) as total_bounces
    FROM daily_metrics 
    WHERE client_id = ? AND date >= date('now', '-30 days')
  `).get(clientId);

  // Get campaign counts
  const campaigns = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
      SUM(inboxes) as total_inboxes
    FROM campaigns WHERE client_id = ?
  `).get(clientId);

  // Calculate rates
  const openRate = metrics.total_sent > 0 ? ((metrics.total_opens / metrics.total_sent) * 100).toFixed(1) : 0;
  const replyRate = metrics.total_sent > 0 ? ((metrics.total_replies / metrics.total_sent) * 100).toFixed(1) : 0;
  const bounceRate = metrics.total_sent > 0 ? ((metrics.total_bounces / metrics.total_sent) * 100).toFixed(1) : 0;

  res.json({
    totalSent: metrics.total_sent || 0,
    openRate: parseFloat(openRate),
    replyRate: parseFloat(replyRate),
    bounceRate: parseFloat(bounceRate),
    activeCampaigns: campaigns.active || 0,
    totalInboxes: campaigns.total_inboxes || 0
  });
});

// Analytics API
app.get('/api/analytics/daily', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  const days = parseInt(req.query.days) || 30;
  
  const data = db.prepare(`
    SELECT date, emails_sent, opens, replies, bounces
    FROM daily_metrics 
    WHERE client_id = ? 
    ORDER BY date DESC 
    LIMIT ?
  `).all(clientId, days);
  
  res.json(data.reverse());
});

app.get('/api/analytics/campaigns', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  
  const data = db.prepare(`
    SELECT name, open_rate, reply_rate
    FROM campaigns 
    WHERE client_id = ? AND status = 'active'
    ORDER BY open_rate DESC
  `).all(clientId);
  
  res.json(data);
});

// Campaigns API
app.get('/api/campaigns', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  
  const campaigns = db.prepare(`
    SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC
  `).all(clientId);
  
  res.json(campaigns);
});

app.post('/api/campaigns/:id/toggle', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  const campaignId = req.params.id;
  
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND client_id = ?').get(campaignId, clientId);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  
  const newStatus = campaign.status === 'active' ? 'paused' : 'active';
  db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(newStatus, campaignId);
  
  res.json({ success: true, status: newStatus });
});

// Reports API
app.get('/api/reports', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  
  const reports = db.prepare(`
    SELECT * FROM reports WHERE client_id = ? ORDER BY created_at DESC
  `).all(clientId);
  
  res.json(reports);
});

// Settings API
app.get('/api/settings', requireAuth, (req, res) => {
  const client = db.prepare('SELECT id, email, company_name, logo_url FROM clients WHERE id = ?').get(req.session.clientId);
  res.json(client);
});

app.put('/api/settings', requireAuth, (req, res) => {
  const { company_name, logo_url } = req.body;
  db.prepare('UPDATE clients SET company_name = ?, logo_url = ? WHERE id = ?').run(company_name, logo_url || null, req.session.clientId);
  res.json({ success: true });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Email Company Portal running on port ${PORT}`);
});
