require('dotenv').config();
const IoTDeviceSimulator = require('./DeviceSimulator');

// Device configurations
const deviceConfigs = [
  {
    deviceId: 'living-room-temp',
    deviceName: 'Living Room Temperature Sensor',
    deviceType: 'temperature_sensor',
    location: 'Living Room',
    baseTemperature: 22.5,
    temperatureThreshold: 25,
    capabilities: ['temperature_monitoring', 'threshold_alerts']
  },
  {
    deviceId: 'kitchen-humidity',
    deviceName: 'Kitchen Humidity Sensor',
    deviceType: 'humidity_sensor',
    location: 'Kitchen',
    baseHumidity: 50,
    capabilities: ['humidity_monitoring']
  },
  {
    deviceId: 'bedroom-light',
    deviceName: 'Bedroom Smart Light',
    deviceType: 'smart_light',
    location: 'Bedroom',
    isOn: false,
    brightness: 0,
    capabilities: ['on_off_control', 'brightness_control', 'power_monitoring']
  },
  {
    deviceId: 'hallway-motion',
    deviceName: 'Hallway Motion Sensor',
    deviceType: 'motion_sensor',
    location: 'Hallway',
    capabilities: ['motion_detection']
  },
  {
    deviceId: 'main-energy-meter',
    deviceName: 'Main Energy Meter',
    deviceType: 'energy_meter',
    location: 'Utility Room',
    baseConsumption: 2.8,
    capabilities: ['energy_monitoring', 'usage_analytics']
  }
];

class DeviceManager {
  constructor() {
    this.devices = new Map();
    this.isRunning = false;
  }

  async initialize() {
    console.log('Initializing IoT Device Simulator...');
    console.log(`Creating ${deviceConfigs.length} simulated devices...`);

    for (const config of deviceConfigs) {
      try {
        // Generate device connection string (in real scenario, this would be provisioned)
        const connectionString = this.generateDeviceConnectionString(config.deviceId);
        
        const device = new IoTDeviceSimulator(connectionString, config);
        this.devices.set(config.deviceId, device);
        
        console.log(`Created device: ${config.deviceName} (${config.deviceId})`);
      } catch (error) {
        console.error(`Failed to create device ${config.deviceId}:`, error);
      }
    }
  }

  generateDeviceConnectionString(deviceId) {
    const iotHubHostname = process.env.AZURE_IOT_HUB_HOSTNAME || 'smartliving-hub.azure-devices.net';
    const deviceKey = process.env[`DEVICE_KEY_${deviceId.toUpperCase().replace('-', '_')}`] || 'sample-device-key';
    
    return `HostName=${iotHubHostname};DeviceId=${deviceId};SharedAccessKey=${deviceKey}`;
  }

  async connectAllDevices() {
    console.log('Connecting all devices...');
    
    const connectionPromises = Array.from(this.devices.values()).map(async (device) => {
      try {
        await device.connect();
        return { success: true, deviceId: device.deviceConfig.deviceId };
      } catch (error) {
        console.error(`Failed to connect device ${device.deviceConfig.deviceId}:`, error);
        return { success: false, deviceId: device.deviceConfig.deviceId, error };
      }
    });

    const results = await Promise.allSettled(connectionPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    console.log(`Connected ${successful}/${this.devices.size} devices successfully`);
    return successful === this.devices.size;
  }

  async startTelemetry() {
    if (this.isRunning) {
      console.log('Telemetry already running');
      return;
    }

    console.log('Starting telemetry for all devices...');
    this.isRunning = true;

    // Start telemetry with different intervals for different device types
    for (const [deviceId, device] of this.devices) {
      const config = device.deviceConfig;
      let interval;

      switch (config.deviceType) {
        case 'temperature_sensor':
        case 'humidity_sensor':
          interval = 30000; // 30 seconds
          break;
        case 'smart_light':
          interval = 60000; // 1 minute
          break;
        case 'motion_sensor':
          interval = 10000; // 10 seconds
          break;
        case 'energy_meter':
          interval = 120000; // 2 minutes
          break;
        default:
          interval = 30000; // Default 30 seconds
      }

      device.startTelemetry(interval);
    }

    console.log('All devices are now sending telemetry data');
  }

  async stopTelemetry() {
    console.log('Stopping telemetry for all devices...');
    this.isRunning = false;

    for (const device of this.devices.values()) {
      device.stopTelemetry();
    }

    console.log('Telemetry stopped for all devices');
  }

  async disconnectAllDevices() {
    console.log('Disconnecting all devices...');

    const disconnectionPromises = Array.from(this.devices.values()).map(device => 
      device.disconnect()
    );

    await Promise.allSettled(disconnectionPromises);
    console.log('All devices disconnected');
  }

  getDeviceStatus() {
    const status = {};
    for (const [deviceId, device] of this.devices) {
      status[deviceId] = {
        connected: device.client?.connected || false,
        telemetryRunning: device.isRunning,
        config: device.deviceConfig
      };
    }
    return status;
  }

  async shutdown() {
    console.log('\nShutting down device manager...');
    
    await this.stopTelemetry();
    await this.disconnectAllDevices();
    
    console.log('Device manager shutdown complete');
  }
}

// Main execution
async function main() {
  const deviceManager = new DeviceManager();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT signal...');
    await deviceManager.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM signal...');
    await deviceManager.shutdown();
    process.exit(0);
  });

  try {
    // Initialize devices
    await deviceManager.initialize();

    // Connect all devices
    const allConnected = await deviceManager.connectAllDevices();
    
    if (!allConnected) {
      console.warn('Not all devices connected successfully, but continuing...');
    }

    // Start sending telemetry
    await deviceManager.startTelemetry();

    // Print status every 60 seconds
    setInterval(() => {
      console.log('\n--- Device Status ---');
      const status = deviceManager.getDeviceStatus();
      for (const [deviceId, info] of Object.entries(status)) {
        console.log(`${deviceId}: Connected=${info.connected}, Telemetry=${info.telemetryRunning}`);
      }
      console.log('-------------------');
    }, 60000);

    console.log('\nDevice simulator is running. Press Ctrl+C to stop.');

  } catch (error) {
    console.error('Fatal error in device manager:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main();
}

module.exports = DeviceManager;