// Helper: safely get nested property
function get(obj, path, fallback = undefined) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : fallback), obj);
}

// Format logs as a list
function renderLogs(logs) {
  if (!Array.isArray(logs) || logs.length === 0) return '<div class="logs-title">No logs available.</div>';
  return `
    <div class="logs-title">Pipeline Logs</div>
    <ul class="logs-list">
      ${logs.map(log => `<li>${log}</li>`).join('')}
    </ul>
  `;
}

// Format supervisor decision (robust pretty rendering)
function renderSupervisorDecision(decision) {
  if (!decision) return '';
  // If it's an object, pretty print as JSON with some formatting
  if (typeof decision === 'object') {
    // Try to render key fields if present
    let html = '';
    if ('status' in decision || 'missing' in decision || 'revisionNeeded' in decision || 'feedback' in decision) {
      html += `<div><b>Status:</b> <span style="color:${decision.status === 'ok' ? '#00c2b2' : '#ffb347'}">${decision.status}</span></div>`;
      if (Array.isArray(decision.missing) && decision.missing.length > 0) {
        html += `<div><b>Missing:</b> ${decision.missing.join(', ')}</div>`;
      }
      if (Array.isArray(decision.revisionNeeded) && decision.revisionNeeded.length > 0) {
        html += `<div><b>Revision Needed:</b> ${decision.revisionNeeded.join(', ')}</div>`;
      }
      if (decision.feedback) {
        html += `<div style="margin-top:0.5em;"><b>Feedback:</b><br><span style="white-space:pre-line;">${typeof decision.feedback === 'string' ? decision.feedback : JSON.stringify(decision.feedback, null, 2)}</span></div>`;
      }
    } else {
      html += `<pre>${JSON.stringify(decision, null, 2)}</pre>`;
    }
    return `
      <div class="supervisor-decision-title">Supervisor Decision</div>
      <div class="supervisor-decision-content">${html}</div>
    `;
  }
  // If it's a string, just show it
  return `
    <div class="supervisor-decision-title">Supervisor Decision</div>
    <div class="supervisor-decision-content">${decision}</div>
  `;
}

// Validate API response structure
function validateResponse(data) {
  if (!data || typeof data !== 'object') return false;
  if (!('output' in data)) return false;
  // Accept supervisorDecision and logs at either root or output level
  const output = data.output;
  if (!output) return false;
  return true;
}

// Form submission logic

document.getElementById('jiraForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  // Clear the result div when submit is clicked
  const resultDiv = document.getElementById('result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div class="spinner" role="status" aria-live="polite" aria-label="Loading"></div>';

  // Add animated shadow to the card
  const jiraCard = document.querySelector('.jira-card');
  jiraCard.classList.add('processing');

  // Disable submit button during processing
  const submitBtn = document.querySelector('.jira-submit-btn');
  submitBtn.disabled = true;
  submitBtn.style.opacity = '0.7';
  submitBtn.style.cursor = 'not-allowed';

  const key = document.getElementById('key').value;
  const summary = document.getElementById('summary').value;
  const description = document.getElementById('description').value;

  // Construct minimal Jira-like payload
  const payload = {
    issue: {
      key,
      fields: {
        summary,
        description
      }
    }
  };

  try {
    const res = await fetch('/api/story/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!validateResponse(data)) {
      resultDiv.innerHTML = '<div class="error-message">Unexpected API response structure.</div>' +
        '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
      return;
    }
    // Extract supervisorDecision and logs (try both root and output)
    const output = data.output || {};
    const supervisorDecision = get(output, 'supervisorDecision') || get(data, 'supervisorDecision');
    const logs = get(output, 'logs') || get(data, 'logs');
    let html = '';
    if (supervisorDecision) {
      html += `<div class="supervisor-decision">${renderSupervisorDecision(supervisorDecision)}</div>`;
    }
    if (logs) {
      html += `<div class="logs-section">${renderLogs(logs)}</div>`;
    }
    if (!supervisorDecision && !logs) {
      html += '<div class="logs-title">No supervisor decision or logs found in response.</div>';
    }
    // Always allow user to expand/copy full JSON for debugging
    html += '<details style="margin-top:1em;"><summary style="cursor:pointer;color:#a78bfa;font-weight:600;">Show Raw JSON</summary><pre style="margin-top:0.7em;">' +
      JSON.stringify(data, null, 2) + '</pre></details>';
    resultDiv.innerHTML = html;
  } catch (err) {
    resultDiv.innerHTML = '<div class="error-message">Error loading result.</div>';
  } finally {
    // Remove animated shadow and re-enable submit button
    jiraCard.classList.remove('processing');
    submitBtn.disabled = false;
    submitBtn.style.opacity = '';
    submitBtn.style.cursor = '';
  }
});
