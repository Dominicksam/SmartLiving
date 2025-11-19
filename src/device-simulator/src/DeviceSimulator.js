const Device = require('azure-iot-device').Device;
const Message = require('azure-iot-device').Message;
const Mqtt = require('azure-iot-device-mqtt').Mqtt;
const { v4: uuidv4 } = require('uuid');

class IoTDeviceSimulator {
  constructor(connectionString, deviceConfig) {
    this.connectionString = connectionString;
    this.deviceConfig = deviceConfig;
    this.client = null;
    this.isRunning = false;
    this.telemetryInterval = null;
    this.commandHandlers = new Map();
    
    this.setupCommandHandlers();
  }

  setupCommandHandlers() {
    // Temperature sensor commands
    this.commandHandlers.set('set_temperature_threshold', (request) => {
      console.log(`Setting temperature threshold to ${request.payload.threshold}°C`);
      this.deviceConfig.temperatureThreshold = request.payload.threshold;
      return { success: true, message: 'Temperature threshold updated' };
    });

    // Light control commands
    this.commandHandlers.set('turn_on', (request) => {
      console.log(`Turning on ${this.deviceConfig.deviceId}`);
      this.deviceConfig.isOn = true;
      this.deviceConfig.brightness = request.payload.brightness || 100;
      return { success: true, message: 'Device turned on', brightness: this.deviceConfig.brightness };
    });

    this.commandHandlers.set('turn_off', (request) => {
      console.log(`Turning off ${this.deviceConfig.deviceId}`);
      this.deviceConfig.isOn = false;
      this.deviceConfig.brightness = 0;
      return { success: true, message: 'Device turned off' };
    });

    this.commandHandlers.set('set_brightness', (request) => {
      if (this.deviceConfig.isOn) {
        this.deviceConfig.brightness = Math.max(0, Math.min(100, request.payload.brightness));
        console.log(`Setting brightness to ${this.deviceConfig.brightness}%`);
        return { success: true, message: 'Brightness updated', brightness: this.deviceConfig.brightness };
      }
      return { success: false, message: 'Device is off' };
    });

    // Generic status command
    this.commandHandlers.set('get_status', (request) => {
      return {
        success: true,
        deviceId: this.deviceConfig.deviceId,
        deviceType: this.deviceConfig.deviceType,
        isOn: this.deviceConfig.isOn,
        ...this.deviceConfig
      };
    });
  }

  async connect() {
    try {
      this.client = Device.fromConnectionString(this.connectionString, Mqtt);
      
      // Set up command handling
      this.client.on('message', this.handleCommand.bind(this));
      
      // Set up error handling
      this.client.on('error', (err) => {
        console.error('Device client error:', err);
      });

      await this.client.open();
      console.log(`Device ${this.deviceConfig.deviceId} connected successfully`);
      
      // Send initial device info
      await this.sendDeviceInfo();
      
      return true;
    } catch (error) {
      console.error(`Failed to connect device ${this.deviceConfig.deviceId}:`, error);
      return false;
    }
  }

  async disconnect() {
    this.isRunning = false;
    
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }

