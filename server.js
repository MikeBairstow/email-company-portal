const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3340;

// Data file path
const DATA_PATH = process.env.DATA_PATH || './data/data.json';

// Ensure data directory exists
const dataDir = path.dirname(DATA_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load or initialize data
function loadData() {
  if (fs.existsSync(DATA_PATH)) {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  }
  return initializeData();
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function initializeData() {
  const hash = bcrypt.hashSync('demo2026', 10);
  
  // Generate 30 days of metrics
  const dailyMetrics = [];
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const sent = Math.floor(Math.random() * 2000) + 3000;
    const opens = Math.floor(sent * (0.38 + Math.random() * 0.15));
    const replies = Math.floor(sent * (0.08 + Math.random() * 0.08));
    const bounces = Math.floor(sent * (0.02 + Math.random() * 0.02));
    dailyMetrics.push({ clientId: 1, date: dateStr, emailsSent: sent, opens, replies, bounces });
  }
  
  const data = {
    clients: [{
      id: 1,
      email: 'demo@agency.com',
      password: hash,
      companyName: 'Demo Agency',
      logoUrl: null,
      createdAt: new Date().toISOString(),
      lastLogin: null
    }],
    campaigns: [
      { id: 1, clientId: 1, name: 'SaaS Outreach - Q1', status: 'active', inboxes: 3, dailySends: 450, dailyLimit: 500, openRate: 42.5, replyRate: 12.8 },
      { id: 2, clientId: 1, name: 'Product Launch - Beta', status: 'paused', inboxes: 1, dailySends: 0, dailyLimit: 200, openRate: 35.1, replyRate: 8.4 },
      { id: 3, clientId: 1, name: 'Follow-up Sequence', status: 'active', inboxes: 2, dailySends: 150, dailyLimit: 250, openRate: 55.9, replyRate: 18.2 },
      { id: 4, clientId: 1, name: 'Lost Leads Re-engagement', status: 'active', inboxes: 1, dailySends: 75, dailyLimit: 100, openRate: 28.3, replyRate: 4.5 },
      { id: 5, clientId: 1, name: 'Event Invitation', status: 'paused', inboxes: 1, dailySends: 0, dailyLimit: 300, openRate: 61.2, replyRate: 22.7 }
    ],
    dailyMetrics,
    reports: [
      { id: 1, clientId: 1, name: 'Weekly Summary - Feb 5', type: 'weekly', dateFrom: '2026-01-29', dateTo: '2026-02-05', createdAt: new Date().toISOString() },
      { id: 2, clientId: 1, name: 'Monthly Performance - Jan', type: 'monthly', dateFrom: '2026-01-01', dateTo: '2026-01-31', createdAt: new Date().toISOString() },
      { id: 3, clientId: 1, name: 'Campaign Report - Cold Outreach', type: 'campaign', dateFrom: '2026-01-15', dateTo: '2026-02-05', createdAt: new Date().toISOString() }
    ]
  };
  
  saveData(data);
  return data;
}

// Initialize data
let data = loadData();

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
  
  const client = data.clients.find(c => c.email === email);
  if (!client || !bcrypt.compareSync(password, client.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  client.lastLogin = new Date().toISOString();
  saveData(data);
  req.session.clientId = client.id;
  res.json({ success: true, company: client.companyName });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const client = data.clients.find(c => c.id === req.session.clientId);
  if (!client) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: client.id,
    email: client.email,
    company_name: client.companyName,
    logo_url: client.logoUrl
  });
});

// Dashboard API
app.get('/api/dashboard', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  
  // Get last 30 days of metrics
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  const recentMetrics = data.dailyMetrics.filter(m => 
    m.clientId === clientId && m.date >= thirtyDaysAgoStr
  );
  
  const totals = recentMetrics.reduce((acc, m) => ({
    sent: acc.sent + m.emailsSent,
    opens: acc.opens + m.opens,
    replies: acc.replies + m.replies,
    bounces: acc.bounces + m.bounces
  }), { sent: 0, opens: 0, replies: 0, bounces: 0 });
  
  const clientCampaigns = data.campaigns.filter(c => c.clientId === clientId);
  const activeCampaigns = clientCampaigns.filter(c => c.status === 'active').length;
  const totalInboxes = clientCampaigns.reduce((sum, c) => sum + c.inboxes, 0);
  
  const openRate = totals.sent > 0 ? ((totals.opens / totals.sent) * 100).toFixed(1) : 0;
  const replyRate = totals.sent > 0 ? ((totals.replies / totals.sent) * 100).toFixed(1) : 0;
  const bounceRate = totals.sent > 0 ? ((totals.bounces / totals.sent) * 100).toFixed(1) : 0;
  
  res.json({
    totalSent: totals.sent,
    openRate: parseFloat(openRate),
    replyRate: parseFloat(replyRate),
    bounceRate: parseFloat(bounceRate),
    activeCampaigns,
    totalInboxes
  });
});

// Analytics API
app.get('/api/analytics/daily', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  const days = parseInt(req.query.days) || 30;
  
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  
  const metrics = data.dailyMetrics
    .filter(m => m.clientId === clientId && m.date >= cutoffStr)
    .map(m => ({
      date: m.date,
      emails_sent: m.emailsSent,
      opens: m.opens,
      replies: m.replies,
      bounces: m.bounces
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  res.json(metrics);
});

app.get('/api/analytics/campaigns', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  
  const campaigns = data.campaigns
    .filter(c => c.clientId === clientId && c.status === 'active')
    .map(c => ({
      name: c.name,
      open_rate: c.openRate,
      reply_rate: c.replyRate
    }))
    .sort((a, b) => b.open_rate - a.open_rate);
  
  res.json(campaigns);
});

// Campaigns API
app.get('/api/campaigns', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  
  const campaigns = data.campaigns
    .filter(c => c.clientId === clientId)
    .map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      inboxes: c.inboxes,
      daily_sends: c.dailySends,
      daily_limit: c.dailyLimit,
      open_rate: c.openRate,
      reply_rate: c.replyRate
    }));
  
  res.json(campaigns);
});

app.post('/api/campaigns/:id/toggle', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  const campaignId = parseInt(req.params.id);
  
  const campaign = data.campaigns.find(c => c.id === campaignId && c.clientId === clientId);
  if (!campaign) return res.status(404).json({ error: 'Not found' });
  
  campaign.status = campaign.status === 'active' ? 'paused' : 'active';
  saveData(data);
  
  res.json({ success: true, status: campaign.status });
});

// Reports API
app.get('/api/reports', requireAuth, (req, res) => {
  const clientId = req.session.clientId;
  
  const reports = data.reports
    .filter(r => r.clientId === clientId)
    .map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      date_from: r.dateFrom,
      date_to: r.dateTo,
      created_at: r.createdAt
    }));
  
  res.json(reports);
});

// Settings API
app.get('/api/settings', requireAuth, (req, res) => {
  const client = data.clients.find(c => c.id === req.session.clientId);
  if (!client) return res.status(404).json({ error: 'Not found' });
  
  res.json({
    id: client.id,
    email: client.email,
    company_name: client.companyName,
    logo_url: client.logoUrl
  });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const { company_name, logo_url } = req.body;
  const client = data.clients.find(c => c.id === req.session.clientId);
  if (!client) return res.status(404).json({ error: 'Not found' });
  
  client.companyName = company_name;
  client.logoUrl = logo_url || null;
  saveData(data);
  
  res.json({ success: true });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Email Company Portal running on port ${PORT}`);
});
