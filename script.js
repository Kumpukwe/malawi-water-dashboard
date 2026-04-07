const barCtx = document.getElementById("barChart").getContext("2d");
const doughnutCtx = document.getElementById("doughnutChart").getContext("2d");
const API_URL = 'https://malawi-water-dashboard.up.railway.app';

let barChart, doughnutChart, nationalChart, trendChart, map, markersLayer;
let nationalLoaded = false;
let currentOfficer = null;
let currentGpsLocation = null; // Add this for GPS

const COLORS = ["#16a34a", "#dc2626", "#2563eb", "#d97706", "#7c3aed", "#0891b2"];

const STATUS_COLORS = {
    "Functional": "#16a34a",
    "Not functional": "#dc2626",
    "Partially functional but in need of repair": "#d97706",
    "No longer exists or abandoned": "#6b7280"
};

const districtCoords = {
    nsanje: [-16.9167, 35.2667], chikwawa: [-16.0333, 34.8], blantyre: [-15.7861, 35.0058],
    chiradzulo: [-15.7, 35.1833], thyolo: [-16.0667, 35.1333], mulanje: [-16.0333, 35.5],
    phalombe: [-15.8, 35.6833], zomba: [-15.3833, 35.3333], machinga: [-14.9667, 35.5167],
    mangochi: [-14.4667, 35.25], balaka: [-14.9833, 34.95], ntcheu: [-14.8167, 34.6333],
    dedza: [-14.3333, 34.3333], salima: [-13.7833, 34.4333], lilongwe: [-13.9833, 33.7833],
    mchinji: [-13.8, 32.8833], dowa: [-13.65, 33.9333], ntchisi: [-13.2833, 33.9167],
    kasungu: [-13.0333, 33.4833], nkhotakota: [-12.9167, 34.3], nkhatabay: [-12.0, 34.2667],
    mzimba: [-11.9, 33.6], karonga: [-9.9333, 33.9333], chitipa: [-9.7, 33.2667], likoma: [-12.0667, 34.7337]
};

function getStatusColor(status) { return STATUS_COLORS[status] || "#2563eb"; }

// ============ GPS FUNCTIONS ============
function getCurrentLocation() {
    const gpsBtn = document.getElementById('getGpsButton');
    const gpsStatus = document.getElementById('gpsStatus');
    const gpsCoordinates = document.getElementById('gpsCoordinates');
    
    if (!navigator.geolocation) {
        showGpsStatus('error', '❌ Your browser does not support GPS. Please contact administrator.');
        return;
    }
    
    gpsBtn.disabled = true;
    gpsBtn.innerHTML = '<span class="spinner"></span> Getting location...';
    showGpsStatus('loading', '📍 Accessing GPS... Please allow location access.');
    
    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            currentGpsLocation = { lat, lng, accuracy };
            document.getElementById('entryLat').value = lat;
            document.getElementById('entryLng').value = lng;
            
            document.getElementById('gpsLat').textContent = lat.toFixed(6);
            document.getElementById('gpsLng').textContent = lng.toFixed(6);
            document.getElementById('gpsAccuracy').textContent = Math.round(accuracy);
            gpsCoordinates.style.display = 'block';
            
            let accuracyText = '';
            if (accuracy < 10) {
                accuracyText = 'Excellent accuracy! (±' + Math.round(accuracy) + 'm)';
            } else if (accuracy < 50) {
                accuracyText = 'Good accuracy (±' + Math.round(accuracy) + 'm)';
            } else {
                accuracyText = 'Low accuracy (±' + Math.round(accuracy) + 'm). Consider moving to open area.';
            }
            
            showGpsStatus('success', `✅ Location captured! ${accuracyText}`);
            
            gpsBtn.disabled = false;
            gpsBtn.innerHTML = '📍 Update GPS Location';
        },
        (error) => {
            let errorMessage = '';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = '❌ Location permission denied. Please enable location access.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = '❌ GPS signal unavailable. Please move to an open area.';
                    break;
                case error.TIMEOUT:
                    errorMessage = '⏱️ GPS timeout. Please try again.';
                    break;
                default:
                    errorMessage = '❌ Unable to get location. Please try again.';
            }
            
            showGpsStatus('error', errorMessage);
            gpsBtn.disabled = false;
            gpsBtn.innerHTML = '📍 Retry GPS Location';
        },
        options
    );
}

