function fetchData() {
  fetch('/data')
    .then(r => r.json())
    .then(d => {
      document.getElementById('physics').innerText = d.physics;
      document.getElementById('chemistry').innerText = d.chemistry;
      document.getElementById('math').innerText = d.math;
      document.getElementById('pcm_total').innerText = d.pcm_total;

      // Update last-updated time (local)
      const now = new Date();
      const fmt = now.toLocaleString();
      const lastEl = document.getElementById('lastUpdated');
      if(lastEl) lastEl.innerText = 'Last updated: ' + fmt;

      // Populate logs table (newest first)
      let table = document.getElementById('logsTable');
      table.innerHTML = `
        <tr>
          <th>Date & Time</th>
          <th>Physics</th>
          <th>Chemistry</th>
          <th>Math</th>
          <th>PCM Total</th>
        </tr>`;
      if(!d.log || d.log.length === 0){
        const tr = document.createElement('tr');
        tr.className = 'empty-state';
        tr.innerHTML = `<td colspan="5">No logs yet — press "Log Now" to add an entry.</td>`;
        table.appendChild(tr);
        return;
      }

      for(let i = d.log.length - 1; i >= 0; i--) {
        const row = d.log[i];
        let tr = document.createElement('tr');
        tr.innerHTML = `<td>${row.datetime}</td><td>${row.physics}</td><td>${row.chemistry}</td><td>${row.math}</td><td>${row.pcm}</td>`;
        table.appendChild(tr);
      }
      // Update target UI based on pcm_total (format HH:MM:SS)
      try{
        updateTargetFromPCM(d.pcm_total);
      }catch(e){ console.warn('target update error', e); }
    })
    .catch(err => {
      const lastEl = document.getElementById('lastUpdated');
      if(lastEl) lastEl.innerText = 'Error fetching data';
      console.error('fetchData error', err);
    });
}

// ---------------- Target (client-side) ----------------
function parseHmsToSeconds(hms){
  // Accepts H:MM:SS or HH:MM:SS or MM:SS
  if(!hms || typeof hms !== 'string') return 0;
  const parts = hms.split(':').map(s => parseInt(s,10));
  if(parts.length===3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if(parts.length===2) return parts[0]*60 + parts[1];
  if(parts.length===1) return parts[0];
  return 0;
}

function secsToHms(secs){
  secs = Math.max(0, Math.round(secs));
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = secs%60;
  return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':');
}

function getSavedTargetSeconds(){
  const t = localStorage.getItem('study_target_secs');
  return t ? parseInt(t,10) : 0;
}

function setSavedTargetSeconds(s){ localStorage.setItem('study_target_secs', String(Math.max(0,Math.round(s)))); }

function updateTargetUI(){
  const targetSecs = getSavedTargetSeconds();
  const disp = document.getElementById('targetDisplay');
  if(!disp) return;
  if(targetSecs<=0){ disp.innerText = 'Not set'; document.getElementById('targetProgress').style.width='0%'; return; }
  disp.innerText = secsToHms(targetSecs);
}

function updateTargetFromPCM(pcmStr){
  // pcmStr is total studied time today returned from server like "HH:MM:SS"
  const studied = parseHmsToSeconds(pcmStr);
  const target = getSavedTargetSeconds();
  const remaining = Math.max(0, target - studied);
  const pct = target>0 ? Math.min(100, Math.round((studied/target)*100)) : 0;
  const prog = document.getElementById('targetProgress');
  if(prog) prog.style.width = pct + '%';
  const disp = document.getElementById('targetDisplay');
  if(disp){
    if(target<=0) disp.innerText = 'Not set';
    else disp.innerText = `${secsToHms(studied)} / ${secsToHms(target)} (${pct}%) — left ${secsToHms(remaining)}`;
  }
}

