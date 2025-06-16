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
        chatBox.innerHTML += `<div class="error-message"><b>Error:</b> ${data.human_answer || data.message}</div>`;
         } else if (data.answers) {
        // Handle document responses
        data.answers.forEach(answer => {
            const cleanAnswer = answer.answer
                .replace(/\*\*/g, '') // Remove markdown bold
                .replace(/-\s/g, '<br>- ') // Convert list to HTML
                .trim();
            
            chatBox.innerHTML += `
                <div class="document-response">
                    <b>From ${answer.document_info.name}:</b>
                    <div class="document-answer">${cleanAnswer}</div>
                    <small>Source: ${answer.document_info.url}</small>
                </div>
            `;
        });
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
        

          chatBox.scrollTop = chatBox.scrollHeight;
          }catch (error) {
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
//   if (chart) chart.destroy();
//   chartCanvas.style.display = 'block';

//   // Determine final chart type (respect suggested type or auto-detect)
//   const chartType = determineFinalChartType(chartData);

//   // Common configuration
//   const commonConfig = {
//     responsive: true,
//     maintainAspectRatio: false,
//     plugins: {
//       legend: {
//         position: 'right',
//       },
//       tooltip: {
//         callbacks: {
//           label: (context) => {
//             const label = context.label || '';
//             const value = context.raw;
//             // const percentage = chartData.percentages[context.dataIndex];
//             // return `${label}: ${value} (${percentage})`;
//             const percentage = chartData.percentages?.[context.dataIndex] || '';
//             return `${label}: ${value}${percentage ? ` (${percentage})` : ''}`;
//           }
//         }
//       },
//       datalabels: {
//         formatter: (value, ctx) => {
//           // return chartData.percentages[ctx.dataIndex];
//           // Show both value and percentage for pie charts
//           // if (chartType === 'pie') {
//           //   return `${value}\n(${chartData.percentages[ctx.dataIndex]})`;
//           // }
//           // // For other chart types, just show the value
//           // return value;

//           // For all chart types, show both value and percentage if available
//           const percentage = chartData.percentages?.[ctx.dataIndex] || '';
//           if (percentage) {
//             return `${value}\n(${percentage})`;
//           }
//           return value;
//         },
//         color: function(context) {
//           // For pie charts, use white text for better contrast
//           if (context.chart.config.type === 'pie') {
//             return '#fff';
//           }
//           // For other charts, use dark text
//           return '#333';
//         },
//         font: {
//           weight: 'bold',
//           size: function(context) {
//             // Smaller font for bar/line charts to prevent crowding
//             return context.chart.config.type === 'pie' ? 14 : 12;
//           }
//         },
//         // display: chartType === 'pie' ? 'auto' : 'auto'
//         display: 'auto',
//         anchor: 'center',
//         align: 'center'
//       }
//     }
//   };

//   // Type-specific configurations
//   const typeSpecificConfig = {
//     bar: {
//       scales: {
//         y: {
//           beginAtZero: true,
//           title: {
//             display: true,
//             text: chartData.y_label,
            
//           }
//         },
//         x: {
//           title: {
//             display: true,
//             text: chartData.x_label,
            
//           }
//         }
//       },
//       plugins: {
//         datalabels: {
//           anchor: 'end',
//           align: 'top'
//         }
//       }
//     },
//     pie: {
//       circumference: 360,
//       rotation: -90,
//       plugins: {
//         datalabels: {
//           // align: 'center',
//           // anchor: 'center',
//           formatter: (value, ctx) => {
//             return `${ctx.chart.data.labels[ctx.dataIndex]}-${value}\n${chartData.percentages[ctx.dataIndex]}`;
//         },
//         color: '#fff'
//       }
//     }
//     },
//     line: {
//       scales: {
//         y: {
//           beginAtZero: true,
//           title: {
//             display: true,
//             text: chartData.y_label
//           }
//         },
//         x: {
//           // type: 'time',
//           type: chartData.labels.every(isDateLike) ? 'time' : 'category',
//           time: {
//             parser: 'YYYY-MM-DD',
//             tooltipFormat: 'll'
//           },
//           title: {
//             display: true,
//             text: chartData.x_label
//           }
//         }
//       },
//       elements: {
//         line: {
//           tension: 0.4
//         }
//       },
//       plugins: {
//         datalabels: {
//           anchor: 'end',
//           align: 'top'
//         }
//       }
//    }
// };

//   // Create the chart
//   chart = new Chart(chartCanvas, {
//     type: chartType,
//     data: {
//       labels: chartData.labels,
//       datasets: [{
//         label: chartData.datasets[0].label,
//         data: chartData.datasets[0].data,
//         backgroundColor: chartData.datasets[0].backgroundColor,
//         borderColor: chartType === 'line' ? '#3498db' : chartData.datasets[0].borderColor,
//         borderWidth: chartData.datasets[0].borderWidth,
//         fill: chartType === 'line'
//       }]
//     },
//     options: {
//       ...commonConfig,
//       ...typeSpecificConfig[chartType]
//     },
//     plugins: [ChartDataLabels]
//   });
// }

// function determineFinalChartType(chartData) {
//   // If server suggested a type, use that
//   if (chartData.suggestedChartType) {
//     return chartData.suggestedChartType;
//   }
  
//   // Auto-detect based on data characteristics
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
//         chatBox.innerHTML += `<div class="error-message"><b>Error:</b> ${data.human_answer || data.message}</div>`;
//          } else if (data.answers) {
//         // Handle document responses
//         data.answers.forEach(answer => {
//             const cleanAnswer = answer.answer
//                 .replace(/\*\*/g, '') // Remove markdown bold
//                 .replace(/-\s/g, '<br>- ') // Convert list to HTML
//                 .trim();
            
//             chatBox.innerHTML += `
//                 <div class="document-response">
//                     <b>From ${answer.document_info.name}:</b>
//                     <div class="document-answer">${cleanAnswer}</div>
//                     <small>Source: ${answer.document_info.url}</small>
//                 </div>
//             `;
//         });
//         }
      
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
        

//           chatBox.scrollTop = chatBox.scrollHeight;
//           }catch (error) {
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

