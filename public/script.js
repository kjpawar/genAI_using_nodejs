const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const chartCanvas = document.getElementById('chart');
const documentUploadBtn = document.getElementById('uploadDocumentBtn');
const documentUploadInput = document.getElementById('documentUpload');
const documentUploadStatus = document.getElementById('documentUploadStatus');

let chart;
let messages = [];

// Helper function to detect chart type
function detectChartType(chartData) {
    const xLabels = chartData.x;
    if (xLabels.every(label => /^\d{4}$/.test(label) || /^\d{4}-\d{2}-\d{2}$/.test(label))) {
        return 'line';
    } else if (xLabels.length <= 5) {
        return 'pie';
    } else {
        return 'bar';
    }
}

// Render chart function
function renderChart(chartData) {
    if (chart) chart.destroy();
    chartCanvas.style.display = 'block';

    const chartType = detectChartType(chartData);

    chart = new Chart(chartCanvas, {
        type: chartType,
        data: {
            labels: chartData.x,
            datasets: [{
                label: chartData.y_label || 'Values',
                data: chartData.y,
                backgroundColor: ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#f1c40f', '#1abc9c'],
                borderColor: '#333',
                borderWidth: 1,
                fill: false,
                tension: 0.4
            }]
        },
        options: {
            responsive: false,
            plugins: {
                legend: { position: chartType === 'pie' ? 'top' : 'bottom' },
                title: { display: true, text: 'Generated Chart' }
            },
            scales: (chartType !== 'pie') ? {
                x: { title: { display: true, text: chartData.x_label || 'X Axis' } },
                y: { title: { display: true, text: chartData.y_label || 'Y Axis' }, beginAtZero: true }
            } : {}
        }
    });
}

// Document upload handler
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
                <span class="success">✓ Document uploaded successfully!</span>
                <div>Name: ${result.document.name}</div>
                <div>ID: ${result.document.id}</div>
            `;
            
            // Add a system message about the uploaded document
            chatBox.innerHTML += `
                <div class="system-message">
                    <b>System:</b> Document "${result.document.name}" uploaded successfully. 
                    You can now ask questions about it.
                </div>
            `;
            chatBox.scrollTop = chatBox.scrollHeight;
        } else {
            documentUploadStatus.innerHTML = '<span class="error">✗ Failed to upload document</span>';
        }
    } catch (err) {
        documentUploadStatus.innerHTML = `<span class="error">✗ ${err.message}</span>`;
    }
});

// Main chat handler
sendButton.addEventListener('click', async () => {
    const message = userInput.value.trim();
    if (!message) return;

    messages.push({ role: 'user', content: message });
    chatBox.innerHTML += `<div><b>You:</b> ${message}</div>`;

    const loadingMessageId = `loading-${Date.now()}`;
    chatBox.innerHTML += `<div id="${loadingMessageId}"><div class="spinner"></div></div>`;
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages })
        });

        const data = await response.json();
        const loadingDiv = document.getElementById(loadingMessageId);
        if (loadingDiv) loadingDiv.remove();

        if (data.error) {
            chatBox.innerHTML += `<div style="color:red;"><b>Error:</b> ${data.human_answer}</div>`;
        } else {
            // Handle document responses
            // if (data.document_info) {
            //     chatBox.innerHTML += `
            //     <div class="document-response">
            //        <b>Meeting Minutes (${data.document_info.date}):</b>
            //        <div class="document-content">${data.human_answer}</div>
            //        <div class="document-meta">
            //           Source: ${data.document_info.name}
            //        </div>
            //     </div>
            //      `;
            // } 
            // In your sendButton event listener, modify the document response handling:
if (data.document_info) {
  // Clean up the response to remove unwanted formatting
  let cleanAnswer = data.human_answer
    .replace(/###\s*"\d+\.\s*[^"]+":/g, '') // Remove section headers
    .replace(/"/g, '') // Remove quotation marks
    .trim();
  
  chatBox.innerHTML += `
    <div class="document-response">
      <b>${data.document_info.project} (${data.document_info.date}):</b>
      <div class="document-content">${cleanAnswer}</div>
    </div>
  `;
}
            // Handle chart responses
            else if (data.chart_data) {
                chatBox.innerHTML += `<div><b>Chart Data JSON:</b> <code>${JSON.stringify(data.chart_data, null, 2)}</code></div>`;
                renderChart(data.chart_data);
            } 
            // Handle regular SQL query responses
            else {
                let formattedResult = "";
                if (data.db_result && data.db_result.rows.length > 0) {
                    data.db_result.rows.forEach(row => {
                        formattedResult += Object.values(row).join(' | ') + "\n";
                    });
                } else {
                    formattedResult = "No data found.";
                }

                chatBox.innerHTML += `
                    <div><b>SQL Query:</b> <code>${data.sql_query}</code></div>
                    <div><b>Result:</b><br>${formattedResult}</div>
                    <div><b>Answer:</b> <code>${data.human_answer}</code></div>
                `;
            }
        }

        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (error) {
        console.error('Error:', error);
        const loadingDiv = document.getElementById(loadingMessageId);
        if (loadingDiv) loadingDiv.innerHTML = '<i>Error fetching response.</i>';
    }

    userInput.value = '';
});