// Edit target flow
document.addEventListener('DOMContentLoaded', ()=>{
  updateTargetUI();
  const editBtn = document.getElementById('editTargetBtn');
  const form = document.getElementById('targetForm');
  const hoursIn = document.getElementById('targetHours');
  const minsIn = document.getElementById('targetMinutes');
  const saveBtn = document.getElementById('saveTargetBtn');
  const cancelBtn = document.getElementById('cancelTargetBtn');
  if(editBtn && form){
    editBtn.addEventListener('click', ()=>{
      // show form and populate with saved value
      const secs = getSavedTargetSeconds();
      hoursIn.value = Math.floor(secs/3600) || '';
      minsIn.value = Math.floor((secs%3600)/60) || '';
      form.style.display = 'flex';
      form.setAttribute('aria-hidden','false');
      editBtn.setAttribute('aria-expanded','true');
    });

    cancelBtn.addEventListener('click', ()=>{
      form.style.display = 'none';
      form.setAttribute('aria-hidden','true');
      editBtn.setAttribute('aria-expanded','false');
    });

    saveBtn.addEventListener('click', ()=>{
      const h = parseInt(hoursIn.value||0,10) || 0;
      const m = parseInt(minsIn.value||0,10) || 0;
      const secs = Math.max(0, h*3600 + m*60);
      // try to persist to device
      fetch(`/settarget?secs=${secs}`)
        .then(r=>{
          if(r.ok){
            setSavedTargetSeconds(secs);
          } else {
            // fallback
            setSavedTargetSeconds(secs);
          }
        })
        .catch(()=>{
          // unreachable device, store locally
          setSavedTargetSeconds(secs);
        })
        .finally(()=>{
          updateTargetUI();
          const pcmText = document.getElementById('pcm_total') ? document.getElementById('pcm_total').innerText : '00:00:00';
          updateTargetFromPCM(pcmText);
          form.style.display = 'none';
          form.setAttribute('aria-hidden','true');
          editBtn.setAttribute('aria-expanded','false');
        });
    });

    // Preset buttons
    const presets = form.querySelectorAll('.preset');
    presets.forEach(btn => {
      btn.addEventListener('click', ()=>{
        const mins = parseInt(btn.getAttribute('data-mins'),10)||0;
        const cur = getSavedTargetSeconds();
        const newSecs = cur + mins*60;
        // try to persist to device
        fetch(`/settarget?secs=${newSecs}`)
          .then(r=>{ if(r.ok) setSavedTargetSeconds(newSecs); else setSavedTargetSeconds(newSecs); })
          .catch(()=> setSavedTargetSeconds(newSecs))
          .finally(()=>{
            updateTargetUI();
            const pcmText = document.getElementById('pcm_total') ? document.getElementById('pcm_total').innerText : '00:00:00';
            updateTargetFromPCM(pcmText);
            // update form inputs
            hoursIn.value = Math.floor(newSecs/3600) || '';
            minsIn.value = Math.floor((newSecs%3600)/60) || '';
          });
      });
    });
  }
});

// On load try to sync from device target, fallback to localStorage
document.addEventListener('DOMContentLoaded', ()=>{
  fetch('/target')
    .then(r=>r.json())
    .then(j=>{
      if(j && typeof j.target_secs !== 'undefined'){
        setSavedTargetSeconds(j.target_secs);
        updateTargetUI();
        const pcmText = document.getElementById('pcm_total') ? document.getElementById('pcm_total').innerText : '00:00:00';
        updateTargetFromPCM(pcmText);
      }
    })
    .catch(()=>{ /* ignore, leave local value */ });
});

function logNow() {
  fetch('/lognow')
    .then(r => r.text())
    .then(d => { alert(d); fetchData(); })
    .catch(e => alert('Failed: ' + e));
}

const clearBtn = document.getElementById("clearLogsBtn");
if(clearBtn){
  clearBtn.classList.add('danger');
  clearBtn.addEventListener("click", function() {
    if (confirm("⚠️ WARNING: This will delete all logged data permanently. Are you sure?")) {
      fetch("/clearlogs")
        .then(response => response.text())
        .then(data => { alert(data); fetchData(); })
        .catch(err => alert("Error: " + err));
    }
  });
}

// Upload CSV and merge logs
function uploadLogs() {
  const fileInput = document.getElementById('logsFile');
  if(!fileInput.files.length){ alert('Select a CSV first'); return; }
  const fd = new FormData();
  fd.append('file', fileInput.files[0], 'logs.csv');
  fetch('/uploadlogs',{ method:'POST', body: fd })
    .then(r=>r.text())
    .then(t=>{ alert(t); fetchData(); })
    .catch(e=>alert('Upload failed: '+e));
}

// NEW: update file label text
(function(){
  const inp = document.getElementById('logsFile');
  const label = document.querySelector('label.file-btn');
  if(inp && label){
    inp.addEventListener('change', () => {
      if(inp.files.length){
        const name = inp.files[0].name;
        label.textContent = '✅ ' + (name.length>24 ? name.slice(0,20)+'...' : name);
        label.classList.add('selected');
      } else {
        label.textContent = '📂 Choose CSV';
        label.classList.remove('selected');
      }
    });
  }

  // (theme toggle removed)
})();

// Add classes to CSV/download buttons for styling
document.addEventListener('DOMContentLoaded', () => {
  // mark primary & download buttons
  const buttons = document.querySelectorAll('.buttons button');
  if(buttons[0]) buttons[0].classList.add('primary');
  if(document.querySelector('.download-link button')) document.querySelector('.download-link button').classList.add('download');

  // initial fetch
  fetchData();
  // Refresh every 5 seconds
  setInterval(fetchData, 5000);
});
