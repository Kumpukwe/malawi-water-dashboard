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
            const districts = data.map(d => d.district.charAt(0).toUpperCase() + d.district.slice(1));
            const totals = data.map(d => Number(d.total));
            const functional = data.map(d => Number(d.functional));
            const partial = data.map(d => Number(d.partial));
            const notFunctional = data.map(d => Number(d.not_functional));
            const abandoned = data.map(d => Number(d.abandoned));

            // National cards
            const grandTotal = totals.reduce((a, b) => a + b, 0);
            const grandFunctional = functional.reduce((a, b) => a + b, 0);
            const grandPartial = partial.reduce((a, b) => a + b, 0);
            const grandNotFunctional = notFunctional.reduce((a, b) => a + b, 0);
            const grandAbandoned = abandoned.reduce((a, b) => a + b, 0);

            const pct = (val) => grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) + "% of total" : "0%";

            document.getElementById("natCardTotal").textContent = grandTotal.toLocaleString();
            document.getElementById("natCardFunctional").textContent = grandFunctional.toLocaleString();
            document.getElementById("natCardFunctionalPct").textContent = pct(grandFunctional);
            document.getElementById("natCardPartial").textContent = grandPartial.toLocaleString();
            document.getElementById("natCardPartialPct").textContent = pct(grandPartial);
            document.getElementById("natCardNotFunctional").textContent = grandNotFunctional.toLocaleString();
            document.getElementById("natCardNotFunctionalPct").textContent = pct(grandNotFunctional);
            document.getElementById("natCardAbandoned").textContent = grandAbandoned.toLocaleString();
            document.getElementById("natCardAbandonedPct").textContent = pct(grandAbandoned);

            // National chart
            if (nationalChart) nationalChart.destroy();
            nationalChart = new Chart(nationalCtx, {
                type: "bar",
                data: {
                    labels: districts,
                    datasets: [
                        {
                            label: "Functional",
                            data: functional,
                            backgroundColor: "#16a34a"
                        },
                        {
                            label: "Partially Functional",
                            data: partial,
                            backgroundColor: "#d97706"
                        },
                        {
                            label: "Not Functional",
                            data: notFunctional,
                            backgroundColor: "#dc2626"
                        },
                        {
                            label: "Abandoned",
                            data: abandoned,
                            backgroundColor: "#6b7280"
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: true, position: "top" },
                        title: {
                            display: true,
                            text: "Water Point Status by District"
                        }
                    },
                    scales: {
                        x: { stacked: true },
                        y: { stacked: true, beginAtZero: true }
                    }
                }
            });

            // National table
            const tableDiv = document.getElementById("nationalTableContainer");
            tableDiv.innerHTML = `
                <h2>District Summary Table</h2>
                <button class="export-btn" onclick="exportCSV('national')" style="margin-bottom: 15px;">📥 Export to CSV</button>
                <div style="overflow-x: auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>District</th>
                                <th>Total</th>
                                <th>Functional</th>
                                <th>Partial</th>
                                <th>Not Functional</th>
                                <th>Abandoned</th>
                                <th>% Functional</th>
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
            Total Water Points: Loading...<br>
            Click to view district data
        `);
        map.setView(coords, 9);
        console.log(`District marker added for ${table}`);
        
        // Fetch and display district summary
        fetch(`${API_URL}/data?table=${table}`)
            .then(res => res.json())
            .then(data => {
                const total = data.reduce((sum, d) => sum + Number(d.total), 0);
                marker.bindPopup(`
                    <strong>${table.charAt(0).toUpperCase() + table.slice(1)} District</strong><br>
                    <b>Total Water Points:</b> ${total.toLocaleString()}<br>
                    <b>Functional:</b> ${data.find(d => d.status === 'Functional')?.total || 0}<br>
                    <b>Not Functional:</b> ${data.find(d => d.status === 'Not functional')?.total || 0}<br>
                    <a href="#" onclick="document.getElementById('tableSelect').value='${table}';getFilters();">View Details</a>
                `);
            })
            .catch(err => console.error("Error fetching district data:", err));
    }
}

function loadMap(table = "nsanje", TA = "", type = "") {
    let url = `${API_URL}/mapdata?table=${encodeURIComponent(table)}`;
    if (TA) url += `&district=${encodeURIComponent(TA)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;

    console.log("Loading map data from:", url);

    fetch(url)
        .then(res => res.json())
        .then(points => {
            console.log(`Received ${points.length} points from API`);
            
            if (!markersLayer) {
                initMap();
            }
            
            markersLayer.clearLayers();

            const validPoints = points.filter(p => {
                const lat = parseFloat(p.Latitude);
                const lng = parseFloat(p.Longitude);
                return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
            });

            console.log(`Valid points to display: ${validPoints.length}`);

            if (validPoints.length === 0) {
                console.log("No water points with coordinates found, showing district center instead");
                loadDistrictMap(table);
                return;
            }

            const bounds = [];

            validPoints.forEach(p => {
                const lat = parseFloat(p.Latitude);
                const lng = parseFloat(p.Longitude);
                const color = getStatusColor(p.status);

                try {
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
                        <b>Type:</b> ${p.Type || "N/A"}<br>
                        <b>Status:</b> <span style="color:${color}">${p.status || "N/A"}</span>
                    `);

                    marker.addTo(markersLayer);
                    bounds.push([lat, lng]);
                } catch (markerError) {
                    console.error("Error creating marker for:", p.Name);
                }
            });

            if (bounds.length > 0) {
                try {
                    map.fitBounds(bounds, { padding: [30, 30] });
                } catch (boundsError) {
                    map.setView([-13.5, 34.0], 7);
                }
            }
        })
        .catch(err => console.error("Map fetch error:", err));
}

