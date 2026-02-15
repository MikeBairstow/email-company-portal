const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3340;
const JWT_SECRET = process.env.JWT_SECRET || 'email-company-jwt-secret-2026';

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
    try {
      const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      if (data.partners) return data;
    } catch (e) {
      console.error('Error loading data:', e);
    }
  }
  return initializeData();
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function initializeData() {
  const demoHash = bcrypt.hashSync('demo2026', 10);
  
  const data = {
    partners: [
      {
        id: 'partner_001',
        email: 'demo@agency.com',
        password: demoHash,
        name: 'Demo Agency',
        logoUrl: null,
        contactEmail: 'team@demo-agency.com',
        phone: '+1-555-0123',
        createdAt: new Date().toISOString(),
        lastLogin: null,
        notifications: {
          emailAlerts: true,
          weeklySummary: true,
          campaignAlerts: false
        },
        whiteLabel: {
          customLogoUrl: null,
          primaryColor: '#7C50F9'
        }
      }
    ],
    partnerUsers: [
      {
        id: 'user_001',
        partnerId: 'partner_001',
        name: 'John Demo',
        email: 'john@demo-agency.com',
        role: 'admin'
      }
    ],
    subAccounts: [
      {
        id: 'sub_001',
        partnerId: 'partner_001',
        companyName: 'Acme Corp',
        status: 'active',
        instantlyApiKey: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'sub_002',
        partnerId: 'partner_001',
        companyName: 'TechStart Inc',
        status: 'active',
        instantlyApiKey: null,
        createdAt: new Date().toISOString()
      },
      {
        id: 'sub_003',
        partnerId: 'partner_001',
        companyName: 'GrowthLabs',
        status: 'onboarding',
        instantlyApiKey: null,
        createdAt: new Date().toISOString()
      }
    ],
    apiKeys: [
      {
        id: 'key_001',
        partnerId: 'partner_001',
        apiKey: 'pk_live_demo_' + Math.random().toString(36).substring(2, 15),
        webhookUrl: null,
        createdAt: new Date().toISOString()
      }
    ],
    scheduledReports: [],
    activityLog: [],
    mockData: generateMockData()
  };
  
  saveData(data);
  return data;
}

