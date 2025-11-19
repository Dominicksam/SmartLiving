# SmartLiving IoT Dashboard

A comprehensive IoT dashboard for smart home management using Azure cloud services and Microsoft SQL Server.

## Architecture Overview

This project leverages Microsoft Azure's IoT platform to provide:
- **Azure IoT Hub**: Device connectivity and message routing
- **Azure Functions**: Serverless backend processing
- **Azure SignalR Service**: Real-time communication
- **Azure SQL Database**: Scalable data storage
- **Azure Active Directory**: Authentication and authorization
- **Azure Key Vault**: Secure credential management

## Features

- 🏠 **Real-time sensor monitoring** with live data visualization
- 📊 **Interactive dashboards** built with Chart.js and React
- 🎛️ **Device control interfaces** for smart home automation
- 📈 **Data analytics & trends** with historical insights
- 🤖 **Automation rules** with event-driven triggers
- 📱 **Mobile responsive** design with PWA capabilities
- 🔒 **Enterprise security** with Azure AD integration

## Technology Stack

### Cloud Services
- Azure IoT Hub
- Azure Functions (Node.js)
- Azure SignalR Service
- Azure SQL Database
- Azure Active Directory B2C
- Azure Key Vault
- Azure Application Insights

### Frontend
- React 18 with TypeScript
- Chart.js for data visualization
- Material-UI for components
- PWA with service workers
- Responsive design

### Device Integration
- Raspberry Pi with Azure IoT SDK
- MQTT over WebSockets
- Device provisioning service

## Project Structure

```
SmartLiving/
├── src/
│   ├── azure-functions/          # Azure Functions backend
│   ├── dashboard/                # React frontend application
│   ├── device-simulator/         # Raspberry Pi device code
│   ├── database/                 # SQL scripts and migrations
│   └── infrastructure/           # Azure ARM templates
├── docs/                         # Documentation
├── scripts/                      # Deployment and utility scripts
└── tests/                        # Test suites
```

## Quick Start

1. **Prerequisites**
   - Azure subscription
   - Node.js 18+
   - .NET 6.0 SDK
   - Azure CLI

2. **Setup**
   ```bash
   # Clone and install dependencies
   npm install
   
   # Configure Azure services
   az login
   npm run azure:setup
   
   # Deploy infrastructure
   npm run deploy:infrastructure
   
   # Start development
   npm run dev
   ```

3. **Environment Configuration**
   - Copy `.env.example` to `.env`
   - Configure Azure connection strings
   - Set up authentication providers

## Development

- `npm run dev` - Start development servers
- `npm run build` - Build for production
- `npm run test` - Run test suite
- `npm run deploy` - Deploy to Azure

## Documentation

- [Architecture Guide](docs/architecture.md)
- [API Documentation](docs/api.md)
- [Device Integration](docs/devices.md)
- [Security Guide](docs/security.md)
- [Deployment Guide](docs/deployment.md)

## License

MIT License - see [LICENSE](LICENSE) file for details.