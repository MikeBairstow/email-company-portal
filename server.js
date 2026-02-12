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
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    // Check if data has new structure (agencies), if not, reinitialize
    if (!data.agencies) {
      console.log('Migrating to new data structure...');
      return initializeData();
    }
    return data;
  }
  return initializeData();
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function initializeData() {
  const demoHash = bcrypt.hashSync('demo2026', 10);
  const daHash = bcrypt.hashSync('DA2026!', 10);
  
  const data = {
    // Agencies are the login users (Email Company's clients)
    agencies: [
      {
        id: 1,
        email: 'demo@agency.com',
        password: demoHash,
        name: 'Demo Agency',
        logoUrl: null,
        createdAt: new Date().toISOString(),
        lastLogin: null
      },
      {
        id: 2,
        email: 'da@client.com',
        password: daHash,
        name: 'DA',
        logoUrl: null,
        createdAt: new Date().toISOString(),
        lastLogin: null
      }
    ],
    // Sub-accounts belong to agencies (each has its own Instantly API key)
    subAccounts: [
      // Demo agency sub-accounts (mock data)
      {
        id: 1,
        agencyId: 1,
        name: 'Demo Client A',
        instantlyApiKey: null, // Uses mock data
        createdAt: new Date().toISOString()
      },
      {
        id: 2,
        agencyId: 1,
        name: 'Demo Client B',
        instantlyApiKey: null,
        createdAt: new Date().toISOString()
      },
      // DA's sub-accounts (real Instantly data)
      {
        id: 3,
        agencyId: 2,
        name: 'Cyberhornet',
        instantlyApiKey: 'ODZkYzBiYzItZGRmZS00NWE5LWFlMGMtYTNiZjhlNDAwOTIwOkd1Z0ZvdVFJb05WQQ==',
        createdAt: new Date().toISOString()
      }
    ],
    // Mock data for demo accounts
    mockMetrics: generateMockMetrics(),
    mockCampaigns: [
      { id: 1, subAccountId: 1, name: 'SaaS Outreach - Q1', status: 'active', inboxes: 3, dailySends: 450, dailyLimit: 500, openRate: 42.5, replyRate: 12.8 },
      { id: 2, subAccountId: 1, name: 'Product Launch - Beta', status: 'paused', inboxes: 1, dailySends: 0, dailyLimit: 200, openRate: 35.1, replyRate: 8.4 },
      { id: 3, subAccountId: 2, name: 'Follow-up Sequence', status: 'active', inboxes: 2, dailySends: 150, dailyLimit: 250, openRate: 55.9, replyRate: 18.2 },
      { id: 4, subAccountId: 2, name: 'Lost Leads Re-engagement', status: 'active', inboxes: 1, dailySends: 75, dailyLimit: 100, openRate: 28.3, replyRate: 4.5 }
    ],
    reports: []
  };
  
  saveData(data);
  return data;
}

