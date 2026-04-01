// ============ CHARTS & CONFIG ============

const barCtx = document.getElementById("barChart").getContext("2d");
const doughnutCtx = document.getElementById("doughnutChart").getContext("2d");

const API_URL = 'https://malawi-water-dashboard.up.railway.app';

let barChart, doughnutChart, nationalChart, map, markersLayer;
let nationalLoaded = false;
let currentOfficer = null;

const COLORS = ["#16a34a", "#dc2626", "#2563eb", "#d97706", "#7c3aed", "#0891b2"];
const STATUS_COLORS = {
    "Functional": "#16a34a",
    "Not functional": "#dc2626",
    "Partially functional but in need of repair": "#d97706",
    "No longer exists or abandoned": "#6b7280"
};

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

// ============ TABS ============

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

// ============ NATIONAL DATA ============

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

            const grandTotal = totals.reduce((a,b)=>a+b,0);
            const pct = val => grandTotal>0?((val/grandTotal)*100).toFixed(1)+"%":"0%";

            document.getElementById("natCardTotal").textContent = grandTotal.toLocaleString();
            document.getElementById("natCardFunctional").textContent = functional.reduce((a,b)=>a+b,0).toLocaleString();
            document.getElementById("natCardFunctionalPct").textContent = pct(functional.reduce((a,b)=>a+b,0));
            document.getElementById("natCardPartial").textContent = partial.reduce((a,b)=>a+b,0).toLocaleString();
            document.getElementById("natCardPartialPct").textContent = pct(partial.reduce((a,b)=>a+b,0));
            document.getElementById("natCardNotFunctional").textContent = notFunctional.reduce((a,b)=>a+b,0).toLocaleString();
            document.getElementById("natCardNotFunctionalPct").textContent = pct(notFunctional.reduce((a,b)=>a+b,0));
            document.getElementById("natCardAbandoned").textContent = abandoned.reduce((a,b)=>a+b,0).toLocaleString();
            document.getElementById("natCardAbandonedPct").textContent = pct(abandoned.reduce((a,b)=>a+b,0));

            if(nationalChart) nationalChart.destroy();
            nationalChart = new Chart(nationalCtx, {
                type:"bar",
                data:{labels:districts,datasets:[
                    {label:"Functional",data:functional,backgroundColor:"#16a34a"},
                    {label:"Partially Functional",data:partial,backgroundColor:"#d97706"},
                    {label:"Not Functional",data:notFunctional,backgroundColor:"#dc2626"},
                    {label:"Abandoned",data:abandoned,backgroundColor:"#6b7280"}
                ]},
                options:{
                    responsive:true,
                    plugins:{legend:{display:true,position:"top"},title:{display:true,text:"Water Point Status by District"}},
                    scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}
                }
            });

            // Table
            const tableDiv = document.getElementById("nationalTableContainer");
            tableDiv.innerHTML = `<h2>District Summary Table</h2>
                <button class="export-btn" onclick="exportCSV('national')" style="margin-bottom:15px;">📥 Export to CSV</button>
                <div style="overflow-x:auto;">
                <table>
                    <thead><tr><th>District</th><th>Total</th><th>Functional</th><th>Partial</th><th>Not Functional</th><th>Abandoned</th><th>% Functional</th></tr></thead>
                    <tbody>${data.map(d=>`
                        <tr>
                            <td>${d.district.charAt(0).toUpperCase()+d.district.slice(1)}</td>
                            <td>${Number(d.total).toLocaleString()}</td>
                            <td>${Number(d.functional).toLocaleString()}</td>
                            <td>${Number(d.partial).toLocaleString()}</td>
                            <td>${Number(d.not_functional).toLocaleString()}</td>
                            <td>${Number(d.abandoned).toLocaleString()}</td>
                            <td>${Number(d.total)>0?((Number(d.functional)/Number(d.total))*100).toFixed(1)+"%":"0%"}</td>
                        </tr>
                    `).join("")}</tbody>
                    <tfoot><tr>
                        <td><strong>Total</strong></td>
                        <td><strong>${totals.reduce((a,b)=>a+b,0).toLocaleString()}</strong></td>
                        <td><strong>${functional.reduce((a,b)=>a+b,0).toLocaleString()}</strong></td>
                        <td><strong>${partial.reduce((a,b)=>a+b,0).toLocaleString()}</strong></td>
                        <td><strong>${notFunctional.reduce((a,b)=>a+b,0).toLocaleString()}</strong></td>
                        <td><strong>${abandoned.reduce((a,b)=>a+b,0).toLocaleString()}</strong></td>
                        <td><strong>${((functional.reduce((a,b)=>a+b,0)/totals.reduce((a,b)=>a+b,0))*100).toFixed(1)}%</strong></td>
                    </tr></tfoot>
                </table></div>`;
        }).catch(err=>console.error("National fetch error:",err));
}

// ============ MAP ============