// Update training stats
async function updateTrainingStats() {
    const res = await fetch('/training-status');
    const data = await res.json();
    document.getElementById('exampleCount').textContent = data.example_count;
    if (data.last_updated) {
        const date = new Date(data.last_updated * 1000);
        document.getElementById('lastTrained').textContent = date.toLocaleString();
    }
}

// Upload handler for training data
document.getElementById('uploadBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('datasetUpload');
    if (!fileInput.files.length) return;
    
    const statusDiv = document.getElementById('uploadStatus');
    statusDiv.innerHTML = '<span class="uploading">Processing...</span>';
    
    try {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        
        const res = await fetch('/upload-dataset', {
            method: 'POST',
            body: formData
        });
        
        const result = await res.json();
        
        if (result.status === "exists") {
            statusDiv.innerHTML = '<span class="warning">ℹ️ Model already knows this dataset</span>';
        } else if (result.added > 0) {
            statusDiv.innerHTML = `<span class="success">✓ Added ${result.added} new examples</span>`;
        } else {
            statusDiv.innerHTML = '<span class="warning">⚠️ No new examples added</span>';
        }
        
        updateTrainingStats();
    } catch (err) {
        statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
    }
});

// Initialize
updateTrainingStats();



// const chatBox = document.getElementById('chatBox');
// const userInput = document.getElementById('userInput');
// const sendButton = document.getElementById('sendButton');
// const chartCanvas = document.getElementById('chart');
// let chart;
// let messages = [];


// // // Add this event listener for document uploads
// // document.getElementById('uploadDocumentBtn').addEventListener('click', async () => {
// //     const fileInput = document.getElementById('documentUpload');
// //     if (!fileInput.files.length) return;
    
// //     const statusDiv = document.getElementById('documentUploadStatus');
// //     statusDiv.innerHTML = '<span class="uploading">Uploading document...</span>';
    
// //     try {
// //         const formData = new FormData();
// //         formData.append('document', fileInput.files[0]);
        
// //         const res = await fetch('/upload-document', {
// //             method: 'POST',
// //             body: formData
// //         });
        
// //         const result = await res.json();
        
// //         if (result.success) {
// //             statusDiv.innerHTML = `
// //                 <span class="success">✓ Document uploaded successfully!</span>
// //                 <div>Name: ${result.document.name}</div>
// //                 <div>ID: ${result.document.id}</div>
// //             `;
// //         } else {
// //             statusDiv.innerHTML = '<span class="error">✗ Failed to upload document</span>';
// //         }
// //     } catch (err) {
// //         statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
// //     }
// // });

// // // Add this function to query documents
// // async function queryDocument(documentId, question) {
// //     const loadingMessageId = `doc-loading-${Date.now()}`;
// //     chatBox.innerHTML += `<div id="${loadingMessageId}"><div class="spinner"></div>Querying document...</div>`;
// //     chatBox.scrollTop = chatBox.scrollHeight;

// //     try {
// //         const response = await fetch('/query-document', {
// //             method: 'POST',
// //             headers: { 'Content-Type': 'application/json' },
// //             body: JSON.stringify({ 
// //                 documentId: documentId,
// //                 question: question
// //             })
// //         });

// //         const data = await response.json();
// //         const loadingDiv = document.getElementById(loadingMessageId);
// //         if (loadingDiv) loadingDiv.remove();

// //         if (data.error) {
// //             chatBox.innerHTML += `<div style="color:red;"><b>Error:</b> ${data.error}</div>`;
// //         } else {
// //             chatBox.innerHTML += `<div><b>Document Answer:</b> ${data.answer}</div>`;
// //         }
// //     } catch (error) {
// //         console.error('Document query error:', error);
// //         const loadingDiv = document.getElementById(loadingMessageId);
// //         if (loadingDiv) loadingDiv.innerHTML = '<i>Error querying document.</i>';
// //     }
// // }

// // // Modify your existing chat handler to detect document queries
// // sendButton.addEventListener('click', async () => {
// //     const message = userInput.value.trim();
// //     if (!message) return;

// //     // Check if this is a document query (you might want a better detection mechanism)
// //     if (message.toLowerCase().includes("document") || message.toLowerCase().includes("file")) {
// //         // Extract document ID from message or prompt user to select one
// //         // For now, we'll just show a message
// //         chatBox.innerHTML += `<div>Please use the document ID to query specific documents.</div>`;
// //         return;
// //     }

// //     // Rest of your existing chat code...
// // });










