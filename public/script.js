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

function renderChart(chartData) {
  if (chart) chart.destroy();
  chartCanvas.style.display = 'block';

  // Determine final chart type (respect suggested type or auto-detect)
  const chartType = determineFinalChartType(chartData);

  // Common configuration
  const commonConfig = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.raw;
            // const percentage = chartData.percentages[context.dataIndex];
            // return `${label}: ${value} (${percentage})`;
            const percentage = chartData.percentages?.[context.dataIndex] || '';
            return `${label}: ${value}${percentage ? ` (${percentage})` : ''}`;
          }
        }
      },
      datalabels: {
        formatter: (value, ctx) => {
          // return chartData.percentages[ctx.dataIndex];
          // Show both value and percentage for pie charts
          // if (chartType === 'pie') {
          //   return `${value}\n(${chartData.percentages[ctx.dataIndex]})`;
          // }
          // // For other chart types, just show the value
          // return value;

          // For all chart types, show both value and percentage if available
          const percentage = chartData.percentages?.[ctx.dataIndex] || '';
          if (percentage) {
            return `${value}\n(${percentage})`;
          }
          return value;
        },
        color: function(context) {
          // For pie charts, use white text for better contrast
          if (context.chart.config.type === 'pie') {
            return '#fff';
          }
          // For other charts, use dark text
          return '#333';
        },
        font: {
          weight: 'bold',
          size: function(context) {
            // Smaller font for bar/line charts to prevent crowding
            return context.chart.config.type === 'pie' ? 14 : 12;
          }
        },
        // display: chartType === 'pie' ? 'auto' : 'auto'
        display: 'auto',
        anchor: 'center',
        align: 'center'
      }
    }
  };

  // Type-specific configurations
  const typeSpecificConfig = {
    bar: {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: chartData.y_label,
            
          }
        },
        x: {
          title: {
            display: true,
            text: chartData.x_label,
            
          }
        }
      },
      plugins: {
        datalabels: {
          anchor: 'end',
          align: 'top'
        }
      }
    },
    pie: {
      circumference: 360,
      rotation: -90,
      plugins: {
        datalabels: {
          // align: 'center',
          // anchor: 'center',
          formatter: (value, ctx) => {
            return `${ctx.chart.data.labels[ctx.dataIndex]}-${value}\n${chartData.percentages[ctx.dataIndex]}`;
        },
        color: '#fff'
      }
    }
    },
    line: {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: chartData.y_label
          }
        },
        x: {
          // type: 'time',
          type: chartData.labels.every(isDateLike) ? 'time' : 'category',
          time: {
            parser: 'YYYY-MM-DD',
            tooltipFormat: 'll'
          },
          title: {
            display: true,
            text: chartData.x_label
          }
        }
      },
      elements: {
        line: {
          tension: 0.4
        }
      },
      plugins: {
        datalabels: {
          anchor: 'end',
          align: 'top'
        }
      }
   }
};

  // Create the chart
  chart = new Chart(chartCanvas, {
    type: chartType,
    data: {
      labels: chartData.labels,
      datasets: [{
        label: chartData.datasets[0].label,
        data: chartData.datasets[0].data,
        backgroundColor: chartData.datasets[0].backgroundColor,
        borderColor: chartType === 'line' ? '#3498db' : chartData.datasets[0].borderColor,
        borderWidth: chartData.datasets[0].borderWidth,
        fill: chartType === 'line'
      }]
    },
    options: {
      ...commonConfig,
      ...typeSpecificConfig[chartType]
    },
    plugins: [ChartDataLabels]
  });
}