function showGpsStatus(type, message) {
    const gpsStatus = document.getElementById('gpsStatus');
    gpsStatus.className = `gps-status ${type}`;
    gpsStatus.textContent = message;
    gpsStatus.style.display = 'block';
    
    if (type !== 'loading') {
        setTimeout(() => {
            if (gpsStatus.className.includes(type)) {
                gpsStatus.style.opacity = '0';
                setTimeout(() => {
                    gpsStatus.style.display = 'none';
                    gpsStatus.style.opacity = '1';
                }, 500);
            }
        }, 5000);
    }
}

// ============ TAB SWITCHING ============
function switchMainTab(tab) {
    document.querySelectorAll(".main-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".main-content").forEach(c => c.classList.remove("active"));
    
    if (tab === 'district') {
        document.querySelectorAll(".main-tab")[0].classList.add("active");
        document.getElementById("districtMain").classList.add("active");
        switchSubTab('district', 'dashboard');
        if (map) setTimeout(() => map.invalidateSize(), 100);
    } else {
        document.querySelectorAll(".main-tab")[1].classList.add("active");
        document.getElementById("nationalMain").classList.add("active");
        switchSubTab('national', 'dashboard');
        if (!nationalLoaded) { loadNational(); nationalLoaded = true; }
    }
}

function switchSubTab(mainTab, subTab) {
    if (mainTab === 'district') {
        document.querySelectorAll("#districtMain .sub-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll("#districtMain .sub-content").forEach(c => c.classList.remove("active"));
        
        if (subTab === 'dashboard') {
            document.querySelectorAll("#districtMain .sub-tab")[0].classList.add("active");
            document.getElementById("districtDashboard").classList.add("active");
            if (map) setTimeout(() => map.invalidateSize(), 100);
        } else if (subTab === 'ta-alerts') {
            document.querySelectorAll("#districtMain .sub-tab")[1].classList.add("active");
            document.getElementById("districtTAAlerts").classList.add("active");
            loadTAAlerts();
        } else if (subTab === 'trends') {
            document.querySelectorAll("#districtMain .sub-tab")[2].classList.add("active");
            document.getElementById("districtTrends").classList.add("active");
            loadTrendData();
        }
    } else {
        document.querySelectorAll("#nationalMain .sub-tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll("#nationalMain .sub-content").forEach(c => c.classList.remove("active"));
        
        if (subTab === 'dashboard') {
            document.querySelectorAll("#nationalMain .sub-tab")[0].classList.add("active");
            document.getElementById("nationalDashboard").classList.add("active");
        } else {
            document.querySelectorAll("#nationalMain .sub-tab")[1].classList.add("active");
            document.getElementById("nationalDistrictAlerts").classList.add("active");
            loadDistrictAlerts();
        }
    }
}

// ============ TREND ANALYSIS FUNCTIONS ============
function loadTrendData() {
    const district = document.getElementById('tableSelect').value;
    const period = document.getElementById('trendPeriod').value;
    
    fetch(`${API_URL}/api/trends?district=${district}&period=${period}`)
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                displayTrendChart(data, district);
                calculateTrendMetrics(data);
                displayMonthlySummary(data);
            } else {
                document.getElementById('trendMetrics').innerHTML = '<div class="metric-card">No trend data available yet. Daily snapshots will be recorded.</div>';
                document.getElementById('monthlySummaryTable').innerHTML = '<div class="info">No historical data available</div>';
            }
        })
        .catch(err => {
            console.error('Trend data error:', err);
            document.getElementById('trendMetrics').innerHTML = '<div class="metric-card">Error loading trend data</div>';
        });
}

