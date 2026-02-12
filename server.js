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

// Instantly API helper
async function instantlyFetch(apiKey, endpoint, method = 'GET', body = null) {
  const url = `https://api.instantly.ai/api/v2${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  try {
    const response = await fetch(url, options);
    return await response.json();
  } catch (e) {
    console.error('Instantly API error:', e);
    return null;
  }
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
  const demoHash = bcrypt.hashSync('demo2026', 10);
  const daHash = bcrypt.hashSync('DA2026!', 10);
  
  // Generate 30 days of demo metrics
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
    clients: [
      {
        id: 1,
        email: 'demo@agency.com',
        password: demoHash,
        companyName: 'Demo Agency',
        logoUrl: null,
        instantlyApiKey: null, // Demo uses mock data
        createdAt: new Date().toISOString(),
        lastLogin: null
      },
      {
        id: 2,
        email: 'da@client.com',
        password: daHash,
        companyName: 'DA',
        logoUrl: null,
        instantlyApiKey: 'ODZkYzBiYzItZGRmZS00NWE5LWFlMGMtYTNiZjhlNDAwOTIwOkd1Z0ZvdVFJb05WQQ==', // Cyberhornet
        createdAt: new Date().toISOString(),
        lastLogin: null
      }
    ],
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

// Add DA client if not exists
if (!data.clients.find(c => c.email === 'da@client.com')) {
  const daHash = bcrypt.hashSync('DA2026!', 10);
  data.clients.push({
    id: 2,
    email: 'da@client.com',
    password: daHash,
    companyName: 'DA',
    logoUrl: null,
    instantlyApiKey: 'ODZkYzBiYzItZGRmZS00NWE5LWFlMGMtYTNiZjhlNDAwOTIwOkd1Z0ZvdVFJb05WQQ==',
    createdAt: new Date().toISOString(),
    lastLogin: null
  });
  saveData(data);
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
    logo_url: client.logoUrl,
    has_instantly: !!client.instantlyApiKey
  });
});

// Dashboard API - supports real Instantly data
app.get('/api/dashboard', requireAuth, async (req, res) => {
  const clientId = req.session.clientId;
  const client = data.clients.find(c => c.id === clientId);
  
  // If client has Instantly API key, fetch real data
  if (client && client.instantlyApiKey) {
    try {
      // Get accounts
      const accounts = await instantlyFetch(client.instantlyApiKey, '/accounts?limit=100');
      const totalInboxes = accounts?.items?.length || 0;
      
      // Get campaign analytics
      const campaigns = await instantlyFetch(client.instantlyApiKey, '/campaigns?limit=100');
      const activeCampaigns = campaigns?.items?.filter(c => c.status === 'active')?.length || 0;
      
      // Get analytics summary (last 30 days)
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      let totalSent = 0, totalOpens = 0, totalReplies = 0, totalBounces = 0;
      
      if (campaigns?.items) {
        for (const campaign of campaigns.items) {
          const analytics = await instantlyFetch(client.instantlyApiKey, `/campaigns/${campaign.id}/analytics?start_date=${startDate}&end_date=${endDate}`);
          if (analytics) {
            totalSent += analytics.total_sent || 0;
            totalOpens += analytics.total_opened || 0;
            totalReplies += analytics.total_replied || 0;
            totalBounces += analytics.total_bounced || 0;
          }
        }
      }
      
      const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : 0;
      const replyRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : 0;
      const bounceRate = totalSent > 0 ? ((totalBounces / totalSent) * 100).toFixed(1) : 0;
      
      return res.json({
        totalSent,
        openRate: parseFloat(openRate),
        replyRate: parseFloat(replyRate),
        bounceRate: parseFloat(bounceRate),
        activeCampaigns,
        totalInboxes,
        isLive: true
      });
    } catch (e) {
      console.error('Instantly fetch error:', e);
    }
  }
  
  // Fallback to mock data
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
    totalInboxes,
    isLive: false
  });
});

// Analytics API
app.get('/api/analytics/daily', requireAuth, async (req, res) => {
  const clientId = req.session.clientId;
  const client = data.clients.find(c => c.id === clientId);
  const days = parseInt(req.query.days) || 30;
  
  // If client has Instantly API key, fetch real data
  if (client && client.instantlyApiKey) {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Get daily analytics from accounts
      const analytics = await instantlyFetch(client.instantlyApiKey, `/accounts/analytics/daily?start_date=${startDate}&end_date=${endDate}`);
      
      if (analytics?.data) {
        const metrics = analytics.data.map(d => ({
          date: d.date,
          emails_sent: d.sent || 0,
          opens: d.opened || 0,
          replies: d.replied || 0,
          bounces: d.bounced || 0
        })).sort((a, b) => a.date.localeCompare(b.date));
        
        return res.json(metrics);
      }
    } catch (e) {
      console.error('Instantly analytics error:', e);
    }
  }
  
  // Fallback to mock data
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

app.get('/api/analytics/campaigns', requireAuth, async (req, res) => {
  const clientId = req.session.clientId;
  const client = data.clients.find(c => c.id === clientId);
  
  // If client has Instantly API key, fetch real data
  if (client && client.instantlyApiKey) {
    try {
      const campaigns = await instantlyFetch(client.instantlyApiKey, '/campaigns?limit=100');
      
      if (campaigns?.items) {
        const results = [];
        for (const c of campaigns.items.filter(c => c.status === 'active').slice(0, 5)) {
          const analytics = await instantlyFetch(client.instantlyApiKey, `/campaigns/${c.id}/analytics`);
          const sent = analytics?.total_sent || 0;
          const opens = analytics?.total_opened || 0;
          const replies = analytics?.total_replied || 0;
          
          results.push({
            name: c.name,
            open_rate: sent > 0 ? parseFloat(((opens / sent) * 100).toFixed(1)) : 0,
            reply_rate: sent > 0 ? parseFloat(((replies / sent) * 100).toFixed(1)) : 0
          });
        }
        return res.json(results.sort((a, b) => b.open_rate - a.open_rate));
      }
    } catch (e) {
      console.error('Instantly campaigns error:', e);
    }
  }
  
  // Fallback to mock data
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
app.get('/api/campaigns', requireAuth, async (req, res) => {
  const clientId = req.session.clientId;
  const client = data.clients.find(c => c.id === clientId);
  
  // If client has Instantly API key, fetch real data
  if (client && client.instantlyApiKey) {
    try {
      const campaigns = await instantlyFetch(client.instantlyApiKey, '/campaigns?limit=100');
      const accounts = await instantlyFetch(client.instantlyApiKey, '/accounts?limit=100');
      
      if (campaigns?.items) {
        const results = [];
        for (const c of campaigns.items) {
          const analytics = await instantlyFetch(client.instantlyApiKey, `/campaigns/${c.id}/analytics`);
          const sent = analytics?.total_sent || 0;
          const opens = analytics?.total_opened || 0;
          const replies = analytics?.total_replied || 0;
          
          // Count inboxes for this campaign
          const campaignAccounts = accounts?.items?.filter(a => 
            a.campaign_id === c.id || !a.campaign_id
          )?.length || 1;
          
          results.push({
            id: c.id,
            name: c.name,
            status: c.status || 'active',
            inboxes: campaignAccounts,
            daily_sends: analytics?.daily_sent || 0,
            daily_limit: c.daily_limit || 500,
            open_rate: sent > 0 ? parseFloat(((opens / sent) * 100).toFixed(1)) : 0,
            reply_rate: sent > 0 ? parseFloat(((replies / sent) * 100).toFixed(1)) : 0
          });
        }
        return res.json(results);
      }
    } catch (e) {
      console.error('Instantly campaigns error:', e);
    }
  }
  
  // Fallback to mock data
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
