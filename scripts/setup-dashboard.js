const path = require('path');
const { execSync } = require('child_process');

console.log('Setting up React dashboard...');

try {
  // Navigate to dashboard directory
  const dashboardDir = path.join(__dirname, '..', 'src', 'dashboard');
  
  // Create React app
  execSync('npx create-react-app . --template typescript', { 
    cwd: dashboardDir, 
    stdio: 'inherit' 
  });
  
  console.log('React app created successfully!');
  
  // Install additional dependencies
  console.log('Installing additional dependencies...');
  execSync('npm install @microsoft/signalr @azure/msal-browser @azure/msal-react @mui/material @mui/icons-material @emotion/react @emotion/styled chart.js react-chartjs-2 chartjs-adapter-date-fns date-fns axios recharts react-grid-layout react-query', { 
    cwd: dashboardDir, 
    stdio: 'inherit' 
  });
  
  console.log('Dashboard setup complete!');
} catch (error) {
  console.error('Error setting up dashboard:', error.message);
  process.exit(1);
}