function determineFinalChartType(chartData) {
  // If server suggested a type, use that
  if (chartData.suggestedChartType) {
    return chartData.suggestedChartType;
  }
  
  // Auto-detect based on data characteristics
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
  

// function renderChart(chartData) {
//   if (chart) chart.destroy();
//   chartCanvas.style.display = 'block';

//   // Validate required fields
//   if (!chartData || !chartData.labels || !chartData.data || !chartData.percentages) {
//     console.error('Invalid chart data structure:', chartData);
//     return;
//   }

//   // Ensure data lengths match
//   if (chartData.labels.length !== chartData.data.length || 
//       chartData.labels.length !== chartData.percentages.length) {
//     console.error('Data length mismatch:', chartData);
//     return;
//   }

//   const chartType = detectChartType(chartData);
  
//   chart = new Chart(chartCanvas, {
//     type: chartType,
//     data: {
//       labels: chartData.labels,
//       datasets: [{
//         label: chartData.y_label || 'Values',
//         data: chartData.data,
//         backgroundColor: [
//           '#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#f1c40f', '#1abc9c'
//         ],
//         borderColor: '#333',
//         borderWidth: 1
//       }]
//     },
//     options: {
//       responsive: true,
//       plugins: {
//         tooltip: {
//           callbacks: {
//             label: function(context) {
//               const label = context.label || '';
//               const value = context.raw || 0;
//               const percentage = chartData.percentages[context.dataIndex];
//               return `${label}: ${value} (${percentage})`;
//             }
//           }
//         },
//         datalabels: {
//           formatter: (value, ctx) => {
//             return chartData.percentages[ctx.dataIndex];
//           },
//           color: '#fff',
//           font: {
//             weight: 'bold',
//             size: 14
//           }
//         }
//       }
//     },
//     plugins: [ChartDataLabels]
//   });
// }

// Render chart function
// function renderChart(chartData) {
//     // Validate data first
//   if (!chartData || !chartData.x || !chartData.y || 
//       chartData.x.length !== chartData.y.length) {
//     console.error("Invalid chart data format");
//     return;
//   }
//     if (chart) chart.destroy();
//     chartCanvas.style.display = 'block';

//     const chartType = detectChartType(chartData);
// chart = new Chart(chartCanvas, {
//     type: chartType,
//     data: {
//       labels: chartData.labels,
//       datasets: [{
//         label: chartData.y_label,
//         data: chartData.values,
//         backgroundColor: ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6'],
//         borderColor: '#333',
//         borderWidth: 1
//       }]
//     },
//     options: {
//       responsive: true,
//       plugins: {
//         legend: { position: 'top' },
//         tooltip: {
//           callbacks: {
//             label: function(context) {
//               const label = context.label || '';
//               const value = context.raw || 0;
//               const percentage = chartData.percentages[context.dataIndex];
//               return `${label}: ${value} (${percentage})`;
//             }
//           }
//         },
//         datalabels: {
//           formatter: (value, ctx) => {
//             return chartData.percentages[ctx.dataIndex];
//           },
//           color: '#fff',
//           font: {
//             weight: 'bold'
//           }
//         }
//       },
//       scales: {
//         y: {
//           beginAtZero: true,
//           title: {
//             display: true,
//             text: chartData.y_label
//           }
//         },
//         x: {
//           title: {
//             display: true,
//             text: chartData.x_label
//           }
//         }
//       }
//     },
//     plugins: [ChartDataLabels] // Add this plugin
//   });
// }

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
// const documentUploadBtn = document.getElementById('uploadDocumentBtn');
// const documentUploadInput = document.getElementById('documentUpload');
// const documentUploadStatus = document.getElementById('documentUploadStatus');

// let chart;
// let messages = [];

// // Helper function to detect chart type
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
//     // Before renderChart() call
//   console.log('Chart data received:', JSON.stringify(chartData, null, 2));
//   // Clear previous chart if exists
//   if (chart) {
//     chart.destroy();
//   }

//   // Validate the data structure
//   if (!chartData?.labels || !chartData?.datasets?.[0]?.data) {
//     console.error('Invalid chart data structure:', chartData);
//     return;
//   }

//   // Create the chart
//   chart = new Chart(chartCanvas.getContext('2d'), {
//     type: 'bar',
//     data: {
//       labels: chartData.labels,
//       datasets: [{
//         label: chartData.datasets[0].label,
//         data: chartData.datasets[0].data,
//         backgroundColor: chartData.datasets[0].backgroundColor,
//         borderColor: chartData.datasets[0].borderColor,
//         borderWidth: chartData.datasets[0].borderWidth
//       }]
//     },
//     options: {
//       responsive: true,
//       plugins: {
//         legend: {
//           position: 'top',
//         },
//         tooltip: {
//           callbacks: {
//             label: (context) => {
//               const label = context.dataset.label || '';
//               const value = context.raw;
//               const percentage = chartData.percentages[context.dataIndex];
//               return `${label}: ${value} (${percentage})`;
//             }
//           }
//         },
//         datalabels: {
//           formatter: (value, ctx) => {
//             return chartData.percentages[ctx.dataIndex];
//           },
//           color: '#fff',
//           font: {
//             weight: 'bold'
//           }
//         }
//       },
//       scales: {
//         y: {
//           beginAtZero: true,
//           title: {
//             display: true,
//             text: chartData.y_label
//           }
//         },
//         x: {
//           title: {
//             display: true,
//             text: chartData.x_label
//           }
//         }
//       }
//     },
//     plugins: [ChartDataLabels]
//   });
//   // After renderChart() call
// if (!chart) {
//   console.error('Chart failed to initialize');
// }
// }
// // function renderChart(chartData) {
// //   if (chart) chart.destroy();
// //   chartCanvas.style.display = 'block';

// //   // Validate required fields
// //   if (!chartData || !chartData.labels || !chartData.data || !chartData.percentages) {
// //     console.error('Invalid chart data structure:', chartData);
// //     return;
// //   }

// //   // Ensure data lengths match
// //   if (chartData.labels.length !== chartData.data.length || 
// //       chartData.labels.length !== chartData.percentages.length) {
// //     console.error('Data length mismatch:', chartData);
// //     return;
// //   }

// //   const chartType = detectChartType(chartData);
  
// //   chart = new Chart(chartCanvas, {
// //     type: chartType,
// //     data: {
// //       labels: chartData.labels,
// //       datasets: [{
// //         label: chartData.y_label || 'Values',
// //         data: chartData.data,
// //         backgroundColor: [
// //           '#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#f1c40f', '#1abc9c'
// //         ],
// //         borderColor: '#333',
// //         borderWidth: 1
// //       }]
// //     },
// //     options: {
// //       responsive: true,
// //       plugins: {
// //         tooltip: {
// //           callbacks: {
// //             label: function(context) {
// //               const label = context.label || '';
// //               const value = context.raw || 0;
// //               const percentage = chartData.percentages[context.dataIndex];
// //               return `${label}: ${value} (${percentage})`;
// //             }
// //           }
// //         },
// //         datalabels: {
// //           formatter: (value, ctx) => {
// //             return chartData.percentages[ctx.dataIndex];
// //           },
// //           color: '#fff',
// //           font: {
// //             weight: 'bold',
// //             size: 14
// //           }
// //         }
// //       }
// //     },
// //     plugins: [ChartDataLabels]
// //   });
// // }

// // Render chart function
// // function renderChart(chartData) {
// //     // Validate data first
// //   if (!chartData || !chartData.x || !chartData.y || 
// //       chartData.x.length !== chartData.y.length) {
// //     console.error("Invalid chart data format");
// //     return;
// //   }
// //     if (chart) chart.destroy();
// //     chartCanvas.style.display = 'block';

// //     const chartType = detectChartType(chartData);
// // chart = new Chart(chartCanvas, {
// //     type: chartType,
// //     data: {
// //       labels: chartData.labels,
// //       datasets: [{
// //         label: chartData.y_label,
// //         data: chartData.values,
// //         backgroundColor: ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6'],
// //         borderColor: '#333',
// //         borderWidth: 1
// //       }]
// //     },
// //     options: {
// //       responsive: true,
// //       plugins: {
// //         legend: { position: 'top' },
// //         tooltip: {
// //           callbacks: {
// //             label: function(context) {
// //               const label = context.label || '';
// //               const value = context.raw || 0;
// //               const percentage = chartData.percentages[context.dataIndex];
// //               return `${label}: ${value} (${percentage})`;
// //             }
// //           }
// //         },
// //         datalabels: {
// //           formatter: (value, ctx) => {
// //             return chartData.percentages[ctx.dataIndex];
// //           },
// //           color: '#fff',
// //           font: {
// //             weight: 'bold'
// //           }
// //         }
// //       },
// //       scales: {
// //         y: {
// //           beginAtZero: true,
// //           title: {
// //             display: true,
// //             text: chartData.y_label
// //           }
// //         },
// //         x: {
// //           title: {
// //             display: true,
// //             text: chartData.x_label
// //           }
// //         }
// //       }
// //     },
// //     plugins: [ChartDataLabels] // Add this plugin
// //   });
// // }

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
//                 <span class="success">✓ Document uploaded successfully!</span>
//                 <div>Name: ${result.document.name}</div>
//                 <div>ID: ${result.document.id}</div>
//             `;
            
//             // Add a system message about the uploaded document
//             chatBox.innerHTML += `
//                 <div class="system-message">
//                     <b>System:</b> Document "${result.document.name}" uploaded successfully. 
//                     You can now ask questions about it.
//                 </div>
//             `;
//             chatBox.scrollTop = chatBox.scrollHeight;
//         } else {
//             documentUploadStatus.innerHTML = '<span class="error">✗ Failed to upload document</span>';
//         }
//     } catch (err) {
//         documentUploadStatus.innerHTML = `<span class="error">✗ ${err.message}</span>`;
//     }
// });

// // Main chat handler
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
//             // Handle document responses
//             // if (data.document_info) {
//             //     chatBox.innerHTML += `
//             //     <div class="document-response">
//             //        <b>Meeting Minutes (${data.document_info.date}):</b>
//             //        <div class="document-content">${data.human_answer}</div>
//             //        <div class="document-meta">
//             //           Source: ${data.document_info.name}
//             //        </div>
//             //     </div>
//             //      `;
//             // } 
//             // In your sendButton event listener, modify the document response handling:
// if (data.document_info) {
//   // Clean up the response to remove unwanted formatting
//   let cleanAnswer = data.human_answer
//     .replace(/###\s*"\d+\.\s*[^"]+":/g, '') // Remove section headers
//     .replace(/"/g, '') // Remove quotation marks
//     .trim();
  
//   chatBox.innerHTML += `
//     <div class="document-response">
//       <b>${data.document_info.project} (${data.document_info.date}):</b>
//       <div class="document-content">${cleanAnswer}</div>
//     </div>
//   `;
// }
//             // Handle chart responses
//             else if (data.chart_data) {
//                 chatBox.innerHTML += `<div><b>Chart Data JSON:</b> <code>${JSON.stringify(data.chart_data, null, 2)}</code></div>`;
//                 renderChart(data.chart_data);
//             } 
//             // Handle regular SQL query responses
//             else {
//                 let formattedResult = "";
//                 if (data.db_result && data.db_result.rows.length > 0) {
//                     data.db_result.rows.forEach(row => {
//                         formattedResult += Object.values(row).join(' | ') + "\n";
//                     });
//                 } else {
//                     formattedResult = "No data found.";
//                 }

//                 chatBox.innerHTML += `
//                     <div><b>SQL Query:</b> <code>${data.sql_query}</code></div>
//                     <div><b>Result:</b><br>${formattedResult}</div>
//                     <div><b>Answer:</b> <code>${data.human_answer}</code></div>
//                 `;
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

// // Upload handler for training data
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