// function detectChartType(chartData) {
//     const xLabels = chartData.x;
//     if (xLabels.every(label => /^\d{4}$/.test(label) || /^\d{4}-\d{2}-\d{2}$/.test(label))) {
//         return 'line';
//     } else if (xLabels.length <= 5) {
//         return 'pie';
//     } else {
//         return 'bar';
//     }
// }

// function renderChart(chartData) {
//     if (chart) chart.destroy();
//     chartCanvas.style.display = 'block';

//     const chartType = detectChartType(chartData);

//     chart = new Chart(chartCanvas, {
//         type: chartType,
//         data: {
//             labels: chartData.x,
//             datasets: [{
//                 label: chartData.y_label || 'Values',
//                 data: chartData.y,
//                 backgroundColor: ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#f1c40f', '#1abc9c'],
//                 borderColor: '#333',
//                 borderWidth: 1,
//                 fill: false,
//                 tension: 0.4
//             }]
//         },
//         options: {
//             responsive: false,
//             plugins: {
//                 legend: { position: chartType === 'pie' ? 'top' : 'bottom' },
//                 title: { display: true, text: 'Generated Chart' }
//             },
//             scales: (chartType !== 'pie') ? {
//                 x: { title: { display: true, text: chartData.x_label || 'X Axis' } },
//                 y: { title: { display: true, text: chartData.y_label || 'Y Axis' }, beginAtZero: true }
//             } : {}
//         }
//     });
// }

// sendButton.addEventListener('click', async () => {
//     const message = userInput.value.trim();
//     if (!message) return;

//     messages.push({ role: 'user', content: message });
//     chatBox.innerHTML += `<div><b>You:</b> ${message}</div>`;

//     const loadingMessageId = `loading-${Date.now()}`;
//     chatBox.innerHTML += `<div id="${loadingMessageId}"><div class="spinner"></div></div>`;
//     chatBox.scrollTop = chatBox.scrollHeight;

//     try {
//         const response = await fetch('/chat', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ messages })
//         });

//         const data = await response.json();
//         const loadingDiv = document.getElementById(loadingMessageId);
//         if (loadingDiv) loadingDiv.remove();

//         if (data.error) {
//             chatBox.innerHTML += `<div style="color:red;"><b>Error:</b> ${data.human_answer}</div>`;
//         } else {
//             chatBox.innerHTML += `<div><b>SQL Query:</b> <code>${data.sql_query}</code></div>`;

//             if (data.chart_data) {
//                 chatBox.innerHTML += `<div><b>Chart Data JSON:</b> <code>${JSON.stringify(data.chart_data, null, 2)}</code></div>`;
//                 renderChart(data.chart_data);
//             } else {
//                 let formattedResult = "";
//                 if (data.db_result && data.db_result.rows.length > 0) {
//                     data.db_result.rows.forEach(row => {
//                         formattedResult += Object.values(row).join(' | ') + "\n";
//                     });
//                 } else {
//                     formattedResult = "No data found.";
//                 }

//                 chatBox.innerHTML += `<div><b>Result:</b><br>${formattedResult}</div>`;
//                 chatBox.innerHTML += `<div><b>Gemini Answer:</b> <code>${data.human_answer}</code></div>`;
//             }
//         }

//         chatBox.scrollTop = chatBox.scrollHeight;
//     } catch (error) {
//         console.error('Error:', error);
//         const loadingDiv = document.getElementById(loadingMessageId);
//         if (loadingDiv) loadingDiv.innerHTML = '<i>Error fetching response.</i>';
//     }

//     userInput.value = '';
// });

// // Update training stats
// async function updateTrainingStats() {
//     const res = await fetch('/training-status');
//     const data = await res.json();
//     document.getElementById('exampleCount').textContent = data.example_count;
//     if (data.last_updated) {
//         const date = new Date(data.last_updated * 1000);
//         document.getElementById('lastTrained').textContent = date.toLocaleString();
//     }
// }

// // Upload handler
// document.getElementById('uploadBtn').addEventListener('click', async () => {
//     const fileInput = document.getElementById('datasetUpload');
//     if (!fileInput.files.length) return;
    
//     const statusDiv = document.getElementById('uploadStatus');
//     statusDiv.innerHTML = '<span class="uploading">Processing...</span>';
    
//     try {
//         const formData = new FormData();
//         formData.append('file', fileInput.files[0]);
        
//         const res = await fetch('/upload-dataset', {
//             method: 'POST',
//             body: formData
//         });
        
//         const result = await res.json();
        
//         if (result.status === "exists") {
//             statusDiv.innerHTML = '<span class="warning">ℹ️ Model already knows this dataset</span>';
//         } else if (result.added > 0) {
//             statusDiv.innerHTML = `<span class="success">✓ Added ${result.added} new examples</span>`;
//         } else {
//             statusDiv.innerHTML = '<span class="warning">⚠️ No new examples added</span>';
//         }
        
//         updateTrainingStats();
//     } catch (err) {
//         statusDiv.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//     }

// });

// // Initialize
// updateTrainingStats();