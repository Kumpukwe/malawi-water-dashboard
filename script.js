const barCtx = document.getElementById("barChart").getContext("2d");
const doughnutCtx = document.getElementById("doughnutChart").getContext("2d");

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
    fetch("http://localhost:3000/national")
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
            `;
        })
        .catch(err => console.error("National fetch error:", err));
}

function initMap() {
    map = L.map("map").setView([-13.5, 34.0], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors"
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
}

function loadMap(table = "nsanje", TA = "", type = "") {
    let url = `http://localhost:3000/mapdata?table=${encodeURIComponent(table)}`;
    if (TA) url += `&district=${encodeURIComponent(TA)}`;
    if (type) url += `&type=${encodeURIComponent(type)}`;

    fetch(url)
        .then(res => res.json())
        .then(points => {
            markersLayer.clearLayers();
            const bounds = [];

            points.forEach(p => {
                const lat = parseFloat(p.Latitude);
                const lng = parseFloat(p.Longitude);
                if (isNaN(lat) || isNaN(lng)) return;

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
                    <b>Type:</b> ${p.Type || "N/A"}<br>
                    <b>Status:</b> <span style="color:${color}">${p.status || "N/A"}</span>
                `);

                markersLayer.addLayer(marker);
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
    fetch(`http://localhost:3000/districts?table=${encodeURIComponent(table)}`)
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
    fetch(`http://localhost:3000/types?table=${encodeURIComponent(table)}`)
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
    `;
}

function fetchData(table = "nsanje", TA = "", type = "") {
    let url = `http://localhost:3000/data?table=${encodeURIComponent(table)}`;
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
                    },
                    animation: {
                        onComplete: function() {
                            const chart = this;
                            const ctx = chart.ctx;
                            ctx.font = "bold 13px Arial";
                            ctx.fillStyle = "#111";
                            ctx.textAlign = "center";
                            ctx.textBaseline = "bottom";
                            chart.data.datasets.forEach((dataset, i) => {
                                const meta = chart.getDatasetMeta(i);
                                meta.data.forEach((bar, index) => {
                                    const value = dataset.data[index];
                                    ctx.fillText(value.toLocaleString(), bar.x, bar.y - 4);
                                });
                            });
                        }
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


const initialTable = document.getElementById("tableSelect").value;
initMap();
loadDistricts(initialTable);
loadTypes(initialTable);
fetchData(initialTable);
loadMap(initialTable);