    if (this.client) {
      try {
        await this.client.close();
        console.log(`Device ${this.deviceConfig.deviceId} disconnected`);
      } catch (error) {
        console.error('Error disconnecting device:', error);
      }
    }
  }

  async sendDeviceInfo() {
    const deviceInfo = {
      messageType: 'device_info',
      deviceId: this.deviceConfig.deviceId,
      deviceName: this.deviceConfig.deviceName,
      deviceType: this.deviceConfig.deviceType,
      location: this.deviceConfig.location,
      capabilities: this.deviceConfig.capabilities || [],
      timestamp: new Date().toISOString()
    };

    await this.sendTelemetry(deviceInfo);
  }

  startTelemetry(intervalMs = 30000) {
    if (this.isRunning) {
      console.log('Telemetry already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting telemetry for ${this.deviceConfig.deviceId} every ${intervalMs}ms`);

    this.telemetryInterval = setInterval(async () => {
      try {
        const telemetryData = this.generateTelemetryData();
        await this.sendTelemetry(telemetryData);
      } catch (error) {
        console.error('Error sending telemetry:', error);
      }
    }, intervalMs);
  }

  stopTelemetry() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
      this.isRunning = false;
      console.log(`Stopped telemetry for ${this.deviceConfig.deviceId}`);
    }
  }

  generateTelemetryData() {
    const timestamp = new Date().toISOString();
    const baseData = {
      deviceId: this.deviceConfig.deviceId,
      timestamp: timestamp
    };

    switch (this.deviceConfig.deviceType) {
      case 'temperature_sensor':
        return {
          ...baseData,
          messageType: 'temperature',
          value: this.generateTemperature(),
          unit: '°C'
        };

      case 'humidity_sensor':
        return {
          ...baseData,
          messageType: 'humidity',
          value: this.generateHumidity(),
          unit: '%'
        };

      case 'smart_light':
        return {
          ...baseData,
          messageType: 'light_status',
          value: this.deviceConfig.isOn ? this.deviceConfig.brightness : 0,
          unit: '%',
          additionalData: {
            isOn: this.deviceConfig.isOn,
            powerConsumption: this.deviceConfig.isOn ? (this.deviceConfig.brightness / 100 * 10) : 0
          }
        };

      case 'motion_sensor':
        return {
          ...baseData,
          messageType: 'motion',
          value: this.generateMotion(),
          unit: 'boolean'
        };

      case 'energy_meter':
        return {
          ...baseData,
          messageType: 'energy',
          value: this.generateEnergyConsumption(),
          unit: 'kWh'
        };

      default:
        return {
          ...baseData,
          messageType: 'unknown',
          value: Math.random() * 100,
          unit: 'units'
        };
    }
  }

  generateTemperature() {
    // Generate realistic temperature data with some variation
    const baseTemp = this.deviceConfig.baseTemperature || 22;
    const variation = (Math.random() - 0.5) * 4; // ±2°C variation
    return Math.round((baseTemp + variation) * 10) / 10;
  }

  generateHumidity() {
    // Generate realistic humidity data
    const baseHumidity = this.deviceConfig.baseHumidity || 45;
    const variation = (Math.random() - 0.5) * 20; // ±10% variation
    return Math.max(0, Math.min(100, Math.round(baseHumidity + variation)));
  }

  generateMotion() {
    // Generate random motion events (10% chance of motion)
    return Math.random() < 0.1 ? 1 : 0;
  }

  generateEnergyConsumption() {
    // Generate realistic energy consumption
    const baseConsumption = this.deviceConfig.baseConsumption || 2.5;
    const variation = Math.random() * 0.5; // Small variation
    return Math.round((baseConsumption + variation) * 100) / 100;
  }

  async sendTelemetry(data) {
    if (!this.client) {
      throw new Error('Device not connected');
    }

    const message = new Message(JSON.stringify(data));
    message.contentType = 'application/json';
    message.contentEncoding = 'utf-8';
    
    try {
      await this.client.sendEvent(message);
      console.log(`Sent telemetry from ${this.deviceConfig.deviceId}:`, data);
    } catch (error) {
      console.error('Failed to send telemetry:', error);
      throw error;
    }
  }

  async handleCommand(message) {
    try {
      const command = JSON.parse(message.data.toString());
      console.log(`Received command for ${this.deviceConfig.deviceId}:`, command);

      const handler = this.commandHandlers.get(command.command);
      let response;

      if (handler) {
        response = handler(command);
      } else {
        response = { 
          success: false, 
          message: `Unknown command: ${command.command}` 
        };
      }

      // Send command response
      await this.sendTelemetry({
        messageType: 'command_response',
        commandId: command.commandId || uuidv4(),
        response: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error handling command:', error);
    }
  }
}

module.exports = IoTDeviceSimulator;