function generateMockData() {
  const metrics = {};
  const campaigns = {};
  
  ['sub_001', 'sub_002', 'sub_003'].forEach(subId => {
    metrics[subId] = [];
    campaigns[subId] = [];
    
    // Generate 90 days of metrics
    for (let i = 90; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const baseSent = subId === 'sub_003' ? 0 : Math.floor(Math.random() * 300) + 100;
      const sent = baseSent;
      const opens = Math.floor(sent * (0.45 + Math.random() * 0.15));
      const replies = Math.floor(sent * (0.06 + Math.random() * 0.06));
      const bounces = Math.floor(sent * (0.01 + Math.random() * 0.02));
      
      metrics[subId].push({ date: dateStr, sent, opens, replies, bounces });
    }
    
    // Generate campaigns
    const campaignNames = subId === 'sub_001' 
      ? ['Q1 SaaS Outreach', 'Product Launch Beta', 'Enterprise ABM']
      : subId === 'sub_002'
      ? ['Cold Email - Tech', 'Follow-up Sequence', 'Re-engagement']
      : ['Onboarding Campaign'];
    
    campaignNames.forEach((name, idx) => {
      const isActive = subId !== 'sub_003' && idx < 2;
      const sent = isActive ? Math.floor(Math.random() * 2000) + 500 : 0;
      campaigns[subId].push({
        id: `camp_${subId}_${idx}`,
        name,
        status: isActive ? 'active' : 'paused',
        sent,
        opens: Math.floor(sent * 0.52),
        replies: Math.floor(sent * 0.09),
        startDate: new Date(Date.now() - (30 + idx * 15) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
    });
  });
  
  return { metrics, campaigns };
}

// Initialize data
let data = loadData();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// JWT Auth middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.partnerId = decoded.partnerId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ============ AUTH ROUTES ============

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  const partner = data.partners.find(p => p.email === email);
  if (!partner || !bcrypt.compareSync(password, partner.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  partner.lastLogin = new Date().toISOString();
  saveData(data);
  
  const token = jwt.sign({ partnerId: partner.id }, JWT_SECRET, { expiresIn: '24h' });
  
  res.json({
    token,
    partner: {
      id: partner.id,
      name: partner.name,
      email: partner.email
    }
  });
});

// ============ DASHBOARD ROUTES ============

app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  const subAccounts = data.subAccounts.filter(s => s.partnerId === req.partnerId);
  
  let totalEmailsSent = 0;
  let totalOpens = 0;
  let totalReplies = 0;
  const activeSubAccounts = subAccounts.filter(s => s.status === 'active').length;
  
  // Last 30 days chart data
  const chartDataMap = {};
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  for (const sub of subAccounts) {
    if (sub.instantlyApiKey) {
      // Real Instantly data
      try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        
        const dailyAnalytics = await instantlyFetch(sub.instantlyApiKey, `/accounts/analytics/daily?start_date=${startDate}&end_date=${endDate}`);
        if (Array.isArray(dailyAnalytics)) {
          dailyAnalytics.forEach(d => {
            if (!chartDataMap[d.date]) {
              chartDataMap[d.date] = { date: d.date, sent: 0, opens: 0, replies: 0 };
            }
            chartDataMap[d.date].sent += d.sent || 0;
          });
        }
        
        const summary = await instantlyFetch(sub.instantlyApiKey, `/analytics/campaign/summary?start_date=${startDate}&end_date=${endDate}`);
        if (summary) {
          totalOpens += summary.total_opened || 0;
          totalReplies += summary.total_replied || 0;
        }
      } catch (e) {
        console.error('Instantly error:', e);
      }
    } else {
      // Mock data
      const mockMetrics = data.mockData.metrics[sub.id] || [];
      mockMetrics
        .filter(m => new Date(m.date) >= thirtyDaysAgo)
        .forEach(m => {
          if (!chartDataMap[m.date]) {
            chartDataMap[m.date] = { date: m.date, sent: 0, opens: 0, replies: 0 };
          }
          chartDataMap[m.date].sent += m.sent;
          chartDataMap[m.date].opens += m.opens;
          chartDataMap[m.date].replies += m.replies;
          totalOpens += m.opens;
          totalReplies += m.replies;
        });
    }
  }
  
  const chartData = Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date));
  totalEmailsSent = chartData.reduce((sum, d) => sum + d.sent, 0);
  
  const openRate = totalEmailsSent > 0 ? parseFloat(((totalOpens / totalEmailsSent) * 100).toFixed(1)) : 0;
  const replyRate = totalEmailsSent > 0 ? parseFloat(((totalReplies / totalEmailsSent) * 100).toFixed(1)) : 0;
  
  // Recent activity (mock for now)
  const recentActivity = [
    { type: 'campaign_sent', subAccount: subAccounts[0]?.companyName || 'Client A', details: '500 emails', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { type: 'reply_received', subAccount: subAccounts[1]?.companyName || 'Client B', details: '15 new replies', timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
    { type: 'campaign_started', subAccount: subAccounts[0]?.companyName || 'Client A', details: 'Q1 Outreach', timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }
  ];
  
  res.json({
    totalEmailsSent,
    openRate,
    replyRate,
    activeSubAccounts,
    chartData,
    recentActivity
  });
});

// ============ SUB-ACCOUNTS ROUTES ============

