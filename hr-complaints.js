
(function () {
  const $ = id => document.getElementById(id);
  let selected = null;

  const panel = document.createElement("div");
  panel.id = "complaints";
  panel.className = "section";
  panel.innerHTML = `
    <div class="card">
      <h2>HR Complaint & Resolution</h2>
      <div id="complaintForm">
        <label>Category</label>
        <select id="complaintCategory">
          <option>Work Related</option>
          <option>Salary / Incentive</option>
          <option>Attendance / Leave</option>
          <option>Behaviour / Harassment</option>
          <option>Other</option>
        </select>
        <label>Subject</label>
        <input id="complaintSubject" maxlength="150">
        <label>Complaint Details</label>
        <textarea id="complaintDetails" rows="4"></textarea>
        <button id="submitComplaint">Submit Complaint</button>
      </div>
      <p id="complaintNotice" aria-live="polite"></p>
      <button id="refreshComplaints" class="secondary">
        Refresh Complaints
      </button>
      <h3 id="complaintHeading">My Complaints</h3>
      <div id="complaintList"></div>
    </div>
    <div id="complaintThread" class="card hidden">
      <h2 id="complaintTitle"></h2>
      <p id="complaintInfo"></p>
      <p id="complaintDescription"></p>
      <div id="complaintMessages"></div>
      <label>Reply</label>
      <textarea id="complaintReply" rows="3"></textarea>
      <button id="sendComplaintReply">Send Reply</button>
      <div id="complaintAdmin" class="hidden">
        <label>Status</label>
        <select id="complaintStatus">
          <option value="seen">Seen</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <label>Solution / Resolution</label>
        <textarea id="complaintResolution" rows="3"></textarea>
        <button id="saveComplaintStatus">Save Status</button>
      </div>
      <p id="complaintThreadNotice" aria-live="polite"></p>
    </div>
  `;

  const staff = () =>
    currentRole === "hr" || currentRole === "viewer";

  const notice = (id, text) => {
    $(id).textContent = text;
  };

  async function refresh() {
    if (!currentUser) return;
    notice("complaintNotice", "Loading...");
    $("complaintList").replaceChildren();

    let query = getClient()
      .from("hr_complaints")
      .select("*")
      .order("created_at", { ascending: false });

    if (!staff()) {
      query = query.eq("employee_id", currentUser.id);
    }

    const { data, error } = await query;
    if (error) {
      notice("complaintNotice", error.message);
      return;
    }

    notice("complaintNotice", "");
    for (const c of data || []) {
      const button = document.createElement("button");
      button.className = "secondary";
      button.style.display = "block";
      button.style.width = "100%";
      button.style.textAlign = "left";
      button.style.whiteSpace = "normal";
      button.textContent = c.subject + " — " + c.status;
      button.onclick = () => openComplaint(c);
      $("complaintList").append(button);
    }
    if (!data?.length) {
      notice("complaintNotice", "No complaints found.");
    }
  }

  async function submit() {
    const subject = $("complaintSubject").value.trim();
    const details = $("complaintDetails").value.trim();
    if (subject.length < 3 || details.length < 5) {
      notice("complaintNotice", "Enter subject and details.");
      return;
    }

    const { error } = await getClient()
      .from("hr_complaints")
      .insert({
        employee_id: currentUser.id,
        category: $("complaintCategory").value,
        subject,
        details
      });

    if (error) {
      notice("complaintNotice", error.message);
      return;
    }

    $("complaintSubject").value = "";
    $("complaintDetails").value = "";
    await refresh();
    notice("complaintNotice", "Complaint submitted.");
  }

  async function openComplaint(c) {
    selected = c;
    $("complaintThread").classList.remove("hidden");
    $("complaintTitle").textContent = c.subject;
    $("complaintDescription").textContent = c.details;
    $("complaintInfo").textContent =
      "Status: " + c.status +
      " | Seen: " + (c.seen_at ? "Yes" : "No");

    $("complaintAdmin").classList.toggle("hidden", !staff());
    $("complaintStatus").value =
      c.status === "submitted" ? "seen" : c.status;
    $("complaintResolution").value = c.resolution || "";

    if (staff() && !c.seen_at) {
      const { error } = await getClient()
        .from("hr_complaints")
        .update({
          seen_at: new Date().toISOString(),
          seen_by: currentUser.id,
          status: "seen"
        })
        .eq("id", c.id)
        .is("seen_at", null);

      if (!error) {
        c.seen_at = new Date().toISOString();
        c.status = "seen";
        $("complaintInfo").textContent =
          "Status: Seen | Seen: Yes";
      }
    }

    await loadMessages();
    $("complaintThread").scrollIntoView();
  }

  async function loadMessages() {
    if (!selected) return;
    const { data, error } = await getClient()
      .from("hr_complaint_messages")
      .select("*")
      .eq("complaint_id", selected.id)
      .order("created_at");

    if (error) {
      notice("complaintThreadNotice", error.message);
      return;
    }

    $("complaintMessages").replaceChildren();

    for (const m of data || []) {
      const box = document.createElement("div");
      box.className = "request-row";

      const sender = document.createElement("strong");
      sender.textContent =
        m.sender_id === selected.employee_id
          ? "Employee" : "HR / Admin";

      const message = document.createElement("p");
      message.textContent = m.message;

      const date = document.createElement("small");
      date.textContent = new Date(m.created_at)
        .toLocaleString("en-IN");

      box.append(sender, message, date);
      $("complaintMessages").append(box);
    }

    if (selected.resolution) {
      const solution = document.createElement("p");
      solution.textContent =
        "Solution: " + selected.resolution;
      $("complaintMessages").append(solution);
    }
  }

  async function sendReply() {
    if (!selected) return;
    const message = $("complaintReply").value.trim();
    if (!message) return;

    const { error } = await getClient()
      .from("hr_complaint_messages")
      .insert({
        complaint_id: selected.id,
        sender_id: currentUser.id,
        message
      });

    if (error) {
      notice("complaintThreadNotice", error.message);
      return;
    }

    $("complaintReply").value = "";
    await loadMessages();
    notice("complaintThreadNotice", "Reply sent.");
  }

  async function saveStatus() {
    if (!staff() || !selected) return;

    const status = $("complaintStatus").value;
    const resolution = $("complaintResolution").value.trim();

    if (status === "resolved" && !resolution) {
      notice("complaintThreadNotice",
        "Enter solution before resolving.");
      return;
    }

    const { error } = await getClient()
      .from("hr_complaints")
      .update({
        status,
        resolution: resolution || null,
        resolved_at: status === "resolved"
          ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("id", selected.id);

    if (error) {
      notice("complaintThreadNotice", error.message);
      return;
    }

    selected.status = status;
    selected.resolution = resolution;
    $("complaintInfo").textContent =
      "Status: " + status + " | Seen: Yes";

    await loadMessages();
    await refresh();
    notice("complaintThreadNotice", "Status updated.");
  }

  function setupNavigation() {
    if (!currentUser) return;
    const nav = $("navigation");
    if (!nav || nav.querySelector("#complaintNav")) return;

    const button = document.createElement("button");
    button.id = "complaintNav";
    button.className = "secondary";
    button.textContent = staff()
      ? "HR Complaints" : "My HR Complaints";

    button.onclick = () => {
      showSection("complaints");
      refresh();
    };

    nav.append(button);
    $("complaintForm").classList.toggle("hidden", staff());
    $("complaintHeading").textContent =
      staff() ? "All Employee Complaints" : "My Complaints";
  }

  function init() {
    if ($("complaints")) return;
    $("appPage").append(panel);

    $("submitComplaint").onclick = submit;
    $("refreshComplaints").onclick = refresh;
    $("sendComplaintReply").onclick = sendReply;
    $("saveComplaintStatus").onclick = saveStatus;

    new MutationObserver(setupNavigation)
      .observe($("navigation"), { childList: true });

    setupNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
