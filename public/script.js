const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const chartCanvas = document.getElementById('chart');
const documentUploadBtn = document.getElementById('uploadDocumentBtn');
const documentUploadInput = document.getElementById('documentUpload');
const documentUploadStatus = document.getElementById('documentUploadStatus');
const uploadBtn = document.getElementById('uploadBtn');
const datasetUpload = document.getElementById('datasetUpload');

let chart;
let messages = [];
let ws; // WebSocket connection

// ====================== WEBSOCKET HANDLING ======================
function initWebSocket() {
  // Connect to WebSocket server (ws:// for HTTP, wss:// for HTTPS)
  ws = new WebSocket(`ws://${window.location.host}`);

  ws.onopen = () => {
    console.log('WebSocket connection established');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);

    const loadingDiv = document.querySelector('.spinner-container');
    if (loadingDiv) loadingDiv.remove();

    if (data.error) {
      showError(data.message || data.human_answer);
      return;
    }

    switch (data.type) {
      case 'chart':
        renderChartData(data);
        break;
      case 'document':
        showDocumentResults(data);
        break;
      case 'sql':
        showSQLResults(data);
        break;
      default:
        showError('Unknown response type');
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected - attempting reconnect...');
    setTimeout(initWebSocket, 3000); // Reconnect after 3 seconds
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    showError('Connection error - falling back to HTTP');
    // Fallback to HTTP if WebSocket fails
    sendButton.onclick = sendViaHTTP;
  };
}

// ====================== MESSAGE HANDLING ======================
let isSending=false;
function sendMessage() {
  if(isSending) return;
  isSending=true;
  const message = userInput.value.trim();
  userInput.value = '';
  if (!message) {
    isSending=false;
    return;
  }
  addMessageToChat('user', message);
  userInput.value = '';

  showLoadingIndicator();
  try {
    if (ws?.readyState === WebSocket.OPEN) {
      // Send ONLY the new message, not the full history
      ws.send(JSON.stringify({
        type: 'chat',
        messages: [{ role: 'user', content: message }] // No duplicates
      }));
    } else {
      sendViaHTTP();
    }
  } finally {
    isSending = false;
  }
}
  // if (ws && ws.readyState === WebSocket.OPEN) {
  //   messages.push({ role: 'user', content: message });
  //   ws.send(JSON.stringify({
  //     type: 'chat',
  //     messages: messages
  //   }));
  // } else {
  //   sendViaHTTP();
  // }


// HTTP fallback
async function sendViaHTTP() {
  const message = userInput.value.trim();
  if (!message) return;

  try {
    const response = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...messages, { role: 'user', content: message }] })
    });
    
    const data = await response.json();
    handleResponse(data);
  } catch (error) {
    showError(error.message);
  }
}