app.get('/api/sub-accounts', requireAuth, async (req, res) => {
  const { status, search } = req.query;
  let subAccounts = data.subAccounts.filter(s => s.partnerId === req.partnerId);
  
  if (status && status !== 'all') {
    subAccounts = subAccounts.filter(s => s.status === status);
  }
  
  if (search) {
    const searchLower = search.toLowerCase();
    subAccounts = subAccounts.filter(s => s.companyName.toLowerCase().includes(searchLower));
  }
  
  // Calculate metrics for each
  const results = [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  for (const sub of subAccounts) {
    let emailsSentThisMonth = 0;
    let openRate = null;
    let replyRate = null;
    
    if (sub.instantlyApiKey) {
      // Real data
      try {
        const startDate = monthStart.toISOString().split('T')[0];
        const endDate = now.toISOString().split('T')[0];
        const analytics = await instantlyFetch(sub.instantlyApiKey, `/accounts/analytics/daily?start_date=${startDate}&end_date=${endDate}`);
        if (Array.isArray(analytics)) {
          emailsSentThisMonth = analytics.reduce((sum, d) => sum + (d.sent || 0), 0);
        }
        const summary = await instantlyFetch(sub.instantlyApiKey, `/analytics/campaign/summary?start_date=${startDate}&end_date=${endDate}`);
        if (summary && emailsSentThisMonth > 0) {
          openRate = parseFloat((((summary.total_opened || 0) / emailsSentThisMonth) * 100).toFixed(1));
          replyRate = parseFloat((((summary.total_replied || 0) / emailsSentThisMonth) * 100).toFixed(1));
        }
      } catch (e) {
        console.error('Instantly error:', e);
      }
    } else {
      // Mock data
      const mockMetrics = data.mockData.metrics[sub.id] || [];
      const monthMetrics = mockMetrics.filter(m => new Date(m.date) >= monthStart);
      emailsSentThisMonth = monthMetrics.reduce((sum, m) => sum + m.sent, 0);
      const opens = monthMetrics.reduce((sum, m) => sum + m.opens, 0);
      const replies = monthMetrics.reduce((sum, m) => sum + m.replies, 0);
      if (emailsSentThisMonth > 0) {
        openRate = parseFloat(((opens / emailsSentThisMonth) * 100).toFixed(1));
        replyRate = parseFloat(((replies / emailsSentThisMonth) * 100).toFixed(1));
      }
    }
    
    results.push({
      id: sub.id,
      companyName: sub.companyName,
      status: sub.status,
      emailsSentThisMonth,
      openRate,
      replyRate
    });
  }
  
  res.json({ subAccounts: results, total: results.length });
});

app.get('/api/sub-accounts/:id', requireAuth, async (req, res) => {
  const sub = data.subAccounts.find(s => s.id === req.params.id && s.partnerId === req.partnerId);
  if (!sub) return res.status(404).json({ error: 'Sub-account not found' });
  
  let stats = { emailsSent: 0, openRate: 0, replyRate: 0, bounceRate: 0 };
  let chartData = [];
  let campaigns = [];
  
  const now = new Date();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  if (sub.instantlyApiKey) {
    // Real data
    try {
      const startDate = ninetyDaysAgo.toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];
      
      const analytics = await instantlyFetch(sub.instantlyApiKey, `/accounts/analytics/daily?start_date=${startDate}&end_date=${endDate}`);
      if (Array.isArray(analytics)) {
        chartData = analytics.map(d => ({
          date: d.date,
          sent: d.sent || 0,
          opens: 0,
          replies: 0
        }));
        stats.emailsSent = analytics.reduce((sum, d) => sum + (d.sent || 0), 0);
      }
      
      const campaignsData = await instantlyFetch(sub.instantlyApiKey, '/campaigns?limit=50');
      if (campaignsData?.items) {
        for (const c of campaignsData.items.slice(0, 10)) {
          const cAnalytics = await instantlyFetch(sub.instantlyApiKey, `/campaigns/${c.id}/analytics`);
          campaigns.push({
            id: c.id,
            name: c.name,
            status: c.status || 'active',
            sent: cAnalytics?.total_sent || 0,
            opens: cAnalytics?.total_opened || 0,
            replies: cAnalytics?.total_replied || 0,
            startDate: c.created_at?.split('T')[0] || now.toISOString().split('T')[0]
          });
        }
      }
    } catch (e) {
      console.error('Instantly error:', e);
    }
  } else {
    // Mock data
    const mockMetrics = data.mockData.metrics[sub.id] || [];
    chartData = mockMetrics
      .filter(m => new Date(m.date) >= ninetyDaysAgo)
      .map(m => ({ date: m.date, sent: m.sent, opens: m.opens, replies: m.replies }));
    
    const totalSent = chartData.reduce((sum, d) => sum + d.sent, 0);
    const totalOpens = chartData.reduce((sum, d) => sum + d.opens, 0);
    const totalReplies = chartData.reduce((sum, d) => sum + d.replies, 0);
    const mockBounces = mockMetrics.filter(m => new Date(m.date) >= ninetyDaysAgo).reduce((sum, m) => sum + m.bounces, 0);
    
    stats = {
      emailsSent: totalSent,
      openRate: totalSent > 0 ? parseFloat(((totalOpens / totalSent) * 100).toFixed(1)) : 0,
      replyRate: totalSent > 0 ? parseFloat(((totalReplies / totalSent) * 100).toFixed(1)) : 0,
      bounceRate: totalSent > 0 ? parseFloat(((mockBounces / totalSent) * 100).toFixed(1)) : 0
    };
    
    campaigns = data.mockData.campaigns[sub.id] || [];
  }
  
  res.json({
    id: sub.id,
    companyName: sub.companyName,
    status: sub.status,
    stats,
    chartData,
    campaigns
  });
});

app.post('/api/sub-accounts', requireAuth, (req, res) => {
  const { companyName } = req.body;
  if (!companyName) return res.status(400).json({ error: 'Company name required' });
  
  const newSub = {
    id: 'sub_' + Date.now(),
    partnerId: req.partnerId,
    companyName,
    status: 'onboarding',
    instantlyApiKey: null,
    createdAt: new Date().toISOString()
  };
  
  data.subAccounts.push(newSub);
  data.mockData.metrics[newSub.id] = [];
  data.mockData.campaigns[newSub.id] = [];
  saveData(data);
  
  res.json(newSub);
});

// ============ REPORTS ROUTES ============

app.post('/api/reports/generate', requireAuth, async (req, res) => {
  const { reportType, dateRange, subAccountIds, format } = req.body;
  
  const reportId = 'rpt_' + Date.now();
  
  // In a real implementation, this would queue a background job
  // For now, we'll just return a mock "generating" status
  res.json({
    reportId,
    status: 'generating',
    estimatedTime: 30
  });
});

