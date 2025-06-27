// Complete script.js with spinner and line chart fixes
const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const chartCanvas = document.getElementById('chart').getContext('2d');
const documentUploadBtn = document.getElementById('uploadDocumentBtn');
const documentUploadInput = document.getElementById('documentUpload');
const documentUploadStatus = document.getElementById('documentUploadStatus');
const uploadBtn = document.getElementById('uploadBtn');
const datasetUpload = document.getElementById('datasetUpload');

let chart;
let messages = [];
let ws;

// Spinner element creation
const spinnerContainer = document.createElement('div');
spinnerContainer.id = 'globalSpinner';
spinnerContainer.className = 'spinner-container';
spinnerContainer.style.display = 'none';
spinnerContainer.innerHTML = `
  <div class="spinner"></div>
  <div class="spinner-text">Loading...</div>
`;
document.body.appendChild(spinnerContainer);

// Spinner control functions
function showSpinner() {
  document.getElementById('globalSpinner').style.display = 'flex';
}

function hideSpinner() {
  document.getElementById('globalSpinner').style.display = 'none';
}

// Initialize WebSocket connection
function initWebSocket() {
    showSpinner();
    ws = new WebSocket(`ws://${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connection established');
        hideSpinner();
    };

    ws.onmessage = (event) => {
        try {
            showSpinner();
            const data = JSON.parse(event.data);
            console.log('Received data:', data);

            if (data.error) {
                showError(data.message || data.human_answer);
                hideSpinner();
                return;
            }

            if (data.chart_data) {
                renderFixedChart(data);
            } else if (data.answers) {
                showDocumentResults(data);
            } else {
                showSQLResults(data);
            }
            hideSpinner();
        } catch (error) {
            console.error('Error processing message:', error);
            showError('Failed to process server response');
            hideSpinner();
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected - attempting reconnect...');
        hideSpinner();
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showError('Connection error');
        hideSpinner();
    };
}

// Fixed chart rendering function
function renderFixedChart(data) {
    try {
        showSpinner();
        if (chart) {
            chart.destroy();
        }

        const chartContainer = document.getElementById('chartContainer');
        chartContainer.style.display = 'block';

        const chartData = data.chart_data;
        console.log('Chart data received:', chartData);

        // Determine chart type with priority to backend suggestion
        let chartType = chartData.suggestedChartType || 
                       (chartData.chart_type || 
                       (chartData.labels && chartData.labels.length <= 5 ? 'pie' : 'bar'));

        // Force line chart for year-based data
        const isYearData = chartData.x_label?.toLowerCase().includes('year') || 
                         data.human_answer?.toLowerCase().includes('by year');
        if (isYearData) {
            chartType = 'line';
        }

        // Get values from either datasets[0].data or values array
        const values = chartData.datasets?.[0]?.data || chartData.values || [];
        if (values.length === 0) {
            throw new Error('No data values found in chart data');
        }

        // Create the chart with proper configuration
        chart = new Chart(chartCanvas, {
            type: chartType,
            data: {
                labels: chartData.labels || [],
                datasets: [{
                    label: chartData.y_label || 'Value',
                    data: values,
                    backgroundColor: chartType === 'line' ? 
                        'rgba(54, 162, 235, 0.2)' : 
                        generateChartColors(chartData.labels?.length || values.length),
                    borderColor: chartType === 'line' ? 
                        'rgba(54, 162, 235, 1)' : '#333',
                    borderWidth: chartType === 'line' ? 2 : 1,
                    pointBackgroundColor: chartType === 'line' ? 
                        'rgba(54, 162, 235, 1)' : undefined,
                    pointRadius: chartType === 'line' ? 4 : undefined,
                    fill: chartType === 'line' ? false : true,
                    tension: chartType === 'line' ? 0.1 : 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'right',
                        labels: {
                            font: {
                                size: 14
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.dataset.label || '';
                                const value = context.parsed?.y ?? context.raw;
                                return `${label}: ${value}`;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: data.human_answer || 'Chart Data',
                        font: {
                            size: 16
                        }
                    }
                },
                scales: chartType === 'line' ? {
                    y: {
                        beginAtZero: false,
                        title: { 
                            display: true, 
                            text: chartData.y_label || 'Value',
                            font: {
                                weight: 'bold'
                            }
                        }
                    },
                    x: {
                        title: { 
                            display: true, 
                            text: chartData.x_label || 'Year',
                            font: {
                                weight: 'bold'
                            }
                        }
                    }
                } : {}
            }
        });

        addMessageToChat('bot', data.human_answer || `Here's your ${chartType} chart`);
        hideSpinner();

    } catch (error) {
        console.error('Chart rendering error:', error);
        showError(`Failed to display chart: ${error.message}`);
        if (data.sql_query) {
            showSQLResults(data);
        }
        hideSpinner();
    }
}

// Generate colors for charts
function generateChartColors(count) {
    const colors = [];
    const hueStep = 360 / Math.max(1, count);
    for (let i = 0; i < count; i++) {
        colors.push(`hsl(${i * hueStep}, 70%, 60%)`);
    }
    return colors;
}

