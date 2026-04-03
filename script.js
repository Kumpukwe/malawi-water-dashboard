const barCtx = document.getElementById("barChart").getContext("2d");
const doughnutCtx = document.getElementById("doughnutChart").getContext("2d");
// API Configuration
const API_URL = 'https://malawi-water-dashboard.up.railway.app';

let barChart;
let doughnutChart;
let nationalChart;
let map;
let markersLayer;
let nationalLoaded = false;
let currentOfficer = null;

const COLORS = ["#16a34a", "#dc2626", "#2563eb", "#d97706", "#7c3aed", "#0891b2"];

const STATUS_COLORS = {
    "Functional": "#16a34a",
    "Not functional": "#dc2626",
    "Partially functional but in need of repair": "#d97706",
    "No longer exists or abandoned": "#6b7280"
};

// District coordinates (approximate centers for fallback)
const districtCoords = {
    nsanje: [-16.9167, 35.2667],
    chikwawa: [-16.0333, 34.8],
    blantyre: [-15.7861, 35.0058],
    chiradzulo: [-15.7, 35.1833],
    thyolo: [-16.0667, 35.1333],
    mulanje: [-16.0333, 35.5],
    phalombe: [-15.8, 35.6833],
    zomba: [-15.3833, 35.3333],
    machinga: [-14.9667, 35.5167],
    mangochi: [-14.4667, 35.25],
    balaka: [-14.9833, 34.95],
    ntcheu: [-14.8167, 34.6333],
    dedza: [-14.3333, 34.3333],
    salima: [-13.7833, 34.4333],
    lilongwe: [-13.9833, 33.7833],
    mchinji: [-13.8, 32.8833],
    dowa: [-13.65, 33.9333],
    ntchisi: [-13.2833, 33.9167],
    kasungu: [-13.0333, 33.4833],
    nkhotakota: [-12.9167, 34.3],
    nkhatabay: [-12.0, 34.2667],
    mzimba: [-11.9, 33.6],
    karonga: [-9.9333, 33.9333],
    chitipa: [-9.7, 33.2667],
    likoma: [-12.0667, 34.7333]
};

function getStatusColor(status) {
    return STATUS_COLORS[status] || "#2563eb";
}

function switchTab(tab) {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));

    if (tab === "district") {
        document.querySelectorAll(".tab")[0].classList.add("active");
        document.getElementById("districtTab").classList.add("active");
        // Check district alerts when switching to district tab
        setTimeout(() => {
            checkDistrictAlerts();
        }, 500);
    } else {
        document.querySelectorAll(".tab")[1].classList.add("active");
        document.getElementById("nationalTab").classList.add("active");
        if (!nationalLoaded) {
            loadNational();
            nationalLoaded = true;
        }
    }
}