app.get('/api/reports/:id', requireAuth, (req, res) => {
  // Mock: always return ready
  res.json({
    reportId: req.params.id,
    status: 'ready',
    downloadUrl: `/api/reports/${req.params.id}/download`,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
});

app.get('/api/reports/:id/download', requireAuth, (req, res) => {
  // Mock: return a simple CSV
  const csv = 'Date,Emails Sent,Opens,Replies\n2026-02-01,500,260,45\n2026-02-02,520,275,48';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=report-${req.params.id}.csv`);
  res.send(csv);
});

app.post('/api/reports/schedule', requireAuth, (req, res) => {
  const { reportType, frequency, dayOfMonth, recipients, format } = req.body;
  
  const schedule = {
    id: 'sched_' + Date.now(),
    partnerId: req.partnerId,
    reportType,
    frequency,
    dayOfMonth,
    recipients,
    format,
    createdAt: new Date().toISOString()
  };
  
  data.scheduledReports.push(schedule);
  saveData(data);
  
  res.json({ success: true, schedule });
});

// ============ SETTINGS ROUTES ============

app.get('/api/settings', requireAuth, (req, res) => {
  const partner = data.partners.find(p => p.id === req.partnerId);
  if (!partner) return res.status(404).json({ error: 'Partner not found' });
  
  const teamMembers = data.partnerUsers
    .filter(u => u.partnerId === req.partnerId)
    .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  
  const apiData = data.apiKeys.find(k => k.partnerId === req.partnerId);
  
  res.json({
    profile: {
      companyName: partner.name,
      logoUrl: partner.logoUrl,
      contactEmail: partner.contactEmail,
      phone: partner.phone
    },
    notifications: partner.notifications,
    teamMembers,
    api: {
      apiKey: apiData?.apiKey || null,
      webhookUrl: apiData?.webhookUrl || null
    },
    whiteLabel: partner.whiteLabel
  });
});

app.patch('/api/settings', requireAuth, (req, res) => {
  const partner = data.partners.find(p => p.id === req.partnerId);
  if (!partner) return res.status(404).json({ error: 'Partner not found' });
  
  const { profile, notifications, whiteLabel } = req.body;
  
  if (profile) {
    if (profile.companyName) partner.name = profile.companyName;
    if (profile.contactEmail) partner.contactEmail = profile.contactEmail;
    if (profile.phone) partner.phone = profile.phone;
    if (profile.logoUrl !== undefined) partner.logoUrl = profile.logoUrl;
  }
  
  if (notifications) {
    partner.notifications = { ...partner.notifications, ...notifications };
  }
  
  if (whiteLabel) {
    partner.whiteLabel = { ...partner.whiteLabel, ...whiteLabel };
  }
  
  saveData(data);
  res.json({ success: true });
});

app.post('/api/settings/team/invite', requireAuth, (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  
  const newUser = {
    id: 'user_' + Date.now(),
    partnerId: req.partnerId,
    name: email.split('@')[0],
    email,
    role: role || 'viewer'
  };
  
  data.partnerUsers.push(newUser);
  saveData(data);
  
  res.json({ success: true, user: newUser });
});

app.delete('/api/settings/team/:userId', requireAuth, (req, res) => {
  const idx = data.partnerUsers.findIndex(u => u.id === req.params.userId && u.partnerId === req.partnerId);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  
  data.partnerUsers.splice(idx, 1);
  saveData(data);
  
  res.json({ success: true });
});

app.post('/api/settings/api/regenerate', requireAuth, (req, res) => {
  let apiData = data.apiKeys.find(k => k.partnerId === req.partnerId);
  
  const newKey = 'pk_live_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  if (apiData) {
    apiData.apiKey = newKey;
  } else {
    apiData = {
      id: 'key_' + Date.now(),
      partnerId: req.partnerId,
      apiKey: newKey,
      webhookUrl: null,
      createdAt: new Date().toISOString()
    };
    data.apiKeys.push(apiData);
  }
  
  saveData(data);
  res.json({ success: true, apiKey: newKey });
});

app.patch('/api/settings/api/webhook', requireAuth, (req, res) => {
  const { webhookUrl } = req.body;
  
  let apiData = data.apiKeys.find(k => k.partnerId === req.partnerId);
  if (apiData) {
    apiData.webhookUrl = webhookUrl;
  } else {
    apiData = {
      id: 'key_' + Date.now(),
      partnerId: req.partnerId,
      apiKey: 'pk_live_' + Math.random().toString(36).substring(2, 15),
      webhookUrl,
      createdAt: new Date().toISOString()
    };
    data.apiKeys.push(apiData);
  }
  
  saveData(data);
  res.json({ success: true });
});

// ============ SERVE FRONTEND ============

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Partner Portal running on port ${PORT}`);
});