function displayTrendChart(data, district) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dates = data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
    const functionalRate = data.map(d => parseFloat(d.functional_rate) || 0);
    const functionalCount = data.map(d => d.functional_count || 0);
    const totalCount = data.map(d => d.total_count || 0);
    
    if (trendChart) trendChart.destroy();
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                { label: 'Functional Rate (%)', data: functionalRate, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', borderWidth: 3, tension: 0.4, fill: true, yAxisID: 'y', pointRadius: 4 },
                { label: 'Functional Points', data: functionalCount, borderColor: '#2563eb', borderWidth: 2, tension: 0.4, fill: false, yAxisID: 'y1', pointRadius: 3 },
                { label: 'Total Points', data: totalCount, borderColor: '#6b7280', borderWidth: 2, tension: 0.4, fill: false, yAxisID: 'y1', pointRadius: 3, borderDash: [5, 5] }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: true, text: `📈 Water Point Functionality Trends - ${district.toUpperCase()} District`, font: { size: 14, weight: 'bold' } },
                tooltip: { callbacks: { label: (ctx) => ctx.dataset.label.includes('Rate') ? `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%` : `${ctx.dataset.label}: ${ctx.raw.toLocaleString()}` } }
            },
            scales: {
                y: { beginAtZero: true, max: 100, title: { display: true, text: 'Functional Rate (%)' }, ticks: { callback: (v) => v + '%' } },
                y1: { position: 'right', title: { display: true, text: 'Number of Water Points' }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

function calculateTrendMetrics(data) {
    if (!data || data.length < 2) return;
    
    const firstRate = data[0].functional_rate;
    const lastRate = data[data.length - 1].functional_rate;
    const change = lastRate - firstRate;
    const trend = change > 0 ? 'improving' : change < 0 ? 'declining' : 'stable';
    
    const rates = data.map(d => d.functional_rate);
    const bestRate = Math.max(...rates);
    const worstRate = Math.min(...rates);
    const bestIndex = rates.indexOf(bestRate);
    const worstIndex = rates.indexOf(worstRate);
    const bestMonth = data[bestIndex].date;
    const worstMonth = data[worstIndex].date;
    
    const totalPoints = data[data.length - 1].total_count;
    const functionalPoints = data[data.length - 1].functional_count;
    
    document.getElementById('trendChange').innerHTML = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
    document.getElementById('trendDirection').innerHTML = trend.toUpperCase();
    document.getElementById('currentRate').innerHTML = `${lastRate.toFixed(1)}%`;
    document.getElementById('bestMonth').innerHTML = new Date(bestMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    document.getElementById('bestRate').innerHTML = `${bestRate.toFixed(1)}% functional`;
    document.getElementById('worstMonth').innerHTML = new Date(worstMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    document.getElementById('worstRate').innerHTML = `${worstRate.toFixed(1)}% functional`;
    
    const trendCard = document.querySelector('#trendMetrics .metric-card:first-child');
    trendCard.classList.add(trend);
    const trendValue = document.getElementById('trendChange');
    if (change > 0) trendValue.classList.add('positive');
    else if (change < 0) trendValue.classList.add('negative');
}

function displayMonthlySummary(data) {
    const summaryHTML = `
        <table class="summary-table">
            <thead><tr><th>Month</th><th>Avg. Functional Rate</th><th>Total Points</th><th>Functional</th><th>Partial</th><th>Not Functional</th></tr></thead>
            <tbody>
                ${data.slice(0,6).map(month => `
                    <tr>
                        <td>${month.month || new Date(month.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                        <td class="rate-cell ${month.functional_rate >= 70 ? 'good' : month.functional_rate >= 50 ? 'warning' : 'bad'}">${month.functional_rate?.toFixed(1) || '0'}%</td>
                        <td>${month.total_count?.toLocaleString() || '0'}</td>
                        <td>${month.functional_count?.toLocaleString() || '0'}</td>
                        <td>${month.partially_functional_count?.toLocaleString() || '0'}</td>
                        <td>${month.not_functional_count?.toLocaleString() || '0'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    document.getElementById('monthlySummaryTable').innerHTML = summaryHTML;
}

function exportTrendReport() {
    const district = document.getElementById('tableSelect').value;
    const period = document.getElementById('trendPeriod').value;
    
    fetch(`${API_URL}/api/trends?district=${district}&period=${period}`)
        .then(res => res.json())
        .then(data => {
            let report = `Malawi Water Points - Trend Report\n`;
            report += `District: ${district.toUpperCase()}\n`;
            report += `Period: ${period}\n`;
            report += `Generated: ${new Date().toLocaleString()}\n`;
            report += `${'='.repeat(50)}\n\n`;
            report += `Date,Functional Rate,Functional Points,Total Points\n`;
            data.forEach(d => {
                report += `${d.date},${d.functional_rate?.toFixed(1) || '0'}%,${d.functional_count || 0},${d.total_count || 0}\n`;
            });
            const blob = new Blob([report], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${district}_trend_report.csv`;
            a.click();
            URL.revokeObjectURL(url);
        });
}

// ============ ALERTS FUNCTIONS ============
function loadDistrictAlerts() {
    fetch(`${API_URL}/national`)
        .then(res => res.json())
        .then(districts => {
            const alerts = [];
            districts.forEach(district => {
                const total = Number(district.total);
                const functional = Number(district.functional);
                const rate = total > 0 ? (functional / total) * 100 : 100;
                alerts.push({ district: district.district, total, functional, rate, level: rate < 50 ? 'critical' : (rate < 65 ? 'warning' : 'success') });
            });
            alerts.sort((a, b) => a.rate - b.rate);
            displayDistrictAlerts(alerts);
        })
        .catch(err => console.error(err));
}

function displayDistrictAlerts(alerts) {
    const container = document.getElementById('districtAlertsList');
    if (!container) return;
    if (alerts.length === 0) { container.innerHTML = '<div class="info">No district data available</div>'; return; }
    container.innerHTML = alerts.map(alert => `
        <div class="alert-card ${alert.level}" onclick="goToDistrict('${alert.district}')">
            <div class="alert-info"><div class="alert-title ${alert.level}">${alert.district.toUpperCase()}</div><div class="alert-stats">Total: ${alert.total.toLocaleString()} | Functional: ${alert.functional.toLocaleString()}</div></div>
            <div class="alert-rate ${alert.level}">${alert.rate.toFixed(1)}%</div>
        </div>
    `).join('');
}

function loadTAAlerts() {
    const district = document.getElementById('tableSelect').value;
    document.getElementById('selectedDistrictName').textContent = district.charAt(0).toUpperCase() + district.slice(1);
    const container = document.getElementById('taAlertsList');
    if (!container) return;
    container.innerHTML = '<div class="loading">Loading TA alerts...</div>';
    
    fetch(`${API_URL}/districts?table=${district}`)
        .then(res => res.json())
        .then(tas => {
            if (!tas || tas.length === 0) { container.innerHTML = '<div class="info">No Traditional Authorities found</div>'; return; }
            const alerts = []; let completed = 0;
            tas.forEach(ta => {
                fetch(`${API_URL}/data?table=${district}&district=${encodeURIComponent(ta)}`)
                    .then(res => res.json())
                    .then(data => {
                        const total = data.reduce((sum, d) => sum + Number(d.total), 0);
                        const functional = data.find(d => d.status === 'Functional')?.total || 0;
                        const rate = total > 0 ? (functional / total) * 100 : 100;
                        alerts.push({ ta, total, functional, rate, level: rate < 50 ? 'critical' : (rate < 65 ? 'warning' : 'success') });
                        completed++;
                        if (completed === tas.length) { alerts.sort((a, b) => a.rate - b.rate); displayTAAlerts(alerts, district); }
                    });
            });
        })
        .catch(err => { container.innerHTML = '<div class="error">Error loading TA data</div>'; });
}

function displayTAAlerts(alerts, district) {
    const container = document.getElementById('taAlertsList');
    if (!container) return;
    if (alerts.length === 0) { container.innerHTML = '<div class="info">No TA data available</div>'; return; }
    container.innerHTML = alerts.map(alert => `
        <div class="alert-card ${alert.level}" onclick="filterByTA('${district}', '${alert.ta}')">
            <div class="alert-info"><div class="alert-title ${alert.level}">${alert.ta}</div><div class="alert-stats">Total: ${alert.total.toLocaleString()} | Functional: ${alert.functional.toLocaleString()}</div></div>
            <div class="alert-rate ${alert.level}">${alert.rate.toFixed(1)}%</div>
        </div>
    `).join('');
}

function goToDistrict(district) {
    switchMainTab('district');
    const select = document.getElementById('tableSelect');
    if (select) { select.value = district.toLowerCase(); select.dispatchEvent(new Event('change')); }
    setTimeout(() => { switchSubTab('district', 'dashboard'); }, 100);
    document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' });
}

function filterByTA(district, ta) {
    switchMainTab('district');
    const districtSelect = document.getElementById('tableSelect');
    if (districtSelect) { districtSelect.value = district.toLowerCase(); districtSelect.dispatchEvent(new Event('change')); }
    setTimeout(() => {
        const taSelect = document.getElementById('districtSelect');
        if (taSelect) { taSelect.value = ta; taSelect.dispatchEvent(new Event('change')); }
        switchSubTab('district', 'dashboard');
    }, 500);
    document.getElementById('map')?.scrollIntoView({ behavior: 'smooth' });
}

// ============ MAP FUNCTIONS ============
function initMap() {
    if (typeof L === 'undefined') { console.error("Leaflet not loaded"); return; }
    map = L.map("map").setView([-13.5, 34.0], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
}

function loadMap(table = "nsanje", TA = "", type = "") {
    let url = `${API_URL}/mapdata?table=${table}`;
    if (TA) url += `&district=${TA}`;
    if (type) url += `&type=${type}`;
    fetch(url).then(res => res.json()).then(points => {
        if (!markersLayer) initMap();
        markersLayer.clearLayers();
        const validPoints = points.filter(p => parseFloat(p.Latitude) && parseFloat(p.Longitude));
        if (validPoints.length === 0) return;
        const bounds = [];
        validPoints.forEach(p => {
            const lat = parseFloat(p.Latitude), lng = parseFloat(p.Longitude);
            const marker = L.circleMarker([lat, lng], { radius: 6, fillColor: getStatusColor(p.status), color: "#fff", weight: 1, fillOpacity: 0.85 });
            marker.bindPopup(`<strong>${p.Name || "Unknown"}</strong><br>Status: ${p.status || "N/A"}`);
            marker.addTo(markersLayer);
            bounds.push([lat, lng]);
        });
        if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
    }).catch(err => console.error("Map error:", err));
}

// ============ DATA FUNCTIONS ============
function renderCards(data) {
    const total = data.reduce((sum, d) => sum + Number(d.total), 0);
    let functional = 0, partial = 0, notFunctional = 0, abandoned = 0;
    data.forEach(item => {
        const status = item.status, count = Number(item.total);
        if (status === "Functional") functional += count;
        else if (status === "Partially functional but in need of repair") partial += count;
        else if (status === "Not functional") notFunctional += count;
        else if (status === "No longer exists or abandoned") abandoned += count;
    });
    const pct = (val) => total > 0 ? ((val / total) * 100).toFixed(1) + "%" : "0%";
    document.getElementById("cardTotal").textContent = total.toLocaleString();
    document.getElementById("cardFunctional").textContent = functional.toLocaleString();
    document.getElementById("cardFunctionalPct").textContent = pct(functional);
    document.getElementById("cardPartial").textContent = partial.toLocaleString();
    document.getElementById("cardPartialPct").textContent = pct(partial);
    document.getElementById("cardNotFunctional").textContent = notFunctional.toLocaleString();
    document.getElementById("cardNotFunctionalPct").textContent = pct(notFunctional);
    document.getElementById("cardAbandoned").textContent = abandoned.toLocaleString();
    document.getElementById("cardAbandonedPct").textContent = pct(abandoned);
}

function fetchData(table = "nsanje", TA = "", type = "") {
    let url = `${API_URL}/data?table=${table}`;
    if (TA) url += `&district=${TA}`;
    if (type) url += `&type=${type}`;
    fetch(url).then(res => res.json()).then(data => {
        renderCards(data);
        data = data.filter(d => d.status && d.status !== "");
        if (data.length === 0) return;
        const labels = data.map(d => d.status);
        const counts = data.map(d => Number(d.total));
        const colors = labels.map((_, i) => COLORS[i % COLORS.length]);
        const totalCount = counts.reduce((a, b) => a + b, 0);
        let title = table.charAt(0).toUpperCase() + table.slice(1);
        if (TA) title += ` — ${TA}`;
        if (type) title += ` — ${type}`;
        
        if (barChart) barChart.destroy();
        barChart = new Chart(barCtx, { type: "bar", data: { labels, datasets: [{ label: title, data: counts, backgroundColor: colors }] },
            options: { responsive: true, plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} (${((ctx.raw / totalCount) * 100).toFixed(1)}%)` } } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Number of Water Points' } } } } });
        
        if (doughnutChart) doughnutChart.destroy();
        doughnutChart = new Chart(doughnutCtx, { type: "doughnut", data: { labels, datasets: [{ data: counts, backgroundColor: colors }] },
            options: { responsive: true, plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw.toLocaleString()} (${((ctx.raw / totalCount) * 100).toFixed(1)}%)` } } } } });
        
        renderTable(data, title);
    }).catch(err => console.error(err));
}

function renderTable(data, title) {
    const total = data.reduce((sum, d) => sum + Number(d.total), 0);
    document.getElementById("tableContainer").innerHTML = `
        <h2>Summary — ${title}</h2><button class="export-btn" onclick="exportCSV('district')">📥 Export to CSV</button>
        <div style="overflow-x:auto"><table><thead><tr><th>Status</th><th>Count</th><th>Percentage</th></tr></thead>
        <tbody>${data.map((d, i) => `<tr><td><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>${d.status}</td>
        <td>${Number(d.total).toLocaleString()}</td><td>${((Number(d.total) / total) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td><strong>${total.toLocaleString()}</strong></td><td><strong>100%</strong></td></tr></tfoot>
        </div>`;
}

function loadNational() {
    fetch(`${API_URL}/national`).then(res => res.json()).then(data => {
        const districts = data.map(d => d.district.charAt(0).toUpperCase() + d.district.slice(1));
        const totals = data.map(d => Number(d.total));
        const functional = data.map(d => Number(d.functional));
        const partial = data.map(d => Number(d.partial));
        const notFunctional = data.map(d => Number(d.not_functional));
        const abandoned = data.map(d => Number(d.abandoned));
        const grandTotal = totals.reduce((a,b)=>a+b,0);
        const grandFunctional = functional.reduce((a,b)=>a+b,0);
        const pct = (val) => grandTotal > 0 ? ((val/grandTotal)*100).toFixed(1)+"%" : "0%";
        document.getElementById("natCardTotal").textContent = grandTotal.toLocaleString();
        document.getElementById("natCardFunctional").textContent = grandFunctional.toLocaleString();
        document.getElementById("natCardFunctionalPct").textContent = pct(grandFunctional);
        document.getElementById("natCardPartial").textContent = partial.reduce((a,b)=>a+b,0).toLocaleString();
        document.getElementById("natCardPartialPct").textContent = pct(partial.reduce((a,b)=>a+b,0));
        document.getElementById("natCardNotFunctional").textContent = notFunctional.reduce((a,b)=>a+b,0).toLocaleString();
        document.getElementById("natCardNotFunctionalPct").textContent = pct(notFunctional.reduce((a,b)=>a+b,0));
        document.getElementById("natCardAbandoned").textContent = abandoned.reduce((a,b)=>a+b,0).toLocaleString();
        document.getElementById("natCardAbandonedPct").textContent = pct(abandoned.reduce((a,b)=>a+b,0));
        
        if (nationalChart) nationalChart.destroy();
        nationalChart = new Chart(document.getElementById("nationalChart").getContext("2d"), {
            type: "bar", data: { labels: districts, datasets: [
                { label: "Functional", data: functional, backgroundColor: "#16a34a" },
                { label: "Partially Functional", data: partial, backgroundColor: "#d97706" },
                { label: "Not Functional", data: notFunctional, backgroundColor: "#dc2626" },
                { label: "Abandoned", data: abandoned, backgroundColor: "#6b7280" }
            ] }, options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true } } }
        });
        
        document.getElementById("nationalTableContainer").innerHTML = `<h2>District Summary</h2><button class="export-btn" onclick="exportCSV('national')">📥 Export CSV</button>
        <div style="overflow-x:auto"><table><thead><tr><th>District</th><th>Total</th><th>Functional</th><th>Partial</th><th>Not Functional</th><th>Abandoned</th><th>% Functional</th></tr></thead>
        <tbody>${data.map(d => `<tr><td>${d.district.charAt(0).toUpperCase()+d.district.slice(1)}</td>
        <td>${Number(d.total).toLocaleString()}</td><td>${Number(d.functional).toLocaleString()}</td>
        <td>${Number(d.partial).toLocaleString()}</td><td>${Number(d.not_functional).toLocaleString()}</td>
        <td>${Number(d.abandoned).toLocaleString()}</td>
        <td>${Number(d.total)>0?((Number(d.functional)/Number(d.total))*100).toFixed(1)+"%":"0%"}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><strong>Total</strong></td><td><strong>${grandTotal.toLocaleString()}</strong></td>
        <td><strong>${grandFunctional.toLocaleString()}</strong></td><td colspan="4"></td></tr></tfoot></div>`;
    });
}

function loadDistricts(table) {
    fetch(`${API_URL}/districts?table=${table}`).then(res => res.json()).then(districts => {
        const select = document.getElementById("districtSelect");
        select.innerHTML = '<option value="">All Traditional Authorities</option>';
        if (Array.isArray(districts)) districts.forEach(d => { if(d) { let opt = document.createElement("option"); opt.value = d; opt.textContent = d; select.appendChild(opt); } });
    }).catch(err => console.error(err));
}

function loadTypes(table) {
    fetch(`${API_URL}/types?table=${table}`).then(res => res.json()).then(types => {
        const select = document.getElementById("typeSelect");
        select.innerHTML = '<option value="">All Types</option>';
        if (Array.isArray(types)) types.forEach(t => { if(t) { let opt = document.createElement("option"); opt.value = t; opt.textContent = t; select.appendChild(opt); } });
    }).catch(err => console.error(err));
}

function getFilters() {
    const table = document.getElementById("tableSelect").value;
    const TA = document.getElementById("districtSelect").value;
    const type = document.getElementById("typeSelect").value;
    fetchData(table, TA, type);
    loadMap(table, TA, type);
}

document.getElementById("tableSelect").addEventListener("change", function() {
    const table = this.value;
    loadDistricts(table);
    loadTypes(table);
    fetchData(table);
    loadMap(table);
    if (document.getElementById("districtTAAlerts").classList.contains("active")) loadTAAlerts();
    if (document.getElementById("districtTrends").classList.contains("active")) loadTrendData();
});
document.getElementById("districtSelect").addEventListener("change", getFilters);
document.getElementById("typeSelect").addEventListener("change", getFilters);

function exportCSV(type) {
    let rows = [], filename = "";
    if (type === "district") {
        filename = `${document.getElementById("tableSelect").value}_water_points.csv`;
        rows.push(["Status","Count","Percentage"]);
        document.querySelectorAll("#tableContainer tbody tr").forEach(row => {
            const cells = row.querySelectorAll("td");
            rows.push([cells[0].textContent.trim(), cells[1].textContent.trim(), cells[2].textContent.trim()]);
        });
    } else {
        filename = "malawi_national_water_points.csv";
        rows.push(["District","Total","Functional","Partial","Not Functional","Abandoned","% Functional"]);
        document.querySelectorAll("#nationalTableContainer tbody tr").forEach(row => {
            const cells = row.querySelectorAll("td");
            rows.push([cells[0].textContent.trim(), cells[1].textContent.trim(), cells[2].textContent.trim(), cells[3].textContent.trim(), cells[4].textContent.trim(), cells[5].textContent.trim(), cells[6].textContent.trim()]);
        });
    }
    const csvContent = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ============ AUTH ============
function showOfficerLogin() { document.getElementById('officerLoginModal').style.display = 'flex'; }
function closeOfficerLogin() { document.getElementById('officerLoginModal').style.display = 'none'; }

function openDataEntryModal() {
    if(!currentOfficer) { showOfficerLogin(); return; }
    document.getElementById('dataEntryModal').style.display = 'flex';
    document.getElementById('dataEntryForm').reset();
    document.getElementById('gpsCoordinates').style.display = 'none';
    document.getElementById('gpsStatus').innerHTML = '';
    currentGpsLocation = null;
    if(currentOfficer.district) { 
        document.getElementById('entryDistrict').value = currentOfficer.district;
        document.getElementById('entryDistrict').disabled = true;
    }
}

function closeDataEntryModal() { document.getElementById('dataEntryModal').style.display = 'none'; }

function showToast(msg, type) { 
    const toast = document.createElement('div'); 
    toast.textContent = msg; 
    toast.style.cssText = `position:fixed;bottom:100px;right:30px;background:${type==='success'?'#2a5a3a':'#dc2626'};color:white;padding:12px 24px;border-radius:8px;z-index:2000`; 
    document.body.appendChild(toast); 
    setTimeout(()=>toast.remove(),3000); 
}

function showMessage(msg, type) { 
    const div = document.getElementById('entryMessage'); 
    div.innerHTML = `<div style="padding:10px;background:${type==='success'?'#d1fae5':'#fee2e2'};color:${type==='success'?'#065f46':'#991b1b'}">${msg}</div>`; 
    setTimeout(()=>div.innerHTML='',3000); 
}

function updateOfficerBar() { 
    if(currentOfficer) { 
        document.getElementById('officerBar').style.display = 'block'; 
        document.getElementById('officerName').textContent = currentOfficer.full_name || currentOfficer.username; 
        const badge = document.getElementById('officerDistrict'); 
        if(currentOfficer.district) badge.textContent = `${currentOfficer.district.toUpperCase()} District Water Officer`; 
        else if(currentOfficer.role === 'admin') badge.textContent = 'System Administrator'; 
        else badge.textContent = 'District Water Officer'; 
        document.getElementById('dataEntryButton').style.display = 'block'; 
    } else { 
        document.getElementById('officerBar').style.display = 'none'; 
        document.getElementById('dataEntryButton').style.display = 'none'; 
    } 
}

function checkOfficerSession() { 
    fetch(`${API_URL}/api/me`, { credentials: 'include' }).then(res => res.status === 401 ? null : res.json()).then(user => { 
        if(user) { currentOfficer = user; updateOfficerBar(); } 
    }).catch(()=>{}); 
}

function logout() { 
    fetch(`${API_URL}/api/logout`, { method: 'POST', credentials: 'include' }).then(() => { 
        currentOfficer = null; updateOfficerBar(); showToast('Logged out', 'info'); 
    }); 
}

document.getElementById('officerLoginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    fetch(`${API_URL}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: document.getElementById('officerUsername').value, password: document.getElementById('officerPassword').value }),
        credentials: 'include'
    }).then(res => res.json()).then(data => {
        if(data.success) { currentOfficer = data.user; closeOfficerLogin(); updateOfficerBar(); showToast(`Welcome ${currentOfficer.full_name || currentOfficer.username}!`, 'success'); }
        else { document.getElementById('officerLoginError').textContent = data.error; }
    }).catch(() => { document.getElementById('officerLoginError').textContent = 'Login failed'; });
});

// UPDATED FORM SUBMISSION WITH GPS VALIDATION
document.getElementById('dataEntryForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const lat = document.getElementById('entryLat').value;
    const lng = document.getElementById('entryLng').value;
    
    if (!lat || !lng) {
        showMessage('❌ Please capture GPS location using the GPS button before submitting', 'error');
        return;
    }
    
    const data = { 
        district: document.getElementById('entryDistrict').value, 
        name: document.getElementById('entryName').value, 
        ta: document.getElementById('entryTA').value, 
        type: document.getElementById('entryType').value, 
        status: document.getElementById('entryStatus').value, 
        latitude: lat, 
        longitude: lng, 
        officer_name: document.getElementById('entryOfficer').value || currentOfficer?.username, 
        notes: document.getElementById('entryNotes').value,
        gps_accuracy: currentGpsLocation?.accuracy || null
    };
    
    if(!data.district || !data.name || !data.ta || !data.type || !data.status) { 
        showMessage('Please fill all required fields', 'error'); 
        return; 
    }
    
    fetch(`${API_URL}/api/add-water-point`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(data), 
        credentials: 'include'
    })
    .then(res => res.json())
    .then(result => { 
        if(result.success) { 
            showMessage('✅ Water point added successfully with GPS coordinates!', 'success'); 
            setTimeout(()=>{ 
                closeDataEntryModal(); 
                if(document.getElementById('tableSelect')?.value === data.district) 
                    fetchData(data.district); 
            },1500); 
        } else { 
            showMessage(result.error || 'Error', 'error'); 
        } 
    })
    .catch(() => { 
        showMessage('Network error', 'error'); 
    });
});

if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').then(()=>console.log('SW registered')).catch(err=>console.log('SW failed:', err)); }

const initialTable = document.getElementById("tableSelect").value;
initMap();
checkOfficerSession();
loadDistricts(initialTable);
loadTypes(initialTable);
fetchData(initialTable);
loadMap(initialTable);