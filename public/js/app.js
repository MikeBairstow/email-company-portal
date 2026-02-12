// Email Company Portal - Client App

let sendsChart = null;
let analyticsChart = null;
let currentSubAccount = null; // null = all sub-accounts
let subAccounts = [];

// Check auth on load
document.addEventListener('DOMContentLoaded', async () => {
  const isLoggedIn = await checkAuth();
  if (isLoggedIn) {
    showApp();
    await loadSubAccounts();
    loadDashboard();
  } else {
    showLogin();
  }
  
  setupEventListeners();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const user = await res.json();
      document.getElementById('user-name').textContent = user.company_name;
      document.getElementById('user-initials').textContent = getInitials(user.company_name);
      subAccounts = user.subAccounts || [];
      return true;
    }
  } catch (e) {}
  return false;
}

async function loadSubAccounts() {
  try {
    const res = await fetch('/api/sub-accounts');
    if (res.ok) {
      subAccounts = await res.json();
      updateSubAccountSelector();
    }
  } catch (e) {}
}

function updateSubAccountSelector() {
  const selector = document.getElementById('sub-account-select');
  if (!selector) return;
  
  selector.innerHTML = '<option value="">All Sub-Accounts</option>';
  subAccounts.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name + (s.hasInstantly ? ' 🟢' : '');
    selector.appendChild(opt);
  });
}

function getSubAccountParam() {
  return currentSubAccount ? `subAccountId=${currentSubAccount}` : '';
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
}

function setupEventListeners() {
  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (res.ok) {
      const data = await res.json();
      document.getElementById('user-name').textContent = data.company;
      document.getElementById('user-initials').textContent = getInitials(data.company);
      showApp();
      loadDashboard();
    } else {
      alert('Invalid credentials');
    }
  });
  
  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    showLogin();
  });
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      
      // Update active nav
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      // Show page
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
      
      // Load page data
      if (page === 'dashboard') loadDashboard();
      if (page === 'analytics') loadAnalytics();
      if (page === 'campaigns') loadCampaigns();
      if (page === 'reports') loadReports();
      if (page === 'settings') loadSettings();
    });
  });
  
  // Campaign filters
  document.querySelectorAll('.filter-pills .pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      loadCampaigns(pill.dataset.filter);
    });
  });
  
  // Settings form
  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const company_name = document.getElementById('settings-name').value;
    
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_name })
    });
    
    document.getElementById('user-name').textContent = company_name;
    document.getElementById('user-initials').textContent = getInitials(company_name);
    alert('Settings saved!');
  });
  
  // Analytics range
  document.getElementById('analytics-range').addEventListener('change', loadAnalytics);
  
  // Template cards
  document.querySelectorAll('.template-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
  });
}

async function loadDashboard() {
  try {
    const param = getSubAccountParam();
    const [dashRes, dailyRes, campaignsRes] = await Promise.all([
      fetch(`/api/dashboard?${param}`),
      fetch(`/api/analytics/daily?days=30&${param}`),
      fetch(`/api/analytics/campaigns?${param}`)
    ]);
    
    const dashboard = await dashRes.json();
    const daily = await dailyRes.json();
    const campaigns = await campaignsRes.json();
    
    // Update stats
    document.getElementById('stat-sent').textContent = formatNumber(dashboard.totalSent);
    document.getElementById('stat-open').textContent = dashboard.openRate + '%';
    document.getElementById('stat-reply').textContent = dashboard.replyRate + '%';
    document.getElementById('stat-bounce').textContent = dashboard.bounceRate + '%';
    
    // Render sends chart
    renderSendsChart(daily);
    
    // Render campaign rates
    renderCampaignRates(campaigns);
  } catch (e) {
    console.error('Dashboard load error:', e);
  }
}

function renderSendsChart(data) {
  const ctx = document.getElementById('sends-chart').getContext('2d');
  
  if (sendsChart) sendsChart.destroy();
  
  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
  
  sendsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Emails Sent',
        data: data.map(d => d.emails_sent),
        borderColor: '#8B5CF6',
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#8B5CF6',
        pointHoverBorderColor: 'white',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2937',
          titleFont: { size: 13 },
          bodyFont: { size: 12 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => `${formatNumber(ctx.raw)} emails sent`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 11 } }
        },
        y: {
          grid: { color: '#f3f4f6' },
          ticks: {
            color: '#9ca3af',
            font: { size: 11 },
            callback: (v) => formatNumber(v)
          }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  });
}

function renderCampaignRates(campaigns) {
  const container = document.getElementById('campaign-rates');
  const colors = ['green', 'blue', 'purple', 'yellow', 'red'];
  
  container.innerHTML = campaigns.slice(0, 5).map((c, i) => `
    <div class="rate-item">
      <div class="rate-header">
        <span class="rate-name">${c.name}</span>
        <span class="rate-value">${c.open_rate}%</span>
      </div>
      <div class="rate-bar">
        <div class="rate-fill ${colors[i % colors.length]}" style="width: ${c.open_rate}%"></div>
      </div>
    </div>
  `).join('');
}