// ====================== UI UPDATES ======================
function addMessageToChat(role, content) {
  messages.push({ role, content });
  const messageDiv = document.createElement('div');
  messageDiv.className = role === 'user' ? 'user-message' : 'bot-message';
  messageDiv.innerHTML = `<b>${role === 'user' ? 'You' : 'Bot'}:</b> ${content}`;
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showLoadingIndicator() {
  const loadingDiv = document.createElement('div');
  loadingDiv.className = 'spinner-container';
  loadingDiv.innerHTML = '<div class="spinner"></div>';
  chatBox.appendChild(loadingDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.innerHTML = `<b>Error:</b> ${message}`;
  chatBox.appendChild(errorDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ====================== RESPONSE HANDLERS ======================
function handleResponse(data) {
  if (data.error) {
    showError(data.human_answer || data.message);
    return;
  }

  if (data.chart_data) {
    renderChartData(data);
  } else if (data.answers) {
    showDocumentResults(data);
  } else {
    showSQLResults(data);
  }
}

function renderChartData(data) {
  // Destroy previous chart if exists
  if (chart) chart.destroy();

  const chartData = data.chart_data;
  chartCanvas.style.display = 'block';

  // Prepare data for Chart.js
  const chartType = determineChartType(chartData);
  const colors = generateChartColors(chartData.labels.length);

  chart = new Chart(chartCanvas, {
    type: chartType,
    data: {
      labels: chartData.labels,
      datasets: [{
        label: chartData.datasets[0].label,
        data: chartData.datasets[0].data,
        backgroundColor: colors,
        borderColor: '#333',
        borderWidth: 1
      }]
    },
    options: getChartOptions(chartType, chartData)
  });

  addMessageToChat('bot', `Here's your chart: ${data.human_answer || ''}`);
}

function showDocumentResults(data) {
  let html = '';
  data.answers.forEach(answer => {
    const cleanAnswer = answer.answer
      .replace(/\*\*/g, '')
      .replace(/-\s/g, '<br>- ')
      .trim();
    
    html += `
      <div class="document-response">
        <b>From ${answer.document_info.name}:</b>
        <div class="document-answer">${cleanAnswer}</div>
        <small>Source: ${answer.document_info.url}</small>
      </div>
    `;
  });
  
  const container = document.createElement('div');
  container.className = 'bot-message';
  container.innerHTML = html;
  chatBox.appendChild(container);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showSQLResults(data) {
  let formattedResult = "";
  if (data.db_result?.rows?.length > 0) {
    data.db_result.rows.forEach(row => {
      formattedResult += Object.values(row).join(' | ') + "<br>";
    });
  } else {
    formattedResult = "No data found.";
  }

  const resultDiv = document.createElement('div');
  resultDiv.className = 'bot-message';
  resultDiv.innerHTML = `
    <div><b>SQL Query:</b> <code>${data.sql_query}</code></div>
    <div><b>Results:</b><br>${formattedResult}</div>
    <div><b>Summary:</b> ${data.human_answer}</div>
  `;
  chatBox.appendChild(resultDiv);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// ====================== CHART UTILITIES ======================
function determineChartType(chartData) {
  // Use server suggestion if available
  if (chartData.suggestedChartType) {
    return chartData.suggestedChartType;
  }
  
  // Auto-detect based on data
  const isDate = chartData.labels.some(label => isDateLike(label));
  const fewCategories = chartData.labels.length <= 5;
  
  if (isDate) return 'line';
  if (fewCategories) return 'pie';
  return 'bar';
}

function isDateLike(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || 
         /^\w+ \d{1,2}, \d{4}$/.test(value) ||
         /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value);
}

function generateChartColors(count) {
  const colors = [];
  const hueStep = 360 / count;
  for (let i = 0; i < count; i++) {
    colors.push(`hsl(${i * hueStep}, 70%, 60%)`);
  }
  return colors;
}

function getChartOptions(chartType, chartData) {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.raw;
            const percentage = chartData.percentages?.[context.dataIndex] || '';
            return `${label}: ${value}${percentage ? ` (${percentage})` : ''}`;
          }
        }
      }
    }
  };

  // Type-specific options
  if (chartType === 'line') {
    return {
      ...commonOptions,
      scales: {
        y: { beginAtZero: true, title: { display: true, text: chartData.y_label } },
        x: { 
          type: 'time',
          time: { parser: 'YYYY-MM-DD', tooltipFormat: 'll' },
          title: { display: true, text: chartData.x_label }
        }
      }
    };
  }

  return commonOptions;
}

// ====================== DOCUMENT UPLOAD ======================
documentUploadBtn.addEventListener('click', async () => {
  if (!documentUploadInput.files.length) return;
  
  documentUploadStatus.innerHTML = '<span class="uploading">Uploading document...</span>';
  
  try {
    const formData = new FormData();
    formData.append('document', documentUploadInput.files[0]);
    
    const res = await fetch('/upload-document', {
      method: 'POST',
      body: formData
    });
    
    const result = await res.json();
    
    if (result.success) {
      documentUploadStatus.innerHTML = `
        <span class="success">✓ Document uploaded!</span>
        <div>Name: ${result.document.name}</div>
      `;
      addMessageToChat('system', `Document "${result.document.name}" uploaded successfully.`);
    } else {
      documentUploadStatus.innerHTML = '<span class="error">✗ Upload failed</span>';
    }
  } catch (err) {
    documentUploadStatus.innerHTML = `<span class="error">✗ ${err.message}</span>`;
  }
});

// ====================== TRAINING DATA UPLOAD ======================
uploadBtn.addEventListener('click', async () => {
  if (!datasetUpload.files.length) return;
  
  const statusDiv = document.getElementById('uploadStatus');
  statusDiv.innerHTML = '<span class="uploading">Processing dataset...</span>';
  
  try {
    const formData = new FormData();
    formData.append('file', datasetUpload.files[0]);
    
    const res = await fetch('/upload-dataset', {
      method: 'POST',
      body: formData
    });
    
    const result = await res.json();
    
    if (result.status === "exists") {
      statusDiv.innerHTML = '<span class="warning">ℹ️ Dataset already exists</span>';
    } else if (result.added > 0) {
      statusDiv.innerHTML = `<span class="success">✓ Added ${result.added} examples</span>`;
      updateTrainingStats();
    } else {
      statusDiv.innerHTML = '<span class="warning">⚠️ No new examples added</span>';
    }
  } catch (err) {
    statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
  }
});

// ====================== TRAINING STATUS ======================
async function updateTrainingStats() {
  const res = await fetch('/training-status');
  const data = await res.json();
  document.getElementById('exampleCount').textContent = data.example_count;
  
  if (data.last_updated) {
    const date = new Date(data.last_updated * 1000);
    document.getElementById('lastTrained').textContent = date.toLocaleString();
  }
}

// ====================== INITIALIZATION ======================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize WebSocket
  initWebSocket();

  // Set up event listeners
  // sendButton.addEventListener('click', sendMessage);
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Load initial training stats
  updateTrainingStats();
});