function loadNational() {
    const nationalCtx = document.getElementById("nationalChart").getContext("2d");
    fetch(`${API_URL}/national`)
        .then(res => res.json())
        .then(data => {
            console.log("National data received:", data.length, "districts");
            
            const districts = data.map(d => d.district.charAt(0).toUpperCase() + d.district.slice(1));
            const totals = data.map(d => Number(d.total));
            const functional = data.map(d => Number(d.functional));
            const partial = data.map(d => Number(d.partial));
            const notFunctional = data.map(d => Number(d.not_functional));
            const abandoned = data.map(d => Number(d.abandoned));

            const grandTotal = totals.reduce((a, b) => a + b, 0);
            const grandFunctional = functional.reduce((a, b) => a + b, 0);
            const grandPartial = partial.reduce((a, b) => a + b, 0);
            const grandNotFunctional = notFunctional.reduce((a, b) => a + b, 0);
            const grandAbandoned = abandoned.reduce((a, b) => a + b, 0);

            const pct = (val) => grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) + "%" : "0%";

            document.getElementById("natCardTotal").textContent = grandTotal.toLocaleString();
            document.getElementById("natCardFunctional").textContent = grandFunctional.toLocaleString();
            document.getElementById("natCardFunctionalPct").textContent = pct(grandFunctional);
            document.getElementById("natCardPartial").textContent = grandPartial.toLocaleString();
            document.getElementById("natCardPartialPct").textContent = pct(grandPartial);
            document.getElementById("natCardNotFunctional").textContent = grandNotFunctional.toLocaleString();
            document.getElementById("natCardNotFunctionalPct").textContent = pct(grandNotFunctional);
            document.getElementById("natCardAbandoned").textContent = grandAbandoned.toLocaleString();
            document.getElementById("natCardAbandonedPct").textContent = pct(grandAbandoned);

            if (nationalChart) nationalChart.destroy();
            nationalChart = new Chart(nationalCtx, {
                type: "bar",
                data: {
                    labels: districts,
                    datasets: [
                        { label: "Functional", data: functional, backgroundColor: "#16a34a" },
                        { label: "Partially Functional", data: partial, backgroundColor: "#d97706" },
                        { label: "Not Functional", data: notFunctional, backgroundColor: "#dc2626" },
                        { label: "Abandoned", data: abandoned, backgroundColor: "#6b7280" }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: true, position: "top" },
                        title: { display: true, text: "Water Point Status by District" },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.raw;
                                    const datasetLabel = context.dataset.label;
                                    return `${datasetLabel}: ${value.toLocaleString()} points`;
                                }
                            }
                        }
                    },
                    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Number of Water Points' } } }
                }
            });

            const tableDiv = document.getElementById("nationalTableContainer");
            tableDiv.innerHTML = `
                <h2>District Summary Table</h2>
                <button class="export-btn" onclick="exportCSV('national')" style="margin-bottom: 15px;">📥 Export to CSV</button>
                <div style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>District</th><th>Total</th><th>Functional</th><th>Partial</th><th>Not Functional</th><th>Abandoned</th><th>% Functional</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(d => `
                                <tr>
                                    <td>${d.district.charAt(0).toUpperCase() + d.district.slice(1)}</td>
                                    <td>${Number(d.total).toLocaleString()}</td>
                                    <td>${Number(d.functional).toLocaleString()}</td>
                                    <td>${Number(d.partial).toLocaleString()}</td>
                                    <td>${Number(d.not_functional).toLocaleString()}</td>
                                    <td>${Number(d.abandoned).toLocaleString()}</td>
                                    <td>${Number(d.total) > 0 ? ((Number(d.functional) / Number(d.total)) * 100).toFixed(1) + "%" : "0%"}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td><strong>Total</strong></td>
                                <td><strong>${grandTotal.toLocaleString()}</strong></td>
                                <td><strong>${grandFunctional.toLocaleString()}</strong></td>
                                <td><strong>${grandPartial.toLocaleString()}</strong></td>
                                <td><strong>${grandNotFunctional.toLocaleString()}</strong></td>
                                <td><strong>${grandAbandoned.toLocaleString()}</strong></td>
                                <td><strong>${((grandFunctional / grandTotal) * 100).toFixed(1)}%</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
            
            // Check district alerts after loading national data
            checkDistrictAlerts();
        })
        .catch(err => console.error("National fetch error:", err));
}

function initMap() {
    try {
        if (typeof L === 'undefined') {
            console.error("Leaflet library not loaded!");
            return;
        }
        
        map = L.map("map").setView([-13.5, 34.0], 7);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        markersLayer = L.layerGroup().addTo(map);
        console.log("Map initialized successfully");
        
        map.on('click', function(e) {
            const modal = document.getElementById('dataEntryModal');
            if (modal && modal.style.display === 'flex') {
                document.getElementById('entryLat').value = e.latlng.lat.toFixed(6);
                document.getElementById('entryLng').value = e.latlng.lng.toFixed(6);
                showToast('Coordinates added from map click!', 'success');
            }
        });
    } catch (error) {
        console.error("Error initializing map:", error);
    }
}