async function loadAnalytics() {
  const days = document.getElementById('analytics-range').value;
  const param = getSubAccountParam();
  
  try {
    const res = await fetch(`/api/analytics/daily?days=${days}&${param}`);
    const data = await res.json();
    
    // Calculate totals
    const totals = data.reduce((acc, d) => ({
      sent: acc.sent + d.emails_sent,
      opens: acc.opens + d.opens,
      replies: acc.replies + d.replies
    }), { sent: 0, opens: 0, replies: 0 });
    
    document.getElementById('analytics-sent').textContent = formatNumber(totals.sent);
    document.getElementById('analytics-opens').textContent = formatNumber(totals.opens);
    document.getElementById('analytics-replies').textContent = formatNumber(totals.replies);
    
    renderAnalyticsChart(data);
  } catch (e) {
    console.error('Analytics load error:', e);
  }
}

function renderAnalyticsChart(data) {
  const ctx = document.getElementById('analytics-chart').getContext('2d');
  
  if (analyticsChart) analyticsChart.destroy();
  
  const labels = data.map(d => {
    const date = new Date(d.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  
  analyticsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Sent',
          data: data.map(d => d.emails_sent),
          backgroundColor: '#8B5CF6',
          borderRadius: 4
        },
        {
          label: 'Opens',
          data: data.map(d => d.opens),
          backgroundColor: '#22c55e',
          borderRadius: 4
        },
        {
          label: 'Replies',
          data: data.map(d => d.replies),
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 20
          }
        },
        tooltip: {
          backgroundColor: '#1f2937',
          padding: 12,
          cornerRadius: 8
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#9ca3af', font: { size: 11 } }
        },
        y: {
          grid: { color: '#f3f4f6' },
          ticks: {
            color: '#9ca3af',
            font: { size: 11 },
            callback: (v) => formatNumber(v)
          }
        }
      }
    }
  });
}

async function loadCampaigns(filter = 'all') {
  try {
    const param = getSubAccountParam();
    const res = await fetch(`/api/campaigns?${param}`);
    let campaigns = await res.json();
    
    if (filter !== 'all') {
      campaigns = campaigns.filter(c => c.status === filter);
    }
    
    const tbody = document.getElementById('campaigns-table-body');
    tbody.innerHTML = campaigns.map(c => {
      const performance = c.open_rate > 40 ? 'up' : c.open_rate < 30 ? 'down' : 'flat';
      const perfIcon = performance === 'up' ? '↗' : performance === 'down' ? '↘' : '→';
      
      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 32px; height: 32px; background: #f3e8ff; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                📧
              </div>
              <div>
                <div>${c.name}</div>
                ${c.subAccount ? `<div style="font-size: 12px; color: #9ca3af;">${c.subAccount}</div>` : ''}
              </div>
            </div>
          </td>
          <td><span class="status-badge ${c.status}">${c.status}</span></td>
          <td>${c.inboxes}</td>
          <td>${c.daily_sends}/${c.daily_limit}</td>
          <td>
            ${c.open_rate}%
            <div class="rate-bar-mini">
              <div style="width: ${c.open_rate}%; height: 100%; background: ${c.open_rate > 40 ? '#22c55e' : c.open_rate > 30 ? '#eab308' : '#ef4444'}; border-radius: 3px;"></div>
            </div>
          </td>
          <td>${c.reply_rate}%</td>
          <td>
            <span class="performance-trend ${performance}">
              ${perfIcon}
            </span>
          </td>
          <td>
            <button class="btn-icon" onclick="toggleCampaign(${c.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="19" cy="12" r="1"/>
                <circle cx="5" cy="12" r="1"/>
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('Campaigns load error:', e);
  }
}

async function toggleCampaign(id) {
  try {
    const res = await fetch(`/api/campaigns/${id}/toggle`, { method: 'POST' });
    if (res.ok) {
      loadCampaigns(document.querySelector('.filter-pills .pill.active').dataset.filter);
    }
  } catch (e) {
    console.error('Toggle error:', e);
  }
}

async function loadReports() {
  try {
    const res = await fetch('/api/reports');
    const reports = await res.json();
    
    const container = document.getElementById('reports-list');
    container.innerHTML = reports.map(r => `
      <div class="report-row">
        <div class="report-info">
          <div class="report-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <div class="report-name">${r.name}</div>
            <div class="report-date">${new Date(r.created_at).toLocaleDateString()}</div>
          </div>
        </div>
        <button class="btn-secondary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download
        </button>
      </div>
    `).join('');
  } catch (e) {
    console.error('Reports load error:', e);
  }
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const settings = await res.json();
    
    document.getElementById('settings-name').value = settings.company_name;
    document.getElementById('settings-email').value = settings.email;
    document.getElementById('logo-preview').innerHTML = `<span>${getInitials(settings.company_name)}</span>`;
  } catch (e) {
    console.error('Settings load error:', e);
  }
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}