function renderCards(data) {
    const total = data.reduce((sum, d) => sum + Number(d.total), 0);

    const get = (keyword) => {
        const row = data.find(d => d.status && d.status.toLowerCase().includes(keyword));
        return row ? Number(row.total) : 0;
    };

    const functional = get("functional") - get("partially") - get("not functional");
    const partial = get("partially");
    const notFunctional = get("not functional");
    const abandoned = get("abandoned");

    const pct = (val) => total > 0 ? ((val / total) * 100).toFixed(1) + "%" : "0%";

    document.getElementById("cardTotal").textContent = total.toLocaleString();
    document.getElementById("cardFunctional").textContent = functional.toLocaleString();
    document.getElementById("cardFunctionalPct").textContent = pct(functional) + " of total";
    document.getElementById("cardPartial").textContent = partial.toLocaleString();
    document.getElementById("cardPartialPct").textContent = pct(partial) + " of total";
    document.getElementById("cardNotFunctional").textContent = notFunctional.toLocaleString();
    document.getElementById("cardNotFunctionalPct").textContent = pct(notFunctional) + " of total";
    document.getElementById("cardAbandoned").textContent = abandoned.toLocaleString();
    document.getElementById("cardAbandonedPct").textContent = pct(abandoned) + " of total";
}

function loadDistricts(table) {
    fetch(`${API_URL}/districts?table=${encodeURIComponent(table)}`)
        .then(res => res.json())
        .then(districts => {
            const select = document.getElementById("districtSelect");
            select.innerHTML = '<option value="">All TAs</option>';
            districts.forEach(d => {
                if (d) {
                    const opt = document.createElement("option");
                    opt.value = d;
                    opt.textContent = d;
                    select.appendChild(opt);
                }
            });
        })
        .catch(err => console.error("Failed to load TAs:", err));
}

function loadTypes(table) {
    fetch(`${API_URL}/types?table=${encodeURIComponent(table)}`)
        .then(res => res.json())
        .then(types => {
            const select = document.getElementById("typeSelect");
            select.innerHTML = '<option value="">All Types</option>';
            types.forEach(t => {
                if (t) {
                    const opt = document.createElement("option");
                    opt.value = t;
                    opt.textContent = t;
                    select.appendChild(opt);
                }
            });
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

            let title = table.charAt(0).toUpperCase() + table.slice(1);
            if (TA) title += ` — ${TA}`;
            if (type) title += ` — ${type}`;

            if (barChart) barChart.destroy();
            barChart = new Chart(barCtx, {
                type: "bar",
                data: {
                    labels,
                    datasets: [{
                        label: title,
                        data: counts,
                        backgroundColor: colors
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: `Functionality Status — ${title}`
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { precision: 0 } }
                    }
                }
            });

            if (doughnutChart) doughnutChart.destroy();
            doughnutChart = new Chart(doughnutCtx, {
                type: "doughnut",
                data: {
                    labels,
                    datasets: [{
                        data: counts,
                        backgroundColor: colors
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { display: true, position: "bottom" },
                        title: {
                            display: true,
                            text: `Distribution — ${title}`
                        }
                    }
                }
            });

            renderTable(data, title);
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
            const status = cells[0].textContent.trim();
            const count = cells[1].textContent.trim();
            const pct = cells[2].textContent.trim();
            rows.push([status, count, pct]);
        });

        const totalRow = document.querySelectorAll("#tableContainer tfoot td");
        if (totalRow.length) {
            rows.push([
                totalRow[0].textContent.trim(),
                totalRow[1].textContent.trim(),
                totalRow[2].textContent.trim()
            ]);
        }

    } else {
        filename = "malawi_national_water_points.csv";

        rows.push(["District", "Total", "Functional", "Partial", "Not Functional", "Abandoned", "% Functional"]);

        const tableRows = document.querySelectorAll("#nationalTableContainer tbody tr");
        tableRows.forEach(row => {
            const cells = row.querySelectorAll("td");
            rows.push([
                cells[0].textContent.trim(),
                cells[1].textContent.trim(),
                cells[2].textContent.trim(),
                cells[3].textContent.trim(),
                cells[4].textContent.trim(),
                cells[5].textContent.trim(),
                cells[6].textContent.trim()
            ]);
        });

        const totalRow = document.querySelectorAll("#nationalTableContainer tfoot td");
        if (totalRow.length) {
            rows.push([
                totalRow[0].textContent.trim(),
                totalRow[1].textContent.trim(),
                totalRow[2].textContent.trim(),
                totalRow[3].textContent.trim(),
                totalRow[4].textContent.trim(),
                totalRow[5].textContent.trim(),
                totalRow[6].textContent.trim()
            ]);
        }
    }

    const csvContent = rows.map(row =>
        row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// Initialize everything
const initialTable = document.getElementById("tableSelect").value;
initMap();
loadDistricts(initialTable);
loadTypes(initialTable);
fetchData(initialTable);
loadMap(initialTable);