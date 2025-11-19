#!/usr/bin/env node

require('dotenv').config();
const { DefaultAzureCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { execSync } = require('child_process');
const path = require('path');

async function setupAzureEnvironment() {
  console.log('🚀 Setting up Azure environment for SmartLiving IoT Dashboard...\n');

  try {
    // Validate Azure CLI
    console.log('1️⃣ Checking Azure CLI...');
    execSync('az --version', { stdio: 'pipe' });
    console.log('✅ Azure CLI is available\n');

    // Check if logged in
    console.log('2️⃣ Checking Azure authentication...');
    try {
      const accountInfo = execSync('az account show', { encoding: 'utf8' });
      const account = JSON.parse(accountInfo);
      console.log(`✅ Authenticated as: ${account.user.name}`);
      console.log(`📋 Subscription: ${account.name} (${account.id})\n`);
    } catch (error) {
      console.log('❌ Not authenticated to Azure. Please run: az login');
      return false;
    }

    // Create resource group
    console.log('3️⃣ Creating resource group...');
    const resourceGroupName = 'smartliving-rg';
    const location = 'East US';
    
    try {
      execSync(`az group create --name ${resourceGroupName} --location "${location}"`, { 
        stdio: 'pipe' 
      });
      console.log(`✅ Resource group '${resourceGroupName}' created in ${location}\n`);
    } catch (error) {
      console.log(`⚠️ Resource group '${resourceGroupName}' may already exist\n`);
    }

    // Deploy infrastructure
    console.log('4️⃣ Deploying Azure infrastructure...');
    const bicepPath = path.join(__dirname, '..', 'src', 'infrastructure', 'main.bicep');
    const parametersPath = path.join(__dirname, '..', 'src', 'infrastructure', 'main.parameters.json');
    
    console.log('📝 Deploying Bicep template...');
    const deploymentResult = execSync(
      `az deployment group create --resource-group ${resourceGroupName} --template-file "${bicepPath}" --parameters "@${parametersPath}"`,
      { encoding: 'utf8' }
    );
    
    const deployment = JSON.parse(deploymentResult);
    console.log('✅ Infrastructure deployment completed\n');

    // Extract outputs
    const outputs = deployment.properties.outputs;
    console.log('5️⃣ Extracting deployment outputs...');
    
    const connectionStrings = {
      IOT_HUB_CONNECTION_STRING: outputs.iotHubConnectionString?.value,
      SQL_CONNECTION_STRING: `Server=tcp:${outputs.sqlServerFqdn?.value},1433;Initial Catalog=SmartLivingDB;Persist Security Info=False;User ID=smartliving_admin;Password=YourStrongPassword123!;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`,
      SIGNALR_CONNECTION_STRING: outputs.signalRConnectionString?.value,
      AZURE_STORAGE_CONNECTION_STRING: `DefaultEndpointsProtocol=https;AccountName=${outputs.storageAccountName?.value};AccountKey=<storage-key>;EndpointSuffix=core.windows.net`,
      KEY_VAULT_URL: outputs.keyVaultUrl?.value,
      APPLICATION_INSIGHTS_CONNECTION_STRING: `InstrumentationKey=${outputs.appInsightsInstrumentationKey?.value}`
    };

    // Create .env file
    console.log('6️⃣ Creating environment configuration...');
    const envContent = `# Azure SmartLiving IoT Dashboard Configuration
# Generated on ${new Date().toISOString()}

# Azure Subscription
AZURE_SUBSCRIPTION_ID=${process.env.AZURE_SUBSCRIPTION_ID || 'your-subscription-id'}
AZURE_TENANT_ID=${process.env.AZURE_TENANT_ID || 'your-tenant-id'}

# Azure IoT Hub
${Object.entries(connectionStrings)
  .map(([key, value]) => `${key}=${value || 'to-be-configured'}`)
  .join('\n')}

# Dashboard Configuration
REACT_APP_API_BASE_URL=https://${outputs.functionAppName?.value}.azurewebsites.net
REACT_APP_SIGNALR_URL=https://smartliving-signalr.service.signalr.net

# Development Settings
NODE_ENV=development
PORT=3000
FUNCTIONS_PORT=7071

# Device Simulation
DEVICE_ID=raspberry-pi-01
TELEMETRY_INTERVAL=30000
SIMULATE_DEVICES=true
`;

    const envPath = path.join(__dirname, '..', '.env');
    require('fs').writeFileSync(envPath, envContent);
    console.log(`✅ Environment file created: ${envPath}\n`);

    // Setup database
    console.log('7️⃣ Setting up SQL Database...');
    const sqlScriptPath = path.join(__dirname, '..', 'src', 'database', 'schema.sql');
    
    console.log('📊 Running database schema script...');
    try {
      execSync(`sqlcmd -S ${outputs.sqlServerFqdn?.value} -d SmartLivingDB -U smartliving_admin -P "YourStrongPassword123!" -i "${sqlScriptPath}"`, {
        stdio: 'pipe'
      });
      console.log('✅ Database schema created successfully\n');
    } catch (error) {
      console.log('⚠️ Database setup may require manual configuration\n');
    }

    // Install dependencies
    console.log('8️⃣ Installing project dependencies...');
    
    console.log('📦 Installing root dependencies...');
    execSync('npm install', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    
    console.log('📦 Installing Azure Functions dependencies...');
    execSync('npm install', { 
      stdio: 'inherit', 
      cwd: path.join(__dirname, '..', 'src', 'azure-functions') 
    });
    
    console.log('📦 Installing device simulator dependencies...');
    execSync('npm install', { 
      stdio: 'inherit', 
      cwd: path.join(__dirname, '..', 'src', 'device-simulator') 
    });

    console.log('\n🎉 Azure setup completed successfully!\n');
    
    // Display next steps
    console.log('📋 Next steps:');
    console.log('1. Review and update the .env file with your specific configuration');
    console.log('2. Configure Azure AD B2C for authentication');
    console.log('3. Update firewall rules for SQL Database');
    console.log('4. Deploy Azure Functions: npm run deploy:functions');
    console.log('5. Build and deploy dashboard: npm run deploy:dashboard');
    console.log('6. Start device simulation: npm run simulate:devices\n');

    console.log('🔧 Development commands:');
    console.log('- npm run dev                 # Start development servers');
    console.log('- npm run deploy             # Deploy to Azure');
    console.log('- npm run simulate:devices   # Start device simulator\n');

    return true;

  } catch (error) {
    console.error('❌ Error during Azure setup:', error.message);
    console.error('\nPlease check your Azure CLI authentication and permissions.');
    return false;
  }
}

// Run setup if called directly
if (require.main === module) {
  setupAzureEnvironment().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { setupAzureEnvironment };