// Add message to chat
function addMessageToChat(role, content) {
    messages.push({ role, content });
    const messageDiv = document.createElement('div');
    messageDiv.className = role === 'user' ? 'user-message' : 'bot-message';
    messageDiv.innerHTML = `<b>${role === 'user' ? 'You' : 'Bot'}:</b> ${content}`;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `<b>Error:</b> ${message}`;
    chatBox.appendChild(errorDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Show document results
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

// Show SQL results
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
        ${data.human_answer ? `<div><b>Summary:</b> ${data.human_answer}</div>` : ''}
    `;
    chatBox.appendChild(resultDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// Document upload handler
async function handleDocumentUpload() {
    if (!documentUploadInput.files.length) return;
    
    showSpinner();
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
    } finally {
        hideSpinner();
    }
}

// Dataset upload handler
async function handleDatasetUpload() {
    if (!datasetUpload.files.length) return;
    
    showSpinner();
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
    } finally {
        hideSpinner();
    }
}

// Update training stats
async function updateTrainingStats() {
    try {
        showSpinner();
        const res = await fetch('/training-status');
        const data = await res.json();
        document.getElementById('exampleCount').textContent = data.example_count;
        
        if (data.last_updated) {
            const date = new Date(data.last_updated * 1000);
            document.getElementById('lastTrained').textContent = date.toLocaleString();
        }
    } catch (error) {
        console.error('Error fetching training stats:', error);
    } finally {
        hideSpinner();
    }
}

// Send message handler
function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    showSpinner();
    addMessageToChat('user', message);
    userInput.value = '';

    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'chat',
            messages: [{ role: 'user', content: message }]
        }));
    } else {
        hideSpinner();
        showError('Connection not ready');
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();

    // Set up event listeners
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    documentUploadBtn.addEventListener('click', handleDocumentUpload);
    uploadBtn.addEventListener('click', handleDatasetUpload);

    // Load initial training stats
    updateTrainingStats();
});














































// Working code with line chart..................

// // Complete script.js with fixed line chart support
// const chatBox = document.getElementById('chatBox');
// const userInput = document.getElementById('userInput');
// const sendButton = document.getElementById('sendButton');
// const chartCanvas = document.getElementById('chart').getContext('2d');
// const documentUploadBtn = document.getElementById('uploadDocumentBtn');
// const documentUploadInput = document.getElementById('documentUpload');
// const documentUploadStatus = document.getElementById('documentUploadStatus');
// const uploadBtn = document.getElementById('uploadBtn');
// const datasetUpload = document.getElementById('datasetUpload');

// let chart;
// let messages = [];
// let ws;

// // Initialize WebSocket connection
// function initWebSocket() {
//     ws = new WebSocket(`ws://${window.location.host}`);

//     ws.onopen = () => {
//         console.log('WebSocket connection established');
//     };

//     ws.onmessage = (event) => {
//         try {
//             const data = JSON.parse(event.data);
//             console.log('Received data:', data);

//             if (data.error) {
//                 showError(data.message || data.human_answer);
//                 return;
//             }

//             if (data.chart_data) {
//                 renderFixedChart(data);
//             } else if (data.answers) {
//                 showDocumentResults(data);
//             } else {
//                 showSQLResults(data);
//             }
//         } catch (error) {
//             console.error('Error processing message:', error);
//             showError('Failed to process server response');
//         }
//     };

//     ws.onclose = () => {
//         console.log('WebSocket disconnected - attempting reconnect...');
//         setTimeout(initWebSocket, 3000);
//     };

//     ws.onerror = (error) => {
//         console.error('WebSocket error:', error);
//         showError('Connection error');
//     };
// }

// // Fixed chart rendering function
// function renderFixedChart(data) {
//     try {
//         // Destroy previous chart if exists
//         if (chart) {
//             chart.destroy();
//         }

//         const chartContainer = document.getElementById('chartContainer');
//         chartContainer.style.display = 'block';

//         const chartData = data.chart_data;
//         console.log('Chart data received:', chartData);

//         // Determine chart type with priority to backend suggestion
//         let chartType = chartData.suggestedChartType || 
//                        (chartData.chart_type || 
//                        (chartData.labels && chartData.labels.length <= 5 ? 'pie' : 'bar'));

//         // Force line chart for year-based data
//         const isYearData = chartData.x_label?.toLowerCase().includes('year') || 
//                          data.human_answer?.toLowerCase().includes('by year');
//         if (isYearData) {
//             chartType = 'line';
//         }

//         // Get values from either datasets[0].data or values array
//         const values = chartData.datasets?.[0]?.data || chartData.values || [];
//         if (values.length === 0) {
//             throw new Error('No data values found in chart data');
//         }

//         // Create the chart with proper configuration
//         chart = new Chart(chartCanvas, {
//             type: chartType,
//             data: {
//                 labels: chartData.labels || [],
//                 datasets: [{
//                     label: chartData.y_label || 'Value',
//                     data: values,
//                     backgroundColor: chartType === 'line' ? 
//                         'rgba(54, 162, 235, 0.2)' : 
//                         generateChartColors(chartData.labels?.length || values.length),
//                     borderColor: chartType === 'line' ? 
//                         'rgba(54, 162, 235, 1)' : '#333',
//                     borderWidth: chartType === 'line' ? 2 : 1,
//                     pointBackgroundColor: chartType === 'line' ? 
//                         'rgba(54, 162, 235, 1)' : undefined,
//                     pointRadius: chartType === 'line' ? 4 : undefined,
//                     fill: chartType === 'line' ? false : true,
//                     tension: chartType === 'line' ? 0.1 : 0
//                 }]
//             },
//             options: {
//                 responsive: true,
//                 maintainAspectRatio: false,
//                 plugins: {
//                     legend: { 
//                         position: 'right',
//                         labels: {
//                             font: {
//                                 size: 14
//                             }
//                         }
//                     },
//                     tooltip: {
//                         callbacks: {
//                             label: (context) => {
//                                 const label = context.dataset.label || '';
//                                 const value = context.parsed?.y ?? context.raw;
//                                 return `${label}: ${value}`;
//                             }
//                         }
//                     },
//                     title: {
//                         display: true,
//                         text: data.human_answer || 'Chart Data',
//                         font: {
//                             size: 16
//                         }
//                     }
//                 },
//                 scales: chartType === 'line' ? {
//                     y: {
//                         beginAtZero: false,
//                         title: { 
//                             display: true, 
//                             text: chartData.y_label || 'Value',
//                             font: {
//                                 weight: 'bold'
//                             }
//                         }
//                     },
//                     x: {
//                         title: { 
//                             display: true, 
//                             text: chartData.x_label || 'Year',
//                             font: {
//                                 weight: 'bold'
//                             }
//                         }
//                     }
//                 } : {}
//             }
//         });

//         addMessageToChat('bot', data.human_answer || `Here's your ${chartType} chart`);

//     } catch (error) {
//         console.error('Chart rendering error:', error);
//         showError(`Failed to display chart: ${error.message}`);
//         if (data.sql_query) {
//             showSQLResults(data);
//         }
//     }
// }

// // Generate colors for charts
// function generateChartColors(count) {
//     const colors = [];
//     const hueStep = 360 / Math.max(1, count);
//     for (let i = 0; i < count; i++) {
//         colors.push(`hsl(${i * hueStep}, 70%, 60%)`);
//     }
//     return colors;
// }

// // Add message to chat
// function addMessageToChat(role, content) {
//     messages.push({ role, content });
//     const messageDiv = document.createElement('div');
//     messageDiv.className = role === 'user' ? 'user-message' : 'bot-message';
//     messageDiv.innerHTML = `<b>${role === 'user' ? 'You' : 'Bot'}:</b> ${content}`;
//     chatBox.appendChild(messageDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Show error message
// function showError(message) {
//     const errorDiv = document.createElement('div');
//     errorDiv.className = 'error-message';
//     errorDiv.innerHTML = `<b>Error:</b> ${message}`;
//     chatBox.appendChild(errorDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Show document results
// function showDocumentResults(data) {
//     let html = '';
//     data.answers.forEach(answer => {
//         const cleanAnswer = answer.answer
//             .replace(/\*\*/g, '')
//             .replace(/-\s/g, '<br>- ')
//             .trim();
        
//         html += `
//             <div class="document-response">
//                 <b>From ${answer.document_info.name}:</b>
//                 <div class="document-answer">${cleanAnswer}</div>
//                 <small>Source: ${answer.document_info.url}</small>
//             </div>
//         `;
//     });
    
//     const container = document.createElement('div');
//     container.className = 'bot-message';
//     container.innerHTML = html;
//     chatBox.appendChild(container);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Show SQL results
// function showSQLResults(data) {
//     let formattedResult = "";
//     if (data.db_result?.rows?.length > 0) {
//         data.db_result.rows.forEach(row => {
//             formattedResult += Object.values(row).join(' | ') + "<br>";
//         });
//     } else {
//         formattedResult = "No data found.";
//     }

//     const resultDiv = document.createElement('div');
//     resultDiv.className = 'bot-message';
//     resultDiv.innerHTML = `
//         <div><b>SQL Query:</b> <code>${data.sql_query}</code></div>
//         <div><b>Results:</b><br>${formattedResult}</div>
//         ${data.human_answer ? `<div><b>Summary:</b> ${data.human_answer}</div>` : ''}
//     `;
//     chatBox.appendChild(resultDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Document upload handler
// async function handleDocumentUpload() {
//     if (!documentUploadInput.files.length) return;
    
//     documentUploadStatus.innerHTML = '<span class="uploading">Uploading document...</span>';
    
//     try {
//         const formData = new FormData();
//         formData.append('document', documentUploadInput.files[0]);
        
//         const res = await fetch('/upload-document', {
//             method: 'POST',
//             body: formData
//         });
        
//         const result = await res.json();
        
//         if (result.success) {
//             documentUploadStatus.innerHTML = `
//                 <span class="success">✓ Document uploaded!</span>
//                 <div>Name: ${result.document.name}</div>
//             `;
//             addMessageToChat('system', `Document "${result.document.name}" uploaded successfully.`);
//         } else {
//             documentUploadStatus.innerHTML = '<span class="error">✗ Upload failed</span>';
//         }
//     } catch (err) {
//         documentUploadStatus.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//     }
// }

// // Dataset upload handler
// async function handleDatasetUpload() {
//     if (!datasetUpload.files.length) return;
    
//     const statusDiv = document.getElementById('uploadStatus');
//     statusDiv.innerHTML = '<span class="uploading">Processing dataset...</span>';
    
//     try {
//         const formData = new FormData();
//         formData.append('file', datasetUpload.files[0]);
        
//         const res = await fetch('/upload-dataset', {
//             method: 'POST',
//             body: formData
//         });
        
//         const result = await res.json();
        
//         if (result.status === "exists") {
//             statusDiv.innerHTML = '<span class="warning">ℹ️ Dataset already exists</span>';
//         } else if (result.added > 0) {
//             statusDiv.innerHTML = `<span class="success">✓ Added ${result.added} examples</span>`;
//             updateTrainingStats();
//         } else {
//             statusDiv.innerHTML = '<span class="warning">⚠️ No new examples added</span>';
//         }
//     } catch (err) {
//         statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//     }
// }

// // Update training stats
// async function updateTrainingStats() {
//     try {
//         const res = await fetch('/training-status');
//         const data = await res.json();
//         document.getElementById('exampleCount').textContent = data.example_count;
        
//         if (data.last_updated) {
//             const date = new Date(data.last_updated * 1000);
//             document.getElementById('lastTrained').textContent = date.toLocaleString();
//         }
//     } catch (error) {
//         console.error('Error fetching training stats:', error);
//     }
// }

// // Send message handler
// function sendMessage() {
//     const message = userInput.value.trim();
//     if (!message) return;

//     addMessageToChat('user', message);
//     userInput.value = '';

//     if (ws?.readyState === WebSocket.OPEN) {
//         ws.send(JSON.stringify({
//             type: 'chat',
//             messages: [{ role: 'user', content: message }]
//         }));
//     }
// }

// // Initialize the application
// document.addEventListener('DOMContentLoaded', () => {
//     initWebSocket();

//     // Set up event listeners
//     sendButton.addEventListener('click', sendMessage);
//     userInput.addEventListener('keypress', (e) => {
//         if (e.key === 'Enter') sendMessage();
//     });

//     documentUploadBtn.addEventListener('click', handleDocumentUpload);
//     uploadBtn.addEventListener('click', handleDatasetUpload);

//     // Load initial training stats
//     updateTrainingStats();
// });











// const chatBox = document.getElementById('chatBox');
// const userInput = document.getElementById('userInput');
// const sendButton = document.getElementById('sendButton');
// const chartCanvas = document.getElementById('chart').getContext('2d');
// const documentUploadBtn = document.getElementById('uploadDocumentBtn');
// const documentUploadInput = document.getElementById('documentUpload');
// const documentUploadStatus = document.getElementById('documentUploadStatus');
// const uploadBtn = document.getElementById('uploadBtn');
// const datasetUpload = document.getElementById('datasetUpload');

// let chart;
// let messages = [];
// let ws;
// let isSending = false;

// // Initialize WebSocket connection
// function initWebSocket() {
//     ws = new WebSocket(`ws://${window.location.host}`);

//     ws.onopen = () => {
//         console.log('WebSocket connection established');
//     };

//     ws.onmessage = (event) => {
//         try {
//             const data = JSON.parse(event.data);
//             console.log('Received data:', data);

//             const loadingDiv = document.querySelector('.spinner-container');
//             if (loadingDiv) loadingDiv.remove();

//             if (data.error) {
//                 showError(data.message || data.human_answer);
//                 return;
//             }

//             // Handle different response types
//             if (data.type === 'chart') {
//                 if (!data.chart_data) {
//                     throw new Error('Missing chart data in response');
//                 }
//                 renderChartData(data);
//             } else if (data.type === 'document') {
//                 showDocumentResults(data);
//             } else {
//                 showSQLResults(data);
//             }
//         } catch (error) {
//             console.error('Error processing message:', error);
//             showError('Failed to process server response');
//         }
//     };

//     ws.onclose = () => {
//         console.log('WebSocket disconnected - attempting reconnect...');
//         setTimeout(initWebSocket, 3000);
//     };

//     ws.onerror = (error) => {
//         console.error('WebSocket error:', error);
//         showError('Connection error - falling back to HTTP');
//         sendButton.onclick = sendViaHTTP;
//     };
// }

// // Send message handler
// function sendMessage() {
//     if (isSending) return;
//     isSending = true;

//     const message = userInput.value.trim();
//     if (!message) {
//         isSending = false;
//         return;
//     }

//     addMessageToChat('user', message);
//     userInput.value = '';
//     showLoadingIndicator();

//     try {
//         if (ws?.readyState === WebSocket.OPEN) {
//             ws.send(JSON.stringify({
//                 type: 'chat',
//                 messages: [{ role: 'user', content: message }]
//             }));
//         } else {
//             sendViaHTTP();
//         }
//     } catch (error) {
//         showError(error.message);
//     } finally {
//         isSending = false;
//     }
// }

// // HTTP fallback
// async function sendViaHTTP() {
//     const message = userInput.value.trim();
//     if (!message) return;

//     try {
//         const response = await fetch('/chat', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ messages: [...messages, { role: 'user', content: message }] })
//         });
        
//         const data = await response.json();
//         handleResponse(data);
//     } catch (error) {
//         showError(error.message);
//     }
// }

// // Handle HTTP responses
// function handleResponse(data) {
//     if (data.error) {
//         showError(data.human_answer || data.message);
//         return;
//     }

//     if (data.chart_data) {
//         renderChartData(data);
//     } else if (data.answers) {
//         showDocumentResults(data);
//     } else {
//         showSQLResults(data);
//     }
// }

// // UI Functions
// function addMessageToChat(role, content) {
//     messages.push({ role, content });
//     const messageDiv = document.createElement('div');
//     messageDiv.className = role === 'user' ? 'user-message' : 'bot-message';
//     messageDiv.innerHTML = `<b>${role === 'user' ? 'You' : 'Bot'}:</b> ${content}`;
//     chatBox.appendChild(messageDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showLoadingIndicator() {
//     const loadingDiv = document.createElement('div');
//     loadingDiv.className = 'spinner-container';
//     loadingDiv.innerHTML = '<div class="spinner"></div>';
//     chatBox.appendChild(loadingDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showError(message) {
//     const errorDiv = document.createElement('div');
//     errorDiv.className = 'error-message';
//     errorDiv.innerHTML = `<b>Error:</b> ${message}`;
//     chatBox.appendChild(errorDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Fixed Chart Rendering Function
// function renderChartData(data) {
//     try {
//         // Destroy previous chart if exists
//         if (chart) {
//             chart.destroy();
//         }

//         const chartContainer = document.getElementById('chartContainer');
//         chartContainer.style.display = 'block';

//         const chartData = data.chart_data;
//         console.log('Chart data received:', chartData);

//         // Determine chart type
//         const chartType = determineChartType(chartData);

//         // Process labels - convert dates if needed
//         const processedLabels = chartData.labels.map(label => {
//             if (chartType === 'line' && isDateLike(label)) {
//                 const date = new Date(label);
//                 return isNaN(date.getTime()) ? label : date;
//             }
//             return label;
//         });

//         // Get values from either datasets[0].data or values array
//         const values = chartData.datasets?.[0]?.data || chartData.values || [];
//         if (values.length === 0) {
//             throw new Error('No data values found in chart data');
//         }

//         // Create the chart
//         chart = new Chart(chartCanvas, {
//             type: chartType,
//             data: {
//                 labels: processedLabels,
//                 datasets: [{
//                     label: chartData.y_label || 'Value',
//                     data: values,
//                     backgroundColor: chartType === 'line' ? 
//                         'rgba(54, 162, 235, 0.2)' : 
//                         generateChartColors(processedLabels.length),
//                     borderColor: chartType === 'line' ? 
//                         'rgba(54, 162, 235, 1)' : '#333',
//                     borderWidth: chartType === 'line' ? 2 : 1,
//                     pointBackgroundColor: chartType === 'line' ? 
//                         'rgba(54, 162, 235, 1)' : undefined,
//                     pointRadius: chartType === 'line' ? 4 : undefined,
//                     fill: chartType === 'line' ? false : true,
//                     tension: chartType === 'line' ? 0.1 : 0
//                 }]
//             },
//             options: getChartOptions(chartType, chartData)
//         });

//         addMessageToChat('bot', data.human_answer || `Here's your ${chartType} chart`);

//     } catch (error) {
//         console.error('Chart rendering error:', error);
//         showError(`Failed to display chart: ${error.message}`);
//         if (data.sql_query) {
//             showSQLResults(data);
//         }
//     }
// }

// // Chart Utilities
// function determineChartType(chartData) {
//     // Priority 1: Explicit chart type from backend
//     if (chartData.chart_type) return chartData.chart_type;
//     if (chartData.suggestedChartType) return chartData.suggestedChartType;
    
//     // Priority 2: Auto-detect based on data
//     const isDate = (chartData.labels || []).some(label => isDateLike(label));
//     const fewCategories = (chartData.labels || []).length <= 5;
    
//     if (isDate) return 'line';
//     if (fewCategories) return 'pie';
//     return 'bar';
// }

// function isDateLike(value) {
//     if (value instanceof Date) return true;
//     if (typeof value !== 'string') return false;
    
//     // Check for various date formats
//     if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true; // YYYY-MM-DD
//     if (/^\d{4}$/.test(value)) return true; // YYYY
//     if (/^\w+ \d{1,2}, \d{4}$/.test(value)) return true; // Month Day, Year
//     if (!isNaN(Date.parse(value))) return true; // Any parsable date
    
//     return false;
// }

// function generateChartColors(count) {
//     const colors = [];
//     const hueStep = 360 / count;
//     for (let i = 0; i < count; i++) {
//         colors.push(`hsl(${i * hueStep}, 70%, 60%)`);
//     }
//     return colors;
// }

// function getChartOptions(chartType, chartData) {
//     const commonOptions = {
//         responsive: true,
//         maintainAspectRatio: false,
//         plugins: {
//             legend: { 
//                 position: 'right',
//                 labels: {
//                     font: {
//                         size: 14
//                     }
//                 }
//             },
//             tooltip: {
//                 callbacks: {
//                     label: (context) => {
//                         const label = context.dataset.label || '';
//                         const value = context.parsed?.y ?? context.raw;
//                         const percentage = chartData.percentages?.[context.dataIndex] || '';
//                         return `${label}: ${value}${percentage ? ` (${percentage})` : ''}`;
//                     }
//                 }
//             },
//             title: {
//                 display: true,
//                 text: chartData.y_label || 'Chart Data',
//                 font: {
//                     size: 16
//                 }
//             }
//         }
//     };

//     if (chartType === 'line') {
//         return {
//             ...commonOptions,
//             scales: {
//                 y: {
//                     beginAtZero: false,
//                     title: { 
//                         display: true, 
//                         text: chartData.y_label || 'Value',
//                         font: {
//                             weight: 'bold'
//                         }
//                     }
//                 },
//                 x: {
//                     type: 'time',
//                     time: {
//                         parser: 'yyyy-MM-dd',
//                         tooltipFormat: 'MMM d, yyyy',
//                         unit: 'year'
//                     },
//                     title: { 
//                         display: true, 
//                         text: chartData.x_label || 'Date',
//                         font: {
//                             weight: 'bold'
//                         }
//                     }
//                 }
//             }
//         };
//     }

//     return commonOptions;
// }

// // Document and SQL Results
// function showDocumentResults(data) {
//     let html = '';
//     data.answers.forEach(answer => {
//         const cleanAnswer = answer.answer
//             .replace(/\*\*/g, '')
//             .replace(/-\s/g, '<br>- ')
//             .trim();
        
//         html += `
//             <div class="document-response">
//                 <b>From ${answer.document_info.name}:</b>
//                 <div class="document-answer">${cleanAnswer}</div>
//                 <small>Source: ${answer.document_info.url}</small>
//             </div>
//         `;
//     });
    
//     const container = document.createElement('div');
//     container.className = 'bot-message';
//     container.innerHTML = html;
//     chatBox.appendChild(container);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showSQLResults(data) {
//     let formattedResult = "";
//     if (data.db_result?.rows?.length > 0) {
//         data.db_result.rows.forEach(row => {
//             formattedResult += Object.values(row).join(' | ') + "<br>";
//         });
//     } else {
//         formattedResult = "No data found.";
//     }

//     const resultDiv = document.createElement('div');
//     resultDiv.className = 'bot-message';
//     resultDiv.innerHTML = `
//         <div><b>SQL Query:</b> <code>${data.sql_query}</code></div>
//         <div><b>Results:</b><br>${formattedResult}</div>
//         ${data.human_answer ? `<div><b>Summary:</b> ${data.human_answer}</div>` : ''}
//     `;
//     chatBox.appendChild(resultDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Initialize the application
// document.addEventListener('DOMContentLoaded', () => {
//     initWebSocket();

//     // Set up event listeners
//     sendButton.addEventListener('click', sendMessage);
//     userInput.addEventListener('keypress', (e) => {
//         if (e.key === 'Enter') sendMessage();
//     });

//     // Document upload handler
//     documentUploadBtn.addEventListener('click', async () => {
//         if (!documentUploadInput.files.length) return;
        
//         documentUploadStatus.innerHTML = '<span class="uploading">Uploading document...</span>';
        
//         try {
//             const formData = new FormData();
//             formData.append('document', documentUploadInput.files[0]);
            
//             const res = await fetch('/upload-document', {
//                 method: 'POST',
//                 body: formData
//             });
            
//             const result = await res.json();
            
//             if (result.success) {
//                 documentUploadStatus.innerHTML = `
//                     <span class="success">✓ Document uploaded!</span>
//                     <div>Name: ${result.document.name}</div>
//                 `;
//                 addMessageToChat('system', `Document "${result.document.name}" uploaded successfully.`);
//             } else {
//                 documentUploadStatus.innerHTML = '<span class="error">✗ Upload failed</span>';
//             }
//         } catch (err) {
//             documentUploadStatus.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//         }
//     });

//     // Dataset upload handler
//     uploadBtn.addEventListener('click', async () => {
//         if (!datasetUpload.files.length) return;
        
//         const statusDiv = document.getElementById('uploadStatus');
//         statusDiv.innerHTML = '<span class="uploading">Processing dataset...</span>';
        
//         try {
//             const formData = new FormData();
//             formData.append('file', datasetUpload.files[0]);
            
//             const res = await fetch('/upload-dataset', {
//                 method: 'POST',
//                 body: formData
//             });
            
//             const result = await res.json();
            
//             if (result.status === "exists") {
//                 statusDiv.innerHTML = '<span class="warning">ℹ️ Dataset already exists</span>';
//             } else if (result.added > 0) {
//                 statusDiv.innerHTML = `<span class="success">✓ Added ${result.added} examples</span>`;
//                 updateTrainingStats();
//             } else {
//                 statusDiv.innerHTML = '<span class="warning">⚠️ No new examples added</span>';
//             }
//         } catch (err) {
//             statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//         }
//     });

//     // Load initial training stats
//     updateTrainingStats();
// });

// async function updateTrainingStats() {
//     try {
//         const res = await fetch('/training-status');
//         const data = await res.json();
//         document.getElementById('exampleCount').textContent = data.example_count;
        
//         if (data.last_updated) {
//             const date = new Date(data.last_updated * 1000);
//             document.getElementById('lastTrained').textContent = date.toLocaleString();
//         }
//     } catch (error) {
//         console.error('Error fetching training stats:', error);
//     }
// }










// const chatBox = document.getElementById('chatBox');
// const userInput = document.getElementById('userInput');
// const sendButton = document.getElementById('sendButton');
// const chartCanvas = document.getElementById('chart').getContext('2d');
// const documentUploadBtn = document.getElementById('uploadDocumentBtn');
// const documentUploadInput = document.getElementById('documentUpload');
// const documentUploadStatus = document.getElementById('documentUploadStatus');
// const uploadBtn = document.getElementById('uploadBtn');
// const datasetUpload = document.getElementById('datasetUpload');

// let chart;
// let messages = [];
// let ws;
// let isSending = false;

// // Initialize WebSocket connection
// function initWebSocket() {
//     ws = new WebSocket(`ws://${window.location.host}`);

//     ws.onopen = () => {
//         console.log('WebSocket connection established');
//     };

//     ws.onmessage = (event) => {
//         try {
//             const data = JSON.parse(event.data);
//             console.log('Received:', data);

//             const loadingDiv = document.querySelector('.spinner-container');
//             if (loadingDiv) loadingDiv.remove();

//             if (data.error) {
//                 showError(data.message || data.human_answer);
//                 return;
//             }

//             // Validate response structure
//             if (!data.type) {
//                 throw new Error('Invalid response format - missing type');
//             }

//             switch (data.type) {
//                 case 'chart':
//                     if (!data.chart_data || !data.chart_data.labels || (!data.chart_data.values && !data.chart_data.datasets)) {
//                         throw new Error('Invalid chart data structure');
//                     }
//                     renderChartData(data);
//                     break;
//                 case 'document':
//                     if (!data.answers || !Array.isArray(data.answers)) {
//                         throw new Error('Invalid document response structure');
//                     }
//                     showDocumentResults(data);
//                     break;
//                 case 'sql':
//                     if (!data.sql_query) {
//                         throw new Error('Invalid SQL response structure');
//                     }
//                     showSQLResults(data);
//                     break;
//                 default:
//                     throw new Error(`Unknown response type: ${data.type}`);
//             }
//         } catch (error) {
//             console.error('Message handling error:', error);
//             showError(`Failed to process response: ${error.message}`);
//         }
//     };

//     ws.onclose = () => {
//         console.log('WebSocket disconnected - attempting reconnect...');
//         setTimeout(initWebSocket, 3000);
//     };

//     ws.onerror = (error) => {
//         console.error('WebSocket error:', error);
//         showError('Connection error - falling back to HTTP');
//         sendButton.onclick = sendViaHTTP;
//     };
// }

// // Send message via WebSocket or HTTP fallback
// function sendMessage() {
//     if (isSending) return;
//     isSending = true;

//     const message = userInput.value.trim();
//     if (!message) {
//         isSending = false;
//         return;
//     }

//     addMessageToChat('user', message);
//     userInput.value = '';
//     showLoadingIndicator();

//     try {
//         if (ws?.readyState === WebSocket.OPEN) {
//             ws.send(JSON.stringify({
//                 type: 'chat',
//                 messages: [{ role: 'user', content: message }]
//             }));
//         } else {
//             sendViaHTTP();
//         }
//     } catch (error) {
//         showError(error.message);
//     } finally {
//         isSending = false;
//     }
// }

// // HTTP fallback for sending messages
// async function sendViaHTTP() {
//     const message = userInput.value.trim();
//     if (!message) return;

//     try {
//         const response = await fetch('/chat', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ messages: [...messages, { role: 'user', content: message }] })
//         });
        
//         const data = await response.json();
//         handleResponse(data);
//     } catch (error) {
//         showError(error.message);
//     }
// }

// // Handle HTTP responses
// function handleResponse(data) {
//     if (data.error) {
//         showError(data.human_answer || data.message);
//         return;
//     }

//     if (data.chart_data) {
//         renderChartData(data);
//     } else if (data.answers) {
//         showDocumentResults(data);
//     } else {
//         showSQLResults(data);
//     }
// }

// // Add message to chat interface
// function addMessageToChat(role, content) {
//     messages.push({ role, content });
//     const messageDiv = document.createElement('div');
//     messageDiv.className = role === 'user' ? 'user-message' : 'bot-message';
//     messageDiv.innerHTML = `<b>${role === 'user' ? 'You' : 'Bot'}:</b> ${content}`;
//     chatBox.appendChild(messageDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Show loading spinner
// function showLoadingIndicator() {
//     const loadingDiv = document.createElement('div');
//     loadingDiv.className = 'spinner-container';
//     loadingDiv.innerHTML = '<div class="spinner"></div>';
//     chatBox.appendChild(loadingDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Show error message
// function showError(message) {
//     const errorDiv = document.createElement('div');
//     errorDiv.className = 'error-message';
//     errorDiv.innerHTML = `<b>Error:</b> ${message}`;
//     chatBox.appendChild(errorDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Render chart data
// function renderChartData(data) {
//     try {
//         // Destroy previous chart if exists
//         if (chart) chart.destroy();

//         const chartContainer = document.getElementById('chartContainer');
//         chartContainer.style.display = 'block';

//         // Normalize the chart data structure
//         const chartData = data.chart_data;
//         const isHistoryFormat = 'values' in chartData;
        
//         const labels = chartData.labels || [];
//         const values = isHistoryFormat ? chartData.values : (chartData.datasets?.[0]?.data || []);
//         const chartType = chartData.chart_type || chartData.suggestedChartType || determineChartType(chartData);

//         // Convert dates for line charts
//         const processedLabels = labels.map(label => {
//             if (chartType === 'line' && isDateLike(label)) {
//                 return new Date(label);
//             }
//             return label;
//         });

//         // Create the chart
//         chart = new Chart(chartCanvas, {
//             type: chartType,
//             data: {
//                 labels: processedLabels,
//                 datasets: [{
//                     label: chartData.y_label || 'Value',
//                     data: values,
//                     backgroundColor: chartType === 'line' ? 'rgba(54, 162, 235, 0.2)' : generateChartColors(labels.length),
//                     borderColor: chartType === 'line' ? 'rgba(54, 162, 235, 1)' : '#333',
//                     borderWidth: chartType === 'line' ? 2 : 1,
//                     pointBackgroundColor: chartType === 'line' ? 'rgba(54, 162, 235, 1)' : undefined,
//                     pointRadius: chartType === 'line' ? 4 : undefined,
//                     fill: chartType === 'line' ? false : true,
//                     tension: chartType === 'line' ? 0.1 : 0
//                 }]
//             },
//             options: getChartOptions(chartType, chartData)
//         });

//         addMessageToChat('bot', data.human_answer || `Here's your ${chartType} chart`);

//     } catch (error) {
//         console.error('Chart rendering error:', error);
//         showError(`Failed to display chart: ${error.message}`);
//         if (data.sql_query) {
//             showSQLResults(data);
//         }
//     }
// }

// // Show document results
// function showDocumentResults(data) {
//     let html = '';
//     data.answers.forEach(answer => {
//         const cleanAnswer = answer.answer
//             .replace(/\*\*/g, '')
//             .replace(/-\s/g, '<br>- ')
//             .trim();
        
//         html += `
//             <div class="document-response">
//                 <b>From ${answer.document_info.name}:</b>
//                 <div class="document-answer">${cleanAnswer}</div>
//                 <small>Source: ${answer.document_info.url}</small>
//             </div>
//         `;
//     });
    
//     const container = document.createElement('div');
//     container.className = 'bot-message';
//     container.innerHTML = html;
//     chatBox.appendChild(container);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Show SQL results
// function showSQLResults(data) {
//     let formattedResult = "";
//     if (data.db_result?.rows?.length > 0) {
//         data.db_result.rows.forEach(row => {
//             formattedResult += Object.values(row).join(' | ') + "<br>";
//         });
//     } else {
//         formattedResult = "No data found.";
//     }

//     const resultDiv = document.createElement('div');
//     resultDiv.className = 'bot-message';
//     resultDiv.innerHTML = `
//         <div><b>SQL Query:</b> <code>${data.sql_query}</code></div>
//         <div><b>Results:</b><br>${formattedResult}</div>
//         ${data.human_answer ? `<div><b>Summary:</b> ${data.human_answer}</div>` : ''}
//     `;
//     chatBox.appendChild(resultDiv);
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // Chart utility functions
// function determineChartType(chartData) {
//     if (chartData.chart_type) return chartData.chart_type;
//     if (chartData.suggestedChartType) return chartData.suggestedChartType;
    
//     const isDate = (chartData.labels || []).some(label => isDateLike(label));
//     const fewCategories = (chartData.labels || []).length <= 5;
    
//     if (isDate) return 'line';
//     if (fewCategories) return 'pie';
//     return 'bar';
// }

// function isDateLike(value) {
//     if (value instanceof Date) return true;
//     if (typeof value !== 'string') return false;
    
//     return /^\d{4}-\d{2}-\d{2}$/.test(value) || 
//            /^\d{4}$/.test(value) ||
//            /^\w+ \d{1,2}, \d{4}$/.test(value) ||
//            !isNaN(Date.parse(value));
// }

// function generateChartColors(count) {
//     const colors = [];
//     const hueStep = 360 / count;
//     for (let i = 0; i < count; i++) {
//         colors.push(`hsl(${i * hueStep}, 70%, 60%)`);
//     }
//     return colors;
// }

// function getChartOptions(chartType, chartData) {
//     const commonOptions = {
//         responsive: true,
//         maintainAspectRatio: false,
//         plugins: {
//             legend: { 
//                 position: 'right',
//                 labels: {
//                     font: {
//                         size: 14
//                     }
//                 }
//             },
//             tooltip: {
//                 callbacks: {
//                     label: (context) => {
//                         const label = context.dataset.label || '';
//                         const value = context.parsed.y || context.raw;
//                         const percentage = chartData.percentages?.[context.dataIndex] || '';
//                         return `${label}: ${value}${percentage ? ` (${percentage})` : ''}`;
//                     }
//                 }
//             },
//             title: {
//                 display: true,
//                 text: chartData.y_label || 'Chart Data',
//                 font: {
//                     size: 16
//                 }
//             }
//         },
//         scales: {
//             x: {
//                 title: {
//                     display: true,
//                     text: chartData.x_label || 'Category',
//                     font: {
//                         weight: 'bold'
//                     }
//                 }
//             },
//             y: {
//                 title: {
//                     display: true,
//                     text: chartData.y_label || 'Value',
//                     font: {
//                         weight: 'bold'
//                     }
//                 }
//             }
//         }
//     };

//     if (chartType === 'line') {
//         return {
//             ...commonOptions,
//             scales: {
//                 y: {
//                     beginAtZero: false,
//                     title: { 
//                         display: true, 
//                         text: chartData.y_label || 'Value',
//                         font: {
//                             weight: 'bold'
//                         }
//                     }
//                 },
//                 x: {
//                     type: 'time',
//                     time: {
//                         parser: 'yyyy',
//                         tooltipFormat: 'yyyy',
//                         unit: 'year',
//                         displayFormats: { year: 'yyyy' }
//                     },
//                     title: { 
//                         display: true, 
//                         text: chartData.x_label || 'Year',
//                         font: {
//                             weight: 'bold'
//                         }
//                     }
//                 }
//             }
//         };
//     }

//     return commonOptions;
// }

// // Document upload handler
// documentUploadBtn.addEventListener('click', async () => {
//     if (!documentUploadInput.files.length) return;
    
//     documentUploadStatus.innerHTML = '<span class="uploading">Uploading document...</span>';
    
//     try {
//         const formData = new FormData();
//         formData.append('document', documentUploadInput.files[0]);
        
//         const res = await fetch('/upload-document', {
//             method: 'POST',
//             body: formData
//         });
        
//         const result = await res.json();
        
//         if (result.success) {
//             documentUploadStatus.innerHTML = `
//                 <span class="success">✓ Document uploaded!</span>
//                 <div>Name: ${result.document.name}</div>
//             `;
//             addMessageToChat('system', `Document "${result.document.name}" uploaded successfully.`);
//         } else {
//             documentUploadStatus.innerHTML = '<span class="error">✗ Upload failed</span>';
//         }
//     } catch (err) {
//         documentUploadStatus.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//     }
// });

// // Dataset upload handler
// uploadBtn.addEventListener('click', async () => {
//     if (!datasetUpload.files.length) return;
    
//     const statusDiv = document.getElementById('uploadStatus');
//     statusDiv.innerHTML = '<span class="uploading">Processing dataset...</span>';
    
//     try {
//         const formData = new FormData();
//         formData.append('file', datasetUpload.files[0]);
        
//         const res = await fetch('/upload-dataset', {
//             method: 'POST',
//             body: formData
//         });
        
//         const result = await res.json();
        
//         if (result.status === "exists") {
//             statusDiv.innerHTML = '<span class="warning">ℹ️ Dataset already exists</span>';
//         } else if (result.added > 0) {
//             statusDiv.innerHTML = `<span class="success">✓ Added ${result.added} examples</span>`;
//             updateTrainingStats();
//         } else {
//             statusDiv.innerHTML = '<span class="warning">⚠️ No new examples added</span>';
//         }
//     } catch (err) {
//         statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//     }
// });

// // Update training stats
// async function updateTrainingStats() {
//     try {
//         const res = await fetch('/training-status');
//         const data = await res.json();
//         document.getElementById('exampleCount').textContent = data.example_count;
        
//         if (data.last_updated) {
//             const date = new Date(data.last_updated * 1000);
//             document.getElementById('lastTrained').textContent = date.toLocaleString();
//         }
//     } catch (error) {
//         console.error('Error fetching training stats:', error);
//     }
// }

// // Initialize the application
// document.addEventListener('DOMContentLoaded', () => {
//     initWebSocket();

//     sendButton.addEventListener('click', sendMessage);
//     userInput.addEventListener('keypress', (e) => {
//         if (e.key === 'Enter') sendMessage();
//     });

//     updateTrainingStats();
// });









// const chatBox = document.getElementById('chatBox');
// const userInput = document.getElementById('userInput');
// const sendButton = document.getElementById('sendButton');
// const chartCanvas = document.getElementById('chart').getContext('2d');
// const documentUploadBtn = document.getElementById('uploadDocumentBtn');
// const documentUploadInput = document.getElementById('documentUpload');
// const documentUploadStatus = document.getElementById('documentUploadStatus');
// const uploadBtn = document.getElementById('uploadBtn');
// const datasetUpload = document.getElementById('datasetUpload');

// let chart;
// let messages = [];
// let ws;
// let isSending = false;

// // ====================== WEBSOCKET HANDLING ======================
// function initWebSocket() {
//   ws = new WebSocket(`ws://${window.location.host}`);

//   ws.onopen = () => {
//     console.log('WebSocket connection established');
//   };

//   ws.onmessage = (event) => {
//     try {
//       const data = JSON.parse(event.data);
//       console.log('Received:', data);

//       const loadingDiv = document.querySelector('.spinner-container');
//       if (loadingDiv) loadingDiv.remove();

//       if (data.error) {
//         showError(data.message || data.human_answer);
//         return;
//       }

//       // Validate data before processing
//       if (data.type === 'chart' && (!data.chart_data || !data.chart_data.datasets)) {
//         throw new Error('Invalid chart data received');
//       }

//       switch (data.type) {
//         case 'chart':
//           renderChartData(data);
//           break;
//         case 'document':
//           showDocumentResults(data);
//           break;
//         case 'sql':
//           showSQLResults(data);
//           break;
//         default:
//           showError('Unknown response type');
//       }
//     } catch (error) {
//       console.error('Error processing message:', error);
//       showError(`Failed to process response: ${error.message}`);
//     }
//   };

//   ws.onclose = () => {
//     console.log('WebSocket disconnected - attempting reconnect...');
//     setTimeout(initWebSocket, 3000);
//   };

//   ws.onerror = (error) => {
//     console.error('WebSocket error:', error);
//     showError('Connection error - falling back to HTTP');
//     sendButton.onclick = sendViaHTTP;
//   };
// }

// // ====================== MESSAGE HANDLING ======================
// function sendMessage() {
//   if (isSending) return;
//   isSending = true;

//   const message = userInput.value.trim();
//   if (!message) {
//     isSending = false;
//     return;
//   }

//   addMessageToChat('user', message);
//   userInput.value = '';
//   showLoadingIndicator();

//   try {
//     if (ws?.readyState === WebSocket.OPEN) {
//       ws.send(JSON.stringify({
//         type: 'chat',
//         messages: [{ role: 'user', content: message }]
//       }));
//     } else {
//       sendViaHTTP();
//     }
//   } catch (error) {
//     showError(error.message);
//   } finally {
//     isSending = false;
//   }
// }

// async function sendViaHTTP() {
//   const message = userInput.value.trim();
//   if (!message) return;

//   try {
//     const response = await fetch('/chat', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ messages: [...messages, { role: 'user', content: message }] })
//     });
    
//     const data = await response.json();
//     handleResponse(data);
//   } catch (error) {
//     showError(error.message);
//   }
// }

// // ====================== UI UPDATES ======================
// function addMessageToChat(role, content) {
//   messages.push({ role, content });
//   const messageDiv = document.createElement('div');
//   messageDiv.className = role === 'user' ? 'user-message' : 'bot-message';
//   messageDiv.innerHTML = `<b>${role === 'user' ? 'You' : 'Bot'}:</b> ${content}`;
//   chatBox.appendChild(messageDiv);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showLoadingIndicator() {
//   const loadingDiv = document.createElement('div');
//   loadingDiv.className = 'spinner-container';
//   loadingDiv.innerHTML = '<div class="spinner"></div>';
//   chatBox.appendChild(loadingDiv);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showError(message) {
//   const errorDiv = document.createElement('div');
//   errorDiv.className = 'error-message';
//   errorDiv.innerHTML = `<b>Error:</b> ${message}`;
//   chatBox.appendChild(errorDiv);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// // ====================== RESPONSE HANDLERS ======================
// function handleResponse(data) {
//   if (data.error) {
//     showError(data.human_answer || data.message);
//     return;
//   }

//   if (data.chart_data) {
//     renderChartData(data);
//   } else if (data.answers) {
//     showDocumentResults(data);
//   } else {
//     showSQLResults(data);
//   }
// }

// function renderChartData(data) {
//   if (chart) chart.destroy();
//   const chartData = data.chart_data;

//   // Validate chart data
//   if (!chartData?.labels || !chartData?.datasets?.[0]?.data) {
//     throw new Error('Invalid chart data structure');
//   }

//   document.getElementById('chartContainer').style.display = 'block';
//   const chartType = determineChartType(chartData);

//   // Convert dates for line charts
//   if (chartType === 'line') {
//     chartData.labels = chartData.labels.map(label => {
//       if (typeof label === 'string' && isDateLike(label)) {
//         return new Date(label);
//       }
//       return label;
//     });
//   }

//   try {
//     chart = new Chart(chartCanvas, {
//       type: chartType,
//       data: {
//         labels: chartData.labels,
//         datasets: chartData.datasets.map((dataset, i) => ({
//           label: dataset.label,
//           data: dataset.data,
//           backgroundColor: chartType === 'line' ? 'rgba(54, 162, 235, 0.2)' : generateChartColors(chartData.labels.length),
//           borderColor: chartType === 'line' ? 'rgba(54, 162, 235, 1)' : '#333',
//           borderWidth: chartType === 'line' ? 2 : 1,
//           pointBackgroundColor: chartType === 'line' ? 'rgba(54, 162, 235, 1)' : undefined,
//           pointRadius: chartType === 'line' ? 4 : undefined,
//           fill: chartType === 'line' ? false : true,
//           tension: chartType === 'line' ? 0.1 : 0
//         }))
//       },
//       options: getChartOptions(chartType, chartData)
//     });

//     addMessageToChat('bot', `Here's your chart: ${data.human_answer || ''}`);
//   } catch (error) {
//     console.error('Chart creation error:', error);
//     showError(`Could not display chart: ${error.message}`);
//     if (data.sql_query) showSQLResults(data);
//   }
// }

// function showDocumentResults(data) {
//   let html = '';
//   data.answers.forEach(answer => {
//     const cleanAnswer = answer.answer
//       .replace(/\*\*/g, '')
//       .replace(/-\s/g, '<br>- ')
//       .trim();
    
//     html += `
//       <div class="document-response">
//         <b>From ${answer.document_info.name}:</b>
//         <div class="document-answer">${cleanAnswer}</div>
//         <small>Source: ${answer.document_info.url}</small>
//       </div>
//     `;
//   });
  
//   const container = document.createElement('div');
//   container.className = 'bot-message';
//   container.innerHTML = html;
//   chatBox.appendChild(container);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showSQLResults(data) {
//   let formattedResult = "";
//   if (data.db_result?.rows?.length > 0) {
//     data.db_result.rows.forEach(row => {
//       formattedResult += Object.values(row).join(' | ') + "<br>";
//     });
//   } else {
//     formattedResult = "No data found.";
//   }

//   const resultDiv = document.createElement('div');
//   resultDiv.className = 'bot-message';
//   resultDiv.innerHTML = `
//     <div><b>SQL Query:</b> <code>${data.sql_query}</code></div>
//     <div><b>Results:</b><br>${formattedResult}</div>
//     ${data.human_answer ? `<div><b>Summary:</b> ${data.human_answer}</div>` : ''}
//   `;
//   chatBox.appendChild(resultDiv);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// // ====================== CHART UTILITIES ======================
// function determineChartType(chartData) {
//   if (chartData.suggestedChartType) {
//     return chartData.suggestedChartType;
//   }
  
//   const isDate = chartData.labels.some(label => isDateLike(label));
//   const fewCategories = chartData.labels.length <= 5;
  
//   if (isDate) return 'line';
//   if (fewCategories) return 'pie';
//   return 'bar';
// }

// function isDateLike(value) {
//   if (value instanceof Date) return true;
//   if (typeof value !== 'string') return false;
  
//   return /^\d{4}-\d{2}-\d{2}$/.test(value) || 
//          /^\d{4}$/.test(value) ||
//          /^\w+ \d{1,2}, \d{4}$/.test(value) ||
//          !isNaN(Date.parse(value));
// }

// function generateChartColors(count) {
//   const colors = [];
//   const hueStep = 360 / count;
//   for (let i = 0; i < count; i++) {
//     colors.push(`hsl(${i * hueStep}, 70%, 60%)`);
//   }
//   return colors;
// }

// function getChartOptions(chartType, chartData) {
//   const commonOptions = {
//     responsive: true,
//     maintainAspectRatio: false,
//     plugins: {
//       legend: { position: 'right' },
//       tooltip: {
//         callbacks: {
//           label: (context) => {
//             const label = context.dataset.label || '';
//             const value = context.parsed.y || context.raw;
//             return `${label}: ${value}`;
//           }
//         }
//       }
//     }
//   };

//   if (chartType === 'line') {
//     return {
//       ...commonOptions,
//       scales: {
//         y: {
//           beginAtZero: false,
//           title: { 
//             display: true, 
//             text: chartData.y_label || 'Value',
//             font: { weight: 'bold' }
//           }
//         },
//         x: {
//           type: 'time',
//           time: {
//             parser: 'yyyy',
//             tooltipFormat: 'yyyy',
//             unit: 'year',
//             displayFormats: { year: 'yyyy' }
//           },
//           title: { 
//             display: true, 
//             text: chartData.x_label || 'Year',
//             font: { weight: 'bold' }
//           }
//         }
//       }
//     };
//   }

//   return commonOptions;
// }

// // ====================== DOCUMENT UPLOAD ======================
// documentUploadBtn.addEventListener('click', async () => {
//   if (!documentUploadInput.files.length) return;
  
//   documentUploadStatus.innerHTML = '<span class="uploading">Uploading document...</span>';
  
//   try {
//     const formData = new FormData();
//     formData.append('document', documentUploadInput.files[0]);
    
//     const res = await fetch('/upload-document', {
//       method: 'POST',
//       body: formData
//     });
    
//     const result = await res.json();
    
//     if (result.success) {
//       documentUploadStatus.innerHTML = `
//         <span class="success">✓ Document uploaded!</span>
//         <div>Name: ${result.document.name}</div>
//       `;
//       addMessageToChat('system', `Document "${result.document.name}" uploaded successfully.`);
//     } else {
//       documentUploadStatus.innerHTML = '<span class="error">✗ Upload failed</span>';
//     }
//   } catch (err) {
//     documentUploadStatus.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//   }
// });

// // ====================== TRAINING DATA UPLOAD ======================
// uploadBtn.addEventListener('click', async () => {
//   if (!datasetUpload.files.length) return;
  
//   const statusDiv = document.getElementById('uploadStatus');
//   statusDiv.innerHTML = '<span class="uploading">Processing dataset...</span>';
  
//   try {
//     const formData = new FormData();
//     formData.append('file', datasetUpload.files[0]);
    
//     const res = await fetch('/upload-dataset', {
//       method: 'POST',
//       body: formData
//     });
    
//     const result = await res.json();
    
//     if (result.status === "exists") {
//       statusDiv.innerHTML = '<span class="warning">ℹ️ Dataset already exists</span>';
//     } else if (result.added > 0) {
//       statusDiv.innerHTML = `<span class="success">✓ Added ${result.added} examples</span>`;
//       updateTrainingStats();
//     } else {
//       statusDiv.innerHTML = '<span class="warning">⚠️ No new examples added</span>';
//     }
//   } catch (err) {
//     statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//   }
// });

// async function updateTrainingStats() {
//   try {
//     const res = await fetch('/training-status');
//     const data = await res.json();
//     document.getElementById('exampleCount').textContent = data.example_count;
    
//     if (data.last_updated) {
//       const date = new Date(data.last_updated * 1000);
//       document.getElementById('lastTrained').textContent = date.toLocaleString();
//     }
//   } catch (error) {
//     console.error('Error fetching training stats:', error);
//   }
// }

// // ====================== INITIALIZATION ======================
// document.addEventListener('DOMContentLoaded', () => {
//   initWebSocket();

//   sendButton.addEventListener('click', sendMessage);
//   userInput.addEventListener('keypress', (e) => {
//     if (e.key === 'Enter') sendMessage();
//   });

//   updateTrainingStats();
// });







// const chatBox = document.getElementById('chatBox');
// const userInput = document.getElementById('userInput');
// const sendButton = document.getElementById('sendButton');
// const chartCanvas = document.getElementById('chart');
// const documentUploadBtn = document.getElementById('uploadDocumentBtn');
// const documentUploadInput = document.getElementById('documentUpload');
// const documentUploadStatus = document.getElementById('documentUploadStatus');
// const uploadBtn = document.getElementById('uploadBtn');
// const datasetUpload = document.getElementById('datasetUpload');

// let chart;
// let messages = [];
// let ws; // WebSocket connection

// // ====================== WEBSOCKET HANDLING ======================
// function initWebSocket() {
//   // Connect to WebSocket server (ws:// for HTTP, wss:// for HTTPS)
//   ws = new WebSocket(`ws://${window.location.host}`);

//   ws.onopen = () => {
//     console.log('WebSocket connection established');
//   };

//   ws.onmessage = (event) => {
//     const data = JSON.parse(event.data);
//     console.log('Received:', data);

//     const loadingDiv = document.querySelector('.spinner-container');
//     if (loadingDiv) loadingDiv.remove();

//     if (data.error) {
//       showError(data.message || data.human_answer);
//       return;
//     }

//     switch (data.type) {
//       case 'chart':
//         renderChartData(data);
//         break;
//       case 'document':
//         showDocumentResults(data);
//         break;
//       case 'sql':
//         showSQLResults(data);
//         break;
//       default:
//         showError('Unknown response type');
//     }
//   };

//   ws.onclose = () => {
//     console.log('WebSocket disconnected - attempting reconnect...');
//     setTimeout(initWebSocket, 3000); // Reconnect after 3 seconds
//   };

//   ws.onerror = (error) => {
//     console.error('WebSocket error:', error);
//     showError('Connection error - falling back to HTTP');
//     // Fallback to HTTP if WebSocket fails
//     sendButton.onclick = sendViaHTTP;
//   };
// }

// // ====================== MESSAGE HANDLING ======================
// let isSending=false;
// function sendMessage() {
//   if(isSending) return;
//   isSending=true;
//   const message = userInput.value.trim();
//   userInput.value = '';
//   if (!message) {
//     isSending=false;
//     return;
//   }
//   addMessageToChat('user', message);
//   userInput.value = '';

//   showLoadingIndicator();
//   try {
//     if (ws?.readyState === WebSocket.OPEN) {
//       // Send ONLY the new message, not the full history
//       ws.send(JSON.stringify({
//         type: 'chat',
//         messages: [{ role: 'user', content: message }] // No duplicates
//       }));
//     } else {
//       sendViaHTTP();
//     }
//   } finally {
//     isSending = false;
//   }
// }
//   // if (ws && ws.readyState === WebSocket.OPEN) {
//   //   messages.push({ role: 'user', content: message });
//   //   ws.send(JSON.stringify({
//   //     type: 'chat',
//   //     messages: messages
//   //   }));
//   // } else {
//   //   sendViaHTTP();
//   // }


// // HTTP fallback
// async function sendViaHTTP() {
//   const message = userInput.value.trim();
//   if (!message) return;

//   try {
//     const response = await fetch('/chat', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ messages: [...messages, { role: 'user', content: message }] })
//     });
    
//     const data = await response.json();
//     handleResponse(data);
//   } catch (error) {
//     showError(error.message);
//   }
// }

// // ====================== UI UPDATES ======================
// function addMessageToChat(role, content) {
//   messages.push({ role, content });
//   const messageDiv = document.createElement('div');
//   messageDiv.className = role === 'user' ? 'user-message' : 'bot-message';
//   messageDiv.innerHTML = `<b>${role === 'user' ? 'You' : 'Bot'}:</b> ${content}`;
//   chatBox.appendChild(messageDiv);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showLoadingIndicator() {
//   const loadingDiv = document.createElement('div');
//   loadingDiv.className = 'spinner-container';
//   loadingDiv.innerHTML = '<div class="spinner"></div>';
//   chatBox.appendChild(loadingDiv);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showError(message) {
//   const errorDiv = document.createElement('div');
//   errorDiv.className = 'error-message';
//   errorDiv.innerHTML = `<b>Error:</b> ${message}`;
//   chatBox.appendChild(errorDiv);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// // ====================== RESPONSE HANDLERS ======================
// function handleResponse(data) {
//   if (data.error) {
//     showError(data.human_answer || data.message);
//     return;
//   }

//   if (data.chart_data) {
//     renderChartData(data);
//   } else if (data.answers) {
//     showDocumentResults(data);
//   } else {
//     showSQLResults(data);
//   }
// }

// function renderChartData(data) {
//   // Destroy previous chart if exists
//   if (chart) chart.destroy();

//   const chartData = data.chart_data;
//   const chartContainer = document.getElementById('chartContainer');
//   chartContainer.style.display = 'block';

//   // Prepare data for Chart.js
//   const chartType = determineChartType(chartData);
//   const colors = generateChartColors(chartData.labels.length);

//   chart = new Chart(chartCanvas, {
//     type: chartType,
//     data: {
//       labels: chartData.labels,
//       datasets: [{
//         label: chartData.datasets[0].label,
//         data: chartData.datasets[0].data,
//         backgroundColor: colors,
//         borderColor: '#333',
//         borderWidth: 1
//       }]
//     },
//     options: getChartOptions(chartType, chartData)
//   });

//   addMessageToChat('bot', `Here's your chart: ${data.human_answer || ''}`);
// }

// function showDocumentResults(data) {
//   let html = '';
//   data.answers.forEach(answer => {
//     const cleanAnswer = answer.answer
//       .replace(/\*\*/g, '')
//       .replace(/-\s/g, '<br>- ')
//       .trim();
    
//     html += `
//       <div class="document-response">
//         <b>From ${answer.document_info.name}:</b>
//         <div class="document-answer">${cleanAnswer}</div>
//         <small>Source: ${answer.document_info.url}</small>
//       </div>
//     `;
//   });
  
//   const container = document.createElement('div');
//   container.className = 'bot-message';
//   container.innerHTML = html;
//   chatBox.appendChild(container);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// function showSQLResults(data) {
//   let formattedResult = "";
//   if (data.db_result?.rows?.length > 0) {
//     data.db_result.rows.forEach(row => {
//       formattedResult += Object.values(row).join(' | ') + "<br>";
//     });
//   } else {
//     formattedResult = "No data found.";
//   }

//   const resultDiv = document.createElement('div');
//   resultDiv.className = 'bot-message';
//   resultDiv.innerHTML = `
//     <div><b>SQL Query:</b> <code>${data.sql_query}</code></div>
//     <div><b>Results:</b><br>${formattedResult}</div>
//     <div><b>Summary:</b> ${data.human_answer}</div>
//   `;
//   chatBox.appendChild(resultDiv);
//   chatBox.scrollTop = chatBox.scrollHeight;
// }

// // ====================== CHART UTILITIES ======================
// function determineChartType(chartData) {
//   // Use server suggestion if available
//   if (chartData.suggestedChartType) {
//     return chartData.suggestedChartType;
//   }
  
//   // Auto-detect based on data
//   const isDate = chartData.labels.some(label => isDateLike(label));
//   const fewCategories = chartData.labels.length <= 5;
  
//   if (isDate) return 'line';
//   if (fewCategories) return 'pie';
//   return 'bar';
// }

// function isDateLike(value) {
//   return /^\d{4}-\d{2}-\d{2}$/.test(value) || 
//          /^\w+ \d{1,2}, \d{4}$/.test(value) ||
//          /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value);
// }

// function generateChartColors(count) {
//   const colors = [];
//   const hueStep = 360 / count;
//   for (let i = 0; i < count; i++) {
//     colors.push(`hsl(${i * hueStep}, 70%, 60%)`);
//   }
//   return colors;
// }

// function getChartOptions(chartType, chartData) {
//   const commonOptions = {
//     responsive: true,
//     maintainAspectRatio: false,
//     plugins: {
//       legend: { position: 'right' },
//       tooltip: {
//         callbacks: {
//           label: (context) => {
//             const label = context.label || '';
//             const value = context.raw;
//             const percentage = chartData.percentages?.[context.dataIndex] || '';
//             return `${label}: ${value}${percentage ? ` (${percentage})` : ''}`;
//           }
//         }
//       }
//     }
//   };

//   // Type-specific options
//   if (chartType === 'line') {
//     return {
//       ...commonOptions,
//       scales: {
//         y: { beginAtZero: true, title: { display: true, text: chartData.y_label } },
//         x: { 
//           type: 'time',
//           time: { parser: 'YYYY-MM-DD', tooltipFormat: 'll' },
//           title: { display: true, text: chartData.x_label }
//         }
//       }
//     };
//   }

//   return commonOptions;
// }

// // ====================== DOCUMENT UPLOAD ======================
// documentUploadBtn.addEventListener('click', async () => {
//   if (!documentUploadInput.files.length) return;
  
//   documentUploadStatus.innerHTML = '<span class="uploading">Uploading document...</span>';
  
//   try {
//     const formData = new FormData();
//     formData.append('document', documentUploadInput.files[0]);
    
//     const res = await fetch('/upload-document', {
//       method: 'POST',
//       body: formData
//     });
    
//     const result = await res.json();
    
//     if (result.success) {
//       documentUploadStatus.innerHTML = `
//         <span class="success">✓ Document uploaded!</span>
//         <div>Name: ${result.document.name}</div>
//       `;
//       addMessageToChat('system', `Document "${result.document.name}" uploaded successfully.`);
//     } else {
//       documentUploadStatus.innerHTML = '<span class="error">✗ Upload failed</span>';
//     }
//   } catch (err) {
//     documentUploadStatus.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//   }
// });

// // ====================== TRAINING DATA UPLOAD ======================
// uploadBtn.addEventListener('click', async () => {
//   if (!datasetUpload.files.length) return;
  
//   const statusDiv = document.getElementById('uploadStatus');
//   statusDiv.innerHTML = '<span class="uploading">Processing dataset...</span>';
  
//   try {
//     const formData = new FormData();
//     formData.append('file', datasetUpload.files[0]);
    
//     const res = await fetch('/upload-dataset', {
//       method: 'POST',
//       body: formData
//     });
    
//     const result = await res.json();
    
//     if (result.status === "exists") {
//       statusDiv.innerHTML = '<span class="warning">ℹ️ Dataset already exists</span>';
//     } else if (result.added > 0) {
//       statusDiv.innerHTML = `<span class="success">✓ Added ${result.added} examples</span>`;
//       updateTrainingStats();
//     } else {
//       statusDiv.innerHTML = '<span class="warning">⚠️ No new examples added</span>';
//     }
//   } catch (err) {
//     statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//   }
// });

// // ====================== TRAINING STATUS ======================
// async function updateTrainingStats() {
//   const res = await fetch('/training-status');
//   const data = await res.json();
//   document.getElementById('exampleCount').textContent = data.example_count;
  
//   if (data.last_updated) {
//     const date = new Date(data.last_updated * 1000);
//     document.getElementById('lastTrained').textContent = date.toLocaleString();
//   }
// }

// // ====================== INITIALIZATION ======================
// document.addEventListener('DOMContentLoaded', () => {
//   // Initialize WebSocket
//   initWebSocket();

//   // Set up event listeners
//   sendButton.addEventListener('click', sendMessage);
//   userInput.addEventListener('keypress', (e) => {
//     if (e.key === 'Enter') sendMessage();
//   });

//   // Load initial training stats
//   updateTrainingStats();
// });