function initMap() {
    if(typeof L==='undefined'){console.error("Leaflet not loaded!");return;}
    map=L.map("map").setView([-13.5,34.0],7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'}).addTo(map);
    markersLayer=L.layerGroup().addTo(map);

    map.on('click',function(e){
        const modal=document.getElementById('dataEntryModal');
        if(modal&&modal.style.display==='flex'){
            document.getElementById('entryLat').value=e.latlng.lat.toFixed(6);
            document.getElementById('entryLng').value=e.latlng.lng.toFixed(6);
            showToast('Coordinates added from map click!','success');
        }
    });
}

// ============ GPS CAPTURE ============

function getCurrentLocation(){
    if(!navigator.geolocation){showMessage("Geolocation not supported","error");return;}
    showMessage("Getting location...","info");
    navigator.geolocation.getCurrentPosition(
        (position)=>{
            const lat=position.coords.latitude;
            const lng=position.coords.longitude;
            document.getElementById('entryLat').value=lat.toFixed(6);
            document.getElementById('entryLng').value=lng.toFixed(6);
            const accuracy=position.coords.accuracy;
            showMessage(`GPS captured (±${accuracy.toFixed(0)}m)`,"success");
            if(map&&markersLayer){
                const latLng=[lat,lng];
                L.marker(latLng).addTo(markersLayer).bindPopup("📍 Your location").openPopup();
                map.setView(latLng,15);
            }
        },
        (err)=>{
            console.error(err);
            showMessage("Failed to get location. Enable GPS.","error");
        },
        {enableHighAccuracy:true,timeout:10000,maximumAge:0}
    );
}

// ============ DATA FETCH & RENDER ============

function renderCards(data){
    const total=data.reduce((s,d)=>s+Number(d.total),0);
    let functional=0,partial=0,notFunctional=0,abandoned=0;
    data.forEach(d=>{
        if(d.status==="Functional") functional+=Number(d.total);
        else if(d.status==="Partially functional but in need of repair") partial+=Number(d.total);
        else if(d.status==="Not functional") notFunctional+=Number(d.total);
        else if(d.status==="No longer exists or abandoned") abandoned+=Number(d.total);
    });
    const pct=val=>total>0?((val/total)*100).toFixed(1)+"%":"0%";
    document.getElementById("cardTotal").textContent=total.toLocaleString();
    document.getElementById("cardFunctional").textContent=functional.toLocaleString();
    document.getElementById("cardFunctionalPct").textContent=pct(functional);
    document.getElementById("cardPartial").textContent=partial.toLocaleString();
    document.getElementById("cardPartialPct").textContent=pct(partial);
    document.getElementById("cardNotFunctional").textContent=notFunctional.toLocaleString();
    document.getElementById("cardNotFunctionalPct").textContent=pct(notFunctional);
    document.getElementById("cardAbandoned").textContent=abandoned.toLocaleString();
    document.getElementById("cardAbandonedPct").textContent=pct(abandoned);
}

function renderTable(data,title){
    const total=data.reduce((s,d)=>s+Number(d.total),0);
    const tableDiv=document.getElementById("tableContainer");
    tableDiv.innerHTML=`<h2>Summary — ${title}</h2>
        <button class="export-btn" onclick="exportCSV('district')" style="margin-bottom:15px;">📥 Export to CSV</button>
        <div style="overflow-x:auto;">
        <table>
        <thead><tr><th>Functionality Status</th><th>Count</th><th>Percentage</th></tr></thead>
        <tbody>${data.map((d,i)=>`<tr>
            <td><span class="dot" style="background:${COLORS[i%COLORS.length]}"></span>${d.status}</td>
            <td>${Number(d.total).toLocaleString()}</td>
            <td>${((Number(d.total)/total)*100).toFixed(1)}%</td>
        </tr>`).join("")}</tbody>
        <tfoot><tr>
            <td><strong>Total</strong></td>
            <td><strong>${total.toLocaleString()}</strong></td>
            <td><strong>100%</strong></td>
        </tr></tfoot></table></div>`;
}

function fetchData(table="nsanje",TA="",type=""){
    let url=`${API_URL}/data?table=${encodeURIComponent(table)}`;
    if(TA) url+=`&district=${encodeURIComponent(TA)}`;
    if(type) url+=`&type=${encodeURIComponent(type)}`;

    fetch(url).then(res=>res.json()).then(data=>{
        renderCards(data);
        data=data.filter(d=>d.status!==""&&d.status!==null);
        if(data.length===0) return;
        const labels=data.map(d=>d.status);
        const counts=data.map(d=>Number(d.total));
        const colors=labels.map((_,i)=>COLORS[i%COLORS.length]);
        let title=table.charAt(0).toUpperCase()+table.slice(1);
        if(TA) title+=` — ${TA}`;
        if(type) title+=` — ${type}`;

        if(barChart) barChart.destroy();
        barChart=new Chart(barCtx,{type:"bar",data:{labels,datasets:[{label:title,data:counts,backgroundColor:colors}]},
            options:{responsive:true,plugins:{legend:{display:false},title:{display:true,text:`Functionality Status — ${title}`}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}});

        if(doughnutChart) doughnutChart.destroy();
        doughnutChart=new Chart(doughnutCtx,{type:"doughnut",data:{labels,datasets:[{data:counts,backgroundColor:colors}]},
            options:{responsive:true,plugins:{legend:{display:true,position:"bottom"},title:{display:true,text:`Distribution — ${title}`}}}});

        renderTable(data,title);
    }).catch(err=>console.error("Fetch error:",err));
}

// ============ INITIALIZATION ============

const initialTable=document.getElementById("tableSelect").value;
initMap();
fetchData(initialTable);