function loadDistrictMap(table) {
    const coords = districtCoords[table];
    if (coords && map && markersLayer) {
        markersLayer.clearLayers();
        const marker = L.marker(coords).addTo(markersLayer);
        marker.bindPopup(`
            <strong>${table.charAt(0).toUpperCase() + table.slice(1)} District</strong><br>
            Click to view district data
        `);
        map.setView(coords, 9);
        
        fetch(`${API_URL}/data?table=${table}`)
            .then(res => res.json())
            .then(data => {
                const total = data.reduce((sum, d) => sum + Number(d.total), 0);
                marker.bindPopup(`
                    <strong>${table.charAt(0).toUpperCase() + table.slice(1)} District</strong><br>
                    <b>Total Water Points:</b> ${total.toLocaleString()}<br>
                    <b>Functional:</b> ${data.find(d => d.status === 'Functional')?.total || 0}<br>
                    <b>Not Functional:</b> ${data.find(d => d.status === 'Not functional')?.total || 0}
                `);
            });
    }
}

function loadMap(table = "nsanje", TA = "", type = "") {
    let url = `${API_URL}/mapdata?table=${encodeURIComponent(table)}`;
    if (TA) url += `&district=${encodeURIComponent(TA)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;

    fetch(url)
        .then(res => res.json())
        .then(points => {
            if (!markersLayer) initMap();
            markersLayer.clearLayers();

            const validPoints = points.filter(p => {
                const lat = parseFloat(p.Latitude);
                const lng = parseFloat(p.Longitude);
                return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
            });

            if (validPoints.length === 0) {
                loadDistrictMap(table);
                return;
            }

            const bounds = [];
            validPoints.forEach(p => {
                const lat = parseFloat(p.Latitude);
                const lng = parseFloat(p.Longitude);
                const color = getStatusColor(p.status);

                const marker = L.circleMarker([lat, lng], {
                    radius: 6,
                    fillColor: color,
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.85
                });

                marker.bindPopup(`
                    <strong>${p.Name || "Unknown"}</strong><br>
                    <b>ID:</b> ${p.water_point_id || 'N/A'}<br>
                    <b>Type:</b> ${p.Type || "N/A"}<br>
                    <b>Status:</b> <span style="color:${color}">${p.status || "N/A"}</span>
                `);

                marker.addTo(markersLayer);
                bounds.push([lat, lng]);
            });

            if (bounds.length > 0) {
                map.fitBounds(bounds, { padding: [30, 30] });
            }
        })
        .catch(err => console.error("Map fetch error:", err));
}

function renderCards(data) {
    const total = data.reduce((sum, d) => sum + Number(d.total), 0);
    
    let functional = 0;
    let partial = 0;
    let notFunctional = 0;
    let abandoned = 0;
    
    data.forEach(item => {
        const status = item.status;
        const count = Number(item.total);
        
        if (status === "Functional") {
            functional += count;
        } else if (status === "Partially functional but in need of repair") {
            partial += count;
        } else if (status === "Not functional") {
            notFunctional += count;
        } else if (status === "No longer exists or abandoned") {
            abandoned += count;
        }
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

function loadDistricts(table) {
    fetch(`${API_URL}/districts?table=${encodeURIComponent(table)}`)
        .then(res => res.json())
        .then(districts => {
            const select = document.getElementById("districtSelect");
            select.innerHTML = '<option value="">All Traditional Authorities</option>';
            if (Array.isArray(districts)) {
                districts.forEach(d => {
                    if (d) {
                        const opt = document.createElement("option");
                        opt.value = d;
                        opt.textContent = d;
                        select.appendChild(opt);
                    }
                });
            }
        })
        .catch(err => console.error("Failed to load TAs:", err));
}

function loadTypes(table) {
    fetch(`${API_URL}/types?table=${encodeURIComponent(table)}`)
        .then(res => res.json())
        .then(types => {
            const select = document.getElementById("typeSelect");
            select.innerHTML = '<option value="">All Types</option>';
            if (Array.isArray(types)) {
                types.forEach(t => {
                    if (t) {
                        const opt = document.createElement("option");
                        opt.value = t;
                        opt.textContent = t;
                        select.appendChild(opt);
                    }
                });
            }
        })
        .catch(err => console.error("Failed to load types:", err));
}

function renderTable(data, title) {
    const total = data.reduce((sum, d) => sum + Number(d.total), 0);
    const tableDiv = document.getElementById("tableContainer");

    tableDiv.innerHTML = `
        <h2>Summary — ${title}</h2>
        <button class="export-btn" onclick="exportCSV('district')" style="margin-bottom: 15px;">📥 Export to CSV</button>
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Functionality Status</th>
                        <th>Count</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map((d, i) => `
                        <tr>
                            <td>
                                <span class="dot" style="background:${COLORS[i % COLORS.length]}"></span>
                                ${d.status}
                            </td>
                            <td>${Number(d.total).toLocaleString()}</td>
                            <td>${((Number(d.total) / total) * 100).toFixed(1)}%</td>
                        </tr>
                    `).join("")}
                </tbody>
                <tfoot>
                    <tr>
                        <td><strong>Total</strong></td>
                        <td><strong>${total.toLocaleString()}</strong></td>
                        <td><strong>100%</strong></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
}

