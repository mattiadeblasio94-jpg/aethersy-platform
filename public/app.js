(function () {
  "use strict";

  var listEl = document.getElementById("req-list");
  var approvazioniEl = document.getElementById("approvazioni-list");
  var formEl = document.getElementById("req-form");
  var textEl = document.getElementById("req-text");
  var senderEl = document.getElementById("req-sender");
  var chipsEl = document.getElementById("req-chips");
  var agentiEl = document.getElementById("agenti-list");
  var statGridEl = document.getElementById("stat-grid");

  var ESEMPI = [
    { mittente: "Giulia Fontana", testo: "Vorrei prenotare una consulenza arredo per il 29/10/2026 alle ore 10:00." },
    { mittente: "Marco Belli", testo: "Buongiorno, vorrei un preventivo per 3 tende da sole per il mio negozio." },
    { mittente: "ElettroLux Srl", testo: "Il nostro ordine è in ritardo, attendiamo un aggiornamento urgente." },
    { mittente: "Cliente anonimo", testo: "A che ora aprite il sabato?" }
  ];
  ESEMPI.forEach(function (ex) {
    var b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = ex.testo.slice(0, 40) + (ex.testo.length > 40 ? "…" : "");
    b.addEventListener("click", function () {
      textEl.value = ex.testo;
      senderEl.value = ex.mittente;
    });
    chipsEl.appendChild(b);
  });

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }

  function statoLabel(stato) {
    var map = {
      in_attesa_revisione_umana: "In attesa di revisione umana",
      nessuna_revisione_necessaria: "Nessuna azione da approvare",
      approvata_in_esecuzione: "Approvata, esecuzione in corso",
      eseguita: "Eseguita (persistenza reale su disco)",
      rifiutata: "Rifiutata"
    };
    return map[stato] || stato;
  }
  function statoClass(stato) {
    if (stato === "eseguita") return "done";
    if (stato === "rifiutata") return "rejected";
    return "pending";
  }

  function renderRequest(r) {
    var el = document.createElement("div");
    el.className = "req-item";
    var azione = r.drafting.azioneProposta;

    var html = '<div class="meta"><span><strong>' + escapeHtml(r.mittente) + '</strong> — ' + new Date(r.creatoIl).toLocaleString("it-IT") + '</span>' +
      '<span class="status-pill ' + statoClass(r.stato) + '">' + statoLabel(r.stato) + '</span></div>';

    html += '<div style="font-size:.9rem;color:#453f66;margin-bottom:.4rem;">"' + escapeHtml(r.testoOriginale) + '"</div>';

    html += '<div class="agent-trace"><span class="agent-name">1 · TriageAgent</span> → ' +
      escapeHtml(r.triage.classification.label) + ' (urgenza: ' + escapeHtml(r.triage.classification.urgency) + ')<br/>' +
      '<span class="tag-real">Reale:</span> ' + escapeHtml(r.triage.reale) + '<br/>' +
      '<span class="tag-sim">Simulato:</span> ' + escapeHtml(r.triage.simulato) + '</div>';

    html += '<div class="agent-trace"><span class="agent-name">2 · DraftingAgent</span> → ' + escapeHtml(azione.titolo) + '<br/>' +
      '<span class="tag-real">Reale:</span> ' + escapeHtml(r.drafting.reale) + '<br/>' +
      '<span class="tag-sim">Simulato:</span> ' + escapeHtml(r.drafting.simulato) + '</div>';

    if (azione.conflitto) {
      html += '<div class="conflict-box">Conflitto con l\'agenda sintetica rilevato: serve conferma esplicita prima di approvare.</div>';
    }

    if (azione.testoProposto) {
      html += '<textarea class="draft-box" data-id="' + r.id + '" ' + (r.stato !== "in_attesa_revisione_umana" ? "disabled" : "") + '>' +
        escapeHtml((r.revisione && r.revisione.testoFinaleApprovato) || azione.testoProposto) + '</textarea>';
    }

    if (r.stato === "in_attesa_revisione_umana") {
      html += '<div class="action-row">';
      if (azione.conflitto) {
        html += '<label class="ack-row"><input type="checkbox" class="ack-conflitto" data-id="' + r.id + '" /> Confermo di aver verificato il conflitto</label>';
      }
      html += '<button class="primary btn-approva" data-id="' + r.id + '">Approva ed esegui</button>' +
        '<button class="ghost btn-rifiuta" data-id="' + r.id + '">Rifiuta</button>' +
        '</div>';
    } else if (r.esecuzione) {
      html += '<div style="font-size:.82rem;color:#5c577c;margin-top:.4rem;">Eseguita il ' + new Date(r.esecuzione.eseguitoIl).toLocaleString("it-IT") + ' — persistita in data/outbox.json (vedi registro esecuzioni).<br/>' + escapeHtml(r.esecuzione.nota) + '</div>';
    } else if (r.revisione && r.revisione.motivo) {
      html += '<div style="font-size:.82rem;color:#5c577c;margin-top:.4rem;">Rifiutata: ' + escapeHtml(r.revisione.motivo) + '</div>';
    }

    el.innerHTML = html;
    return el;
  }

  function handleListClick(e) {
    var approva = e.target.closest(".btn-approva");
    var rifiuta = e.target.closest(".btn-rifiuta");
    var container = e.currentTarget;
    if (approva) {
      var id = approva.getAttribute("data-id");
      var textarea = container.querySelector('.draft-box[data-id="' + id + '"]');
      var ack = container.querySelector('.ack-conflitto[data-id="' + id + '"]');
      fetch("/api/richieste/" + id + "/approva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testoModificato: textarea ? textarea.value : undefined,
          confermaConflitto: ack ? ack.checked : false
        })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.error) { alert("Impossibile approvare: " + res.error + (res.dettaglio ? " — " + res.dettaglio : "")); }
          loadRequests();
        });
    }
    if (rifiuta) {
      var id2 = rifiuta.getAttribute("data-id");
      var motivo = prompt("Motivo del rifiuto (facoltativo):") || "";
      fetch("/api/richieste/" + id2 + "/rifiuta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo })
      })
        .then(function (r) { return r.json(); })
        .then(function () { loadRequests(); });
    }
  }
  listEl.addEventListener("click", handleListClick);
  approvazioniEl.addEventListener("click", handleListClick);

  function loadRequests() {
    fetch("/api/richieste")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        listEl.innerHTML = "";
        approvazioniEl.innerHTML = "";
        if (!data.length) {
          listEl.innerHTML = '<p class="empty-state">Nessuna richiesta ancora. Invia la prima richiesta sopra.</p>';
        } else {
          data.forEach(function (r) { listEl.appendChild(renderRequest(r)); });
        }
        var pending = data.filter(function (r) { return r.stato === "in_attesa_revisione_umana"; });
        if (!pending.length) {
          approvazioniEl.innerHTML = '<p class="empty-state">Nessuna richiesta in attesa di approvazione.</p>';
        } else {
          pending.forEach(function (r) { approvazioniEl.appendChild(renderRequest(r)); });
        }
        renderDashboard(data);
      });
  }

  function renderDashboard(data) {
    data = data || [];
    var pending = data.filter(function (r) { return r.stato === "in_attesa_revisione_umana"; }).length;
    var eseguite = data.filter(function (r) { return r.stato === "eseguita"; }).length;
    var rifiutate = data.filter(function (r) { return r.stato === "rifiutata"; }).length;
    var stats = [
      { label: "Richieste totali", value: data.length },
      { label: "In attesa di approvazione", value: pending },
      { label: "Eseguite (reale su disco)", value: eseguite },
      { label: "Rifiutate", value: rifiutate }
    ];
    statGridEl.innerHTML = stats.map(function (s) {
      return '<div class="stat-card"><div class="stat-value">' + s.value + '</div><div class="stat-label">' + escapeHtml(s.label) + '</div></div>';
    }).join("");
  }

  function renderAgents(agents) {
    agentiEl.innerHTML = "";
    agents.forEach(function (a) {
      var card = document.createElement("div");
      card.className = "card agent-card";
      card.innerHTML =
        '<div class="meta"><span><strong>' + escapeHtml(a.nome) + '</strong></span>' +
        '<label class="ack-row"><input type="checkbox" class="agent-toggle" data-id="' + a.id + '" ' + (a.abilitato ? "checked" : "") + ' /> Abilitato</label></div>' +
        '<div style="font-size:.88rem;color:#453f66;margin-bottom:.5rem;">' + escapeHtml(a.ruolo) + '</div>' +
        '<textarea class="draft-box agent-instr" data-id="' + a.id + '">' + escapeHtml(a.istruzioni) + '</textarea>' +
        '<div class="action-row"><button class="primary btn-salva-agente" data-id="' + a.id + '">Salva configurazione</button></div>';
      agentiEl.appendChild(card);
    });
  }

  function loadAgents() {
    fetch("/api/agenti")
      .then(function (r) { return r.json(); })
      .then(function (agents) { renderAgents(agents); });
  }

  agentiEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-salva-agente");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    var toggle = agentiEl.querySelector('.agent-toggle[data-id="' + id + '"]');
    var instr = agentiEl.querySelector('.agent-instr[data-id="' + id + '"]');
    fetch("/api/agenti/" + id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ abilitato: toggle.checked, istruzioni: instr.value })
    })
      .then(function (r) { return r.json(); })
      .then(function () { loadAgents(); });
  });

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var testo = textEl.value.trim();
    if (!testo) return;
    fetch("/api/richieste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testo: testo, mittente: senderEl.value.trim() || "Cliente sintetico" })
    })
      .then(function (r) { return r.json(); })
      .then(function () {
        textEl.value = "";
        loadRequests();
      });
  });

  var tabButtons = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");
  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      tabButtons.forEach(function (b) { b.classList.remove("active"); });
      tabPanels.forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("tab-" + btn.getAttribute("data-tab")).classList.add("active");
    });
  });

  loadRequests();
  loadAgents();
  setInterval(loadRequests, 4000);
})();