function generateMockMetrics() {
  const metrics = [];
  for (let subAccountId = 1; subAccountId <= 2; subAccountId++) {
    for (let i = 30; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const sent = Math.floor(Math.random() * 1500) + 1500;
      const opens = Math.floor(sent * (0.38 + Math.random() * 0.15));
      const replies = Math.floor(sent * (0.08 + Math.random() * 0.08));
      const bounces = Math.floor(sent * (0.02 + Math.random() * 0.02));
      metrics.push({ subAccountId, date: dateStr, emailsSent: sent, opens, replies, bounces });
    }
  }
  return metrics;
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
  if (req.session.agencyId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Auth routes
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  const agency = data.agencies.find(a => a.email === email);
  if (!agency || !bcrypt.compareSync(password, agency.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  agency.lastLogin = new Date().toISOString();
  saveData(data);
  req.session.agencyId = agency.id;
  res.json({ success: true, company: agency.name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const agency = data.agencies.find(a => a.id === req.session.agencyId);
  if (!agency) return res.status(404).json({ error: 'Not found' });
  
  const subAccounts = data.subAccounts.filter(s => s.agencyId === agency.id);
  
  res.json({
    id: agency.id,
    email: agency.email,
    company_name: agency.name,
    logo_url: agency.logoUrl,
    subAccounts: subAccounts.map(s => ({ id: s.id, name: s.name, hasInstantly: !!s.instantlyApiKey }))
  });
});

// Sub-accounts API
app.get('/api/sub-accounts', requireAuth, (req, res) => {
  const agencyId = req.session.agencyId;
  const subAccounts = data.subAccounts.filter(s => s.agencyId === agencyId);
  res.json(subAccounts.map(s => ({ 
    id: s.id, 
    name: s.name, 
    hasInstantly: !!s.instantlyApiKey,
    createdAt: s.createdAt
  })));
});

// Dashboard API - aggregates all sub-accounts for agency
app.get('/api/dashboard', requireAuth, async (req, res) => {
  const agencyId = req.session.agencyId;
  const subAccountId = req.query.subAccountId ? parseInt(req.query.subAccountId) : null;
  
  // Get sub-accounts for this agency
  let subAccounts = data.subAccounts.filter(s => s.agencyId === agencyId);
  if (subAccountId) {
    subAccounts = subAccounts.filter(s => s.id === subAccountId);
  }
  
  let totalSent = 0, totalOpens = 0, totalReplies = 0, totalBounces = 0;
  let activeCampaigns = 0, totalInboxes = 0;
  let isLive = false;
  
  for (const subAccount of subAccounts) {
    if (subAccount.instantlyApiKey) {
      // Fetch real data from Instantly
      isLive = true;
      try {
        const accounts = await instantlyFetch(subAccount.instantlyApiKey, '/accounts?limit=100');
        totalInboxes += accounts?.items?.length || 0;
        
        const campaigns = await instantlyFetch(subAccount.instantlyApiKey, '/campaigns?limit=100');
        activeCampaigns += campaigns?.items?.filter(c => c.status === 'active')?.length || 0;
        
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        if (campaigns?.items) {
          for (const campaign of campaigns.items.slice(0, 10)) {
            const analytics = await instantlyFetch(subAccount.instantlyApiKey, `/campaigns/${campaign.id}/analytics?start_date=${startDate}&end_date=${endDate}`);
            if (analytics) {
              totalSent += analytics.total_sent || 0;
              totalOpens += analytics.total_opened || 0;
              totalReplies += analytics.total_replied || 0;
              totalBounces += analytics.total_bounced || 0;
            }
          }
        }
      } catch (e) {
        console.error('Instantly error for', subAccount.name, e);
      }
    } else {
      // Use mock data
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
      
      const metrics = data.mockMetrics.filter(m => 
        m.subAccountId === subAccount.id && m.date >= thirtyDaysAgoStr
      );
      
      metrics.forEach(m => {
        totalSent += m.emailsSent;
        totalOpens += m.opens;
        totalReplies += m.replies;
        totalBounces += m.bounces;
      });
      
      const campaigns = data.mockCampaigns.filter(c => c.subAccountId === subAccount.id);
      activeCampaigns += campaigns.filter(c => c.status === 'active').length;
      totalInboxes += campaigns.reduce((sum, c) => sum + c.inboxes, 0);
    }
  }
  
  const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : 0;
  const replyRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : 0;
  const bounceRate = totalSent > 0 ? ((totalBounces / totalSent) * 100).toFixed(1) : 0;
  
  res.json({
    totalSent,
    openRate: parseFloat(openRate),
    replyRate: parseFloat(replyRate),
    bounceRate: parseFloat(bounceRate),
    activeCampaigns,
    totalInboxes,
    subAccountCount: subAccounts.length,
    isLive
  });
});

// Analytics API
app.get('/api/analytics/daily', requireAuth, async (req, res) => {
  const agencyId = req.session.agencyId;
  const subAccountId = req.query.subAccountId ? parseInt(req.query.subAccountId) : null;
  const days = parseInt(req.query.days) || 30;
  
  let subAccounts = data.subAccounts.filter(s => s.agencyId === agencyId);
  if (subAccountId) {
    subAccounts = subAccounts.filter(s => s.id === subAccountId);
  }
  
  const metricsMap = {};
  
  for (const subAccount of subAccounts) {
    if (subAccount.instantlyApiKey) {
      try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const analytics = await instantlyFetch(subAccount.instantlyApiKey, `/accounts/analytics/daily?start_date=${startDate}&end_date=${endDate}`);
        
        if (analytics?.data) {
          analytics.data.forEach(d => {
            if (!metricsMap[d.date]) {
              metricsMap[d.date] = { date: d.date, emails_sent: 0, opens: 0, replies: 0, bounces: 0 };
            }
            metricsMap[d.date].emails_sent += d.sent || 0;
            metricsMap[d.date].opens += d.opened || 0;
            metricsMap[d.date].replies += d.replied || 0;
            metricsMap[d.date].bounces += d.bounced || 0;
          });
        }
      } catch (e) {
        console.error('Instantly analytics error:', e);
      }
    } else {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      
      data.mockMetrics
        .filter(m => m.subAccountId === subAccount.id && m.date >= cutoffStr)
        .forEach(m => {
          if (!metricsMap[m.date]) {
            metricsMap[m.date] = { date: m.date, emails_sent: 0, opens: 0, replies: 0, bounces: 0 };
          }
          metricsMap[m.date].emails_sent += m.emailsSent;
          metricsMap[m.date].opens += m.opens;
          metricsMap[m.date].replies += m.replies;
          metricsMap[m.date].bounces += m.bounces;
        });
    }
  }
  
  const metrics = Object.values(metricsMap).sort((a, b) => a.date.localeCompare(b.date));
  res.json(metrics);
});

app.get('/api/analytics/campaigns', requireAuth, async (req, res) => {
  const agencyId = req.session.agencyId;
  const subAccountId = req.query.subAccountId ? parseInt(req.query.subAccountId) : null;
  
  let subAccounts = data.subAccounts.filter(s => s.agencyId === agencyId);
  if (subAccountId) {
    subAccounts = subAccounts.filter(s => s.id === subAccountId);
  }
  
  const results = [];
  
  for (const subAccount of subAccounts) {
    if (subAccount.instantlyApiKey) {
      try {
        const campaigns = await instantlyFetch(subAccount.instantlyApiKey, '/campaigns?limit=20');
        
        if (campaigns?.items) {
          for (const c of campaigns.items.filter(c => c.status === 'active').slice(0, 5)) {
            const analytics = await instantlyFetch(subAccount.instantlyApiKey, `/campaigns/${c.id}/analytics`);
            const sent = analytics?.total_sent || 0;
            const opens = analytics?.total_opened || 0;
            const replies = analytics?.total_replied || 0;
            
            results.push({
              name: `${c.name} (${subAccount.name})`,
              open_rate: sent > 0 ? parseFloat(((opens / sent) * 100).toFixed(1)) : 0,
              reply_rate: sent > 0 ? parseFloat(((replies / sent) * 100).toFixed(1)) : 0
            });
          }
        }
      } catch (e) {
        console.error('Instantly campaigns error:', e);
      }
    } else {
      data.mockCampaigns
        .filter(c => c.subAccountId === subAccount.id && c.status === 'active')
        .forEach(c => {
          results.push({
            name: `${c.name} (${subAccount.name})`,
            open_rate: c.openRate,
            reply_rate: c.replyRate
          });
        });
    }
  }
  
  res.json(results.sort((a, b) => b.open_rate - a.open_rate).slice(0, 5));
});

// Campaigns API
app.get('/api/campaigns', requireAuth, async (req, res) => {
  const agencyId = req.session.agencyId;
  const subAccountId = req.query.subAccountId ? parseInt(req.query.subAccountId) : null;
  
  let subAccounts = data.subAccounts.filter(s => s.agencyId === agencyId);
  if (subAccountId) {
    subAccounts = subAccounts.filter(s => s.id === subAccountId);
  }
  
  const results = [];
  
  for (const subAccount of subAccounts) {
    if (subAccount.instantlyApiKey) {
      try {
        const campaigns = await instantlyFetch(subAccount.instantlyApiKey, '/campaigns?limit=50');
        
        if (campaigns?.items) {
          for (const c of campaigns.items) {
            const analytics = await instantlyFetch(subAccount.instantlyApiKey, `/campaigns/${c.id}/analytics`);
            const sent = analytics?.total_sent || 0;
            const opens = analytics?.total_opened || 0;
            const replies = analytics?.total_replied || 0;
            
            results.push({
              id: c.id,
              subAccount: subAccount.name,
              name: c.name,
              status: c.status || 'active',
              inboxes: 1,
              daily_sends: analytics?.daily_sent || 0,
              daily_limit: c.daily_limit || 500,
              open_rate: sent > 0 ? parseFloat(((opens / sent) * 100).toFixed(1)) : 0,
              reply_rate: sent > 0 ? parseFloat(((replies / sent) * 100).toFixed(1)) : 0
            });
          }
        }
      } catch (e) {
        console.error('Instantly campaigns error:', e);
      }
    } else {
      data.mockCampaigns
        .filter(c => c.subAccountId === subAccount.id)
        .forEach(c => {
          results.push({
            id: c.id,
            subAccount: subAccount.name,
            name: c.name,
            status: c.status,
            inboxes: c.inboxes,
            daily_sends: c.dailySends,
            daily_limit: c.dailyLimit,
            open_rate: c.openRate,
            reply_rate: c.replyRate
          });
        });
    }
  }
  
  res.json(results);
});

// Reports API
app.get('/api/reports', requireAuth, (req, res) => {
  const agencyId = req.session.agencyId;
  
  const reports = data.reports
    .filter(r => r.agencyId === agencyId)
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
  const agency = data.agencies.find(a => a.id === req.session.agencyId);
  if (!agency) return res.status(404).json({ error: 'Not found' });
  
  res.json({
    id: agency.id,
    email: agency.email,
    company_name: agency.name,
    logo_url: agency.logoUrl
  });
});

app.put('/api/settings', requireAuth, (req, res) => {
  const { company_name, logo_url } = req.body;
  const agency = data.agencies.find(a => a.id === req.session.agencyId);
  if (!agency) return res.status(404).json({ error: 'Not found' });
  
  agency.name = company_name;
  agency.logoUrl = logo_url || null;
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