function fetchData(table = "nsanje", TA = "", type = "") {
    let url = `${API_URL}/data?table=${encodeURIComponent(table)}`;
    if (TA) url += `&district=${encodeURIComponent(TA)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;

    fetch(url)
        .then(res => res.json())
        .then(data => {
            renderCards(data);
            data = data.filter(d => d.status !== "" && d.status !== null);
            if (data.length === 0) return;

            const labels = data.map(d => d.status);
            const counts = data.map(d => Number(d.total));
            const colors = labels.map((_, i) => COLORS[i % COLORS.length]);
            const totalCount = counts.reduce((a, b) => a + b, 0);

            let title = table.charAt(0).toUpperCase() + table.slice(1);
            if (TA) title += ` — ${TA}`;
            if (type) title += ` — ${type}`;

            if (barChart) barChart.destroy();
            barChart = new Chart(barCtx, {
                type: "bar",
                data: { 
                    labels: labels, 
                    datasets: [{ 
                        label: title, 
                        data: counts, 
                        backgroundColor: colors,
                        borderColor: colors,
                        borderWidth: 1
                    }] 
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: true, position: 'top' },
                        title: { display: true, text: `Functionality Status — ${title}`, font: { size: 14 } },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.raw;
                                    const percentage = ((value / totalCount) * 100).toFixed(1);
                                    return `${context.dataset.label}: ${value.toLocaleString()} points (${percentage}%)`;
                                }
                            }
                        }
                    },
                    scales: { 
                        y: { 
                            beginAtZero: true, 
                            ticks: { precision: 0 },
                            title: { display: true, text: 'Number of Water Points' }
                        },
                        x: {
                            title: { display: true, text: 'Status' }
                        }
                    }
                }
            });

            if (doughnutChart) doughnutChart.destroy();
            doughnutChart = new Chart(doughnutCtx, {
                type: "doughnut",
                data: { 
                    labels: labels, 
                    datasets: [{ 
                        data: counts, 
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: "#fff"
                    }] 
                },
                options: { 
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { 
                        legend: { display: true, position: "bottom" },
                        title: { display: true, text: `Distribution — ${title}`, font: { size: 14 } },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const value = context.raw;
                                    const percentage = ((value / totalCount) * 100).toFixed(1);
                                    return `${context.label}: ${value.toLocaleString()} points (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });

            renderTable(data, title);
            
            // After loading district data, check TA alerts
            if (!TA || TA === "") {
                setTimeout(() => {
                    checkTAAlerts(table);
                }, 500);
            }
        })
        .catch(err => console.error("Fetch error:", err));
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
});

document.getElementById("districtSelect").addEventListener("change", getFilters);
document.getElementById("typeSelect").addEventListener("change", getFilters);

function exportCSV(type) {
    let rows = [];
    let filename = "";

    if (type === "district") {
        const table = document.getElementById("tableSelect").value;
        filename = `${table}_water_points.csv`;
        rows.push(["Functionality Status", "Count", "Percentage"]);
        const tableRows = document.querySelectorAll("#tableContainer tbody tr");
        tableRows.forEach(row => {
            const cells = row.querySelectorAll("td");
            rows.push([cells[0].textContent.trim(), cells[1].textContent.trim(), cells[2].textContent.trim()]);
        });
        const totalRow = document.querySelectorAll("#tableContainer tfoot td");
        if (totalRow.length) {
            rows.push([totalRow[0].textContent.trim(), totalRow[1].textContent.trim(), totalRow[2].textContent.trim()]);
        }
    } else {
        filename = "malawi_national_water_points.csv";
        rows.push(["District", "Total", "Functional", "Partial", "Not Functional", "Abandoned", "% Functional"]);
        const tableRows = document.querySelectorAll("#nationalTableContainer tbody tr");
        tableRows.forEach(row => {
            const cells = row.querySelectorAll("td");
            rows.push([cells[0].textContent.trim(), cells[1].textContent.trim(), cells[2].textContent.trim(), cells[3].textContent.trim(), cells[4].textContent.trim(), cells[5].textContent.trim(), cells[6].textContent.trim()]);
        });
        const totalRow = document.querySelectorAll("#nationalTableContainer tfoot td");
        if (totalRow.length) {
            rows.push([totalRow[0].textContent.trim(), totalRow[1].textContent.trim(), totalRow[2].textContent.trim(), totalRow[3].textContent.trim(), totalRow[4].textContent.trim(), totalRow[5].textContent.trim(), totalRow[6].textContent.trim()]);
        }
    }

    const csvContent = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// ============ DISTRICT LEVEL ALERTS ============

function checkDistrictAlerts() {
    fetch(`${API_URL}/national`)
        .then(res => res.json())
        .then(districts => {
            const alerts = [];
            const criticalThreshold = 50;
            const warningThreshold = 65;
            
            districts.forEach(district => {
                const total = Number(district.total);
                const functional = Number(district.functional);
                const functionalRate = total > 0 ? (functional / total) * 100 : 0;
                
                if (functionalRate < criticalThreshold) {
                    alerts.push({
                        district: district.district,
                        rate: functionalRate,
                        level: 'critical',
                        message: `🔴 CRITICAL: ${district.district.toUpperCase()} has only ${functionalRate.toFixed(1)}% functional water points!`
                    });
                } else if (functionalRate < warningThreshold) {
                    alerts.push({
                        district: district.district,
                        rate: functionalRate,
                        level: 'warning',
                        message: `⚠️ WARNING: ${district.district.toUpperCase()} has ${functionalRate.toFixed(1)}% functional points. Needs attention.`
                    });
                }
            });
            
            if (alerts.length > 0) {
                showDistrictAlertsPanel(alerts);
            } else {
                hideDistrictAlertsPanel();
            }
        })
        .catch(err => console.error("District alert check error:", err));
}

function showDistrictAlertsPanel(alerts) {
    let alertsPanel = document.getElementById('districtAlertsPanel');
    if (!alertsPanel) {
        alertsPanel = document.createElement('div');
        alertsPanel.id = 'districtAlertsPanel';
        alertsPanel.className = 'alerts-panel';
        
        const tabs = document.querySelector('.tabs');
        tabs.parentNode.insertBefore(alertsPanel, tabs.nextSibling);
    }
    
    const criticalAlerts = alerts.filter(a => a.level === 'critical');
    const warningAlerts = alerts.filter(a => a.level === 'warning');
    
    alertsPanel.innerHTML = `
        <div class="alerts-header">
            <span>🏘️ District Alerts</span>
            <button onclick="closeDistrictAlertsPanel()" class="close-alerts">×</button>
        </div>
        <div class="alerts-container">
            ${criticalAlerts.length > 0 ? `
                <div class="alert-section critical">
                    <h4>🔴 Critical - Immediate Action Required</h4>
                    ${criticalAlerts.map(alert => `
                        <div class="alert-item critical" onclick="switchToDistrict('${alert.district}')">
                            <span class="alert-icon">🔴</span>
                            <span class="alert-message">${alert.message}</span>
                            <span class="alert-rate">${alert.rate.toFixed(1)}%</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            ${warningAlerts.length > 0 ? `
                <div class="alert-section warning">
                    <h4>⚠️ Warning - Needs Monitoring</h4>
                    ${warningAlerts.map(alert => `
                        <div class="alert-item warning" onclick="switchToDistrict('${alert.district}')">
                            <span class="alert-icon">⚠️</span>
                            <span class="alert-message">${alert.message}</span>
                            <span class="alert-rate">${alert.rate.toFixed(1)}%</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
    
    alertsPanel.style.display = 'block';
}

function hideDistrictAlertsPanel() {
    const alertsPanel = document.getElementById('districtAlertsPanel');
    if (alertsPanel) {
        alertsPanel.style.display = 'none';
    }
}

function closeDistrictAlertsPanel() {
    const alertsPanel = document.getElementById('districtAlertsPanel');
    if (alertsPanel) {
        alertsPanel.style.display = 'none';
    }
}

function switchToDistrict(district) {
    switchTab('district');
    const districtSelect = document.getElementById('tableSelect');
    if (districtSelect) {
        districtSelect.value = district.toLowerCase();
        const event = new Event('change');
        districtSelect.dispatchEvent(event);
    }
    closeDistrictAlertsPanel();
    document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
}

// ============ TA LEVEL ALERTS ============

let currentDistrictForTA = null;

function checkTAAlerts(district) {
    currentDistrictForTA = district;
    
    fetch(`${API_URL}/districts?table=${district}`)
        .then(res => res.json())
        .then(tas => {
            if (!tas || tas.length === 0) {
                hideTAAlertsPanel();
                return;
            }
            
            const alerts = [];
            const criticalThreshold = 50;
            const warningThreshold = 65;
            let completed = 0;
            
            tas.forEach(ta => {
                fetch(`${API_URL}/data?table=${district}&district=${encodeURIComponent(ta)}`)
                    .then(res => res.json())
                    .then(taData => {
                        const total = taData.reduce((sum, d) => sum + Number(d.total), 0);
                        const functional = taData.find(d => d.status === 'Functional')?.total || 0;
                        const functionalRate = total > 0 ? (functional / total) * 100 : 100;
                        
                        if (functionalRate < criticalThreshold) {
                            alerts.push({
                                ta: ta,
                                rate: functionalRate,
                                level: 'critical',
                                message: `🔴 CRITICAL: ${ta} has only ${functionalRate.toFixed(1)}% functional water points!`
                            });
                        } else if (functionalRate < warningThreshold) {
                            alerts.push({
                                ta: ta,
                                rate: functionalRate,
                                level: 'warning',
                                message: `⚠️ WARNING: ${ta} has ${functionalRate.toFixed(1)}% functional points.`
                            });
                        }
                        
                        completed++;
                        if (completed === tas.length) {
                            if (alerts.length > 0) {
                                showTAAlertsPanel(alerts, district);
                            } else {
                                hideTAAlertsPanel();
                            }
                        }
                    })
                    .catch(err => {
                        console.error("TA data fetch error:", err);
                        completed++;
                        if (completed === tas.length && alerts.length === 0) {
                            hideTAAlertsPanel();
                        }
                    });
            });
            
            if (tas.length === 0) {
                hideTAAlertsPanel();
            }
        })
        .catch(err => console.error("TA alert check error:", err));
}

function showTAAlertsPanel(alerts, district) {
    let alertsPanel = document.getElementById('taAlertsPanel');
    if (!alertsPanel) {
        alertsPanel = document.createElement('div');
        alertsPanel.id = 'taAlertsPanel';
        alertsPanel.className = 'alerts-panel ta-alerts';
        
        const mapContainer = document.querySelector('.map-container');
        mapContainer.parentNode.insertBefore(alertsPanel, mapContainer);
    }
    
    const criticalAlerts = alerts.filter(a => a.level === 'critical');
    const warningAlerts = alerts.filter(a => a.level === 'warning');
    
    alertsPanel.innerHTML = `
        <div class="alerts-header">
            <span>📍 TA Alerts - ${district.toUpperCase()}</span>
            <button onclick="closeTAAlertsPanel()" class="close-alerts">×</button>
        </div>
        <div class="alerts-container">
            ${criticalAlerts.length > 0 ? `
                <div class="alert-section critical">
                    <h4>🔴 Critical TAs - Immediate Action</h4>
                    ${criticalAlerts.map(alert => `
                        <div class="alert-item critical" onclick="filterByTA('${alert.ta}')">
                            <span class="alert-icon">🔴</span>
                            <span class="alert-message">${alert.message}</span>
                            <span class="alert-rate">${alert.rate.toFixed(1)}%</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            ${warningAlerts.length > 0 ? `
                <div class="alert-section warning">
                    <h4>⚠️ Warning TAs - Monitor</h4>
                    ${warningAlerts.map(alert => `
                        <div class="alert-item warning" onclick="filterByTA('${alert.ta}')">
                            <span class="alert-icon">⚠️</span>
                            <span class="alert-message">${alert.message}</span>
                            <span class="alert-rate">${alert.rate.toFixed(1)}%</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
    
    alertsPanel.style.display = 'block';
}

function hideTAAlertsPanel() {
    const alertsPanel = document.getElementById('taAlertsPanel');
    if (alertsPanel) {
        alertsPanel.style.display = 'none';
    }
}

function closeTAAlertsPanel() {
    const alertsPanel = document.getElementById('taAlertsPanel');
    if (alertsPanel) {
        alertsPanel.style.display = 'none';
    }
}

function filterByTA(ta) {
    const districtSelect = document.getElementById('districtSelect');
    if (districtSelect) {
        districtSelect.value = ta;
        const event = new Event('change');
        districtSelect.dispatchEvent(event);
    }
    closeTAAlertsPanel();
    
    // Show toast notification
    showToast(`Showing data for ${ta}`, 'success');
}

// ============ AUTHENTICATION & DATA ENTRY ============

function showOfficerLogin() {
    document.getElementById('officerLoginModal').style.display = 'flex';
}

function closeOfficerLogin() {
    document.getElementById('officerLoginModal').style.display = 'none';
}

function openDataEntryModal() {
    if (!currentOfficer) {
        showOfficerLogin();
        return;
    }
    document.getElementById('dataEntryModal').style.display = 'flex';
    document.getElementById('dataEntryForm').reset();
    document.getElementById('entryMessage').innerHTML = '';
    
    if (currentOfficer.district) {
        const districtSelect = document.getElementById('entryDistrict');
        districtSelect.value = currentOfficer.district;
        districtSelect.disabled = true;
    } else {
        document.getElementById('entryDistrict').disabled = false;
    }
}

function closeDataEntryModal() {
    document.getElementById('dataEntryModal').style.display = 'none';
}

function showToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 30px;
        background: ${type === 'success' ? '#2a5a3a' : '#dc2626'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 2000;
        animation: fadeInOut 3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showMessage(msg, type) {
    const msgDiv = document.getElementById('entryMessage');
    msgDiv.innerHTML = `<div class="message ${type}" style="padding:10px; border-radius:6px; background:${type === 'success' ? '#d1fae5' : '#fee2e2'}; color:${type === 'success' ? '#065f46' : '#991b1b'}">${msg}</div>`;
    setTimeout(() => { msgDiv.innerHTML = ''; }, 3000);
}

function updateOfficerBar() {
    if (currentOfficer) {
        document.getElementById('officerBar').style.display = 'block';
        
        document.getElementById('officerName').textContent = currentOfficer.full_name || currentOfficer.username;
        
        const districtBadge = document.getElementById('officerDistrict');
        if (currentOfficer.district) {
            districtBadge.textContent = `${currentOfficer.district.toUpperCase()} District Water Officer`;
        } else if (currentOfficer.role === 'admin') {
            districtBadge.textContent = 'System Administrator';
        } else {
            districtBadge.textContent = 'District Water Officer';
        }
        
        document.getElementById('dataEntryButton').style.display = 'block';
    } else {
        document.getElementById('officerBar').style.display = 'none';
        document.getElementById('dataEntryButton').style.display = 'none';
    }
}

function checkOfficerSession() {
    fetch(`${API_URL}/api/me`, { credentials: 'include' })
        .then(res => {
            if (res.status === 401) return null;
            return res.json();
        })
        .then(user => {
            if (user) {
                currentOfficer = user;
                updateOfficerBar();
            }
        })
        .catch(() => {});
}

function logout() {
    fetch(`${API_URL}/api/logout`, {
        method: 'POST',
        credentials: 'include'
    })
    .then(() => {
        currentOfficer = null;
        updateOfficerBar();
        showToast('Logged out successfully', 'info');
    });
}

document.getElementById('officerLoginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('officerUsername').value;
    const password = document.getElementById('officerPassword').value;
    
    fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            currentOfficer = data.user;
            closeOfficerLogin();
            updateOfficerBar();
            
            let welcomeMsg = '';
            if (currentOfficer.district) {
                welcomeMsg = `Welcome, ${currentOfficer.full_name || currentOfficer.username}! You are logged in as ${currentOfficer.district.toUpperCase()} District Water Officer.`;
            } else if (currentOfficer.role === 'admin') {
                welcomeMsg = `Welcome, ${currentOfficer.full_name || currentOfficer.username}! You are logged in as System Administrator.`;
            } else {
                welcomeMsg = `Welcome, ${currentOfficer.full_name || currentOfficer.username}! You are logged in as District Water Officer.`;
            }
            showToast(welcomeMsg, 'success');
        } else {
            document.getElementById('officerLoginError').textContent = data.error;
        }
    })
    .catch(() => {
        document.getElementById('officerLoginError').textContent = 'Login failed. Try again.';
    });
});

document.getElementById('dataEntryForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const data = {
        district: document.getElementById('entryDistrict').value,
        name: document.getElementById('entryName').value,
        ta: document.getElementById('entryTA').value,
        type: document.getElementById('entryType').value,
        status: document.getElementById('entryStatus').value,
        latitude: document.getElementById('entryLat').value || null,
        longitude: document.getElementById('entryLng').value || null,
        officer_name: document.getElementById('entryOfficer').value || currentOfficer?.username,
        notes: document.getElementById('entryNotes').value
    };
    
    if (!data.district || !data.name || !data.ta || !data.type || !data.status) {
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
        if (result.success) {
            showMessage('Water point added successfully! ID: ' + result.water_point_id, 'success');
            setTimeout(() => {
                closeDataEntryModal();
                const currentTable = document.getElementById('tableSelect')?.value;
                if (currentTable === data.district) {
                    fetchData(currentTable);
                    loadMap(currentTable);
                }
            }, 1500);
        } else {
            showMessage(result.error || 'Error adding water point', 'error');
        }
    })
    .catch(err => {
        showMessage('Network error. Please try again.', 'error');
    });
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered'))
        .catch(err => console.log('Service Worker failed:', err));
}

// Initialize everything
const initialTable = document.getElementById("tableSelect").value;
initMap();
checkOfficerSession();
loadDistricts(initialTable);
loadTypes(initialTable);
fetchData(initialTable);
loadMap(initialTable);

// Check for district alerts on page load
setTimeout(() => {
    checkDistrictAlerts();
}, 2000);