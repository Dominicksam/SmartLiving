import { app, InvocationContext } from '@azure/functions';
import { ServiceClient } from '@azure/iot-hub';
import * as sql from 'mssql';
import { SignalRService } from '@azure/signalr';

// IoT Hub and SignalR service clients
let iotHubClient: ServiceClient | null = null;
let signalRService: SignalRService | null = null;
let pool: sql.ConnectionPool | null = null;

async function getIotHubClient(): Promise<ServiceClient> {
    if (!iotHubClient) {
        iotHubClient = ServiceClient.fromConnectionString(process.env.IOT_HUB_CONNECTION_STRING!);
    }
    return iotHubClient;
}

async function getSignalRService(): Promise<SignalRService> {
    if (!signalRService) {
        signalRService = new SignalRService(process.env.SIGNALR_CONNECTION_STRING!);
    }
    return signalRService;
}

async function getDbPool(): Promise<sql.ConnectionPool> {
    if (!pool) {
        const config: sql.config = {
            connectionString: process.env.SQL_CONNECTION_STRING!,
            options: {
                encrypt: true,
                trustServerCertificate: false
            }
        };
        pool = new sql.ConnectionPool(config);
        await pool.connect();
    }
    return pool;
}

export async function processTelemetry(message: any, context: InvocationContext): Promise<void> {
    context.log('Processing IoT telemetry message:', message);

    try {
        const telemetryData = {
            deviceId: message.systemProperties['iothub-connection-device-id'],
            timestamp: new Date(message.enqueuedTime || Date.now()),
            messageType: message.body.messageType || 'unknown',
            value: message.body.value,
            unit: message.body.unit,
            additionalData: message.body.additionalData
        };

        // Store in database
        const pool = await getDbPool();
        await pool.request()
            .input('DeviceId', sql.NVarChar(255), telemetryData.deviceId)
            .input('Timestamp', sql.DateTime2, telemetryData.timestamp)
            .input('MessageType', sql.NVarChar(100), telemetryData.messageType)
            .input('Value', sql.Float, telemetryData.value)
            .input('Unit', sql.NVarChar(50), telemetryData.unit)
            .input('AdditionalData', sql.NVarChar(sql.MAX), 
                telemetryData.additionalData ? JSON.stringify(telemetryData.additionalData) : null)
            .execute('dbo.InsertTelemetry');

        // Broadcast to real-time dashboard via SignalR
        const signalR = await getSignalRService();
        await signalR.sendToAll('telemetryUpdate', {
            deviceId: telemetryData.deviceId,
            messageType: telemetryData.messageType,
            value: telemetryData.value,
            unit: telemetryData.unit,
            timestamp: telemetryData.timestamp,
            additionalData: telemetryData.additionalData
        });

        // Check automation rules
        await checkAutomationRules(telemetryData, context);

        context.log(`Processed telemetry for device ${telemetryData.deviceId}`);
    } catch (error) {
        context.log.error('Error processing telemetry:', error);
    }
}

async function checkAutomationRules(telemetryData: any, context: InvocationContext): Promise<void> {
    try {
        const pool = await getDbPool();
        
        // Get active automation rules
        const rulesResult = await pool.request()
            .query(`
                SELECT RuleId, UserId, RuleName, TriggerConditions, Actions, Schedule
                FROM dbo.AutomationRules
                WHERE IsActive = 1
            `);

        for (const rule of rulesResult.recordset) {
            try {
                const triggerConditions = JSON.parse(rule.TriggerConditions);
                const actions = JSON.parse(rule.Actions);

                // Check if telemetry data matches any trigger conditions
                for (const trigger of triggerConditions.triggers || []) {
                    if (await evaluateTrigger(trigger, telemetryData)) {
                        context.log(`Automation rule triggered: ${rule.RuleName}`);
                        
                        // Execute actions
                        for (const action of actions.actions || []) {
                            await executeAction(action, context);
                        }

                        // Update execution count and timestamp
                        await pool.request()
                            .input('RuleId', sql.UniqueIdentifier, rule.RuleId)
                            .query(`
                                UPDATE dbo.AutomationRules 
                                SET LastExecuted = GETUTCDATE(), ExecutionCount = ExecutionCount + 1
                                WHERE RuleId = @RuleId
                            `);
                        break;
                    }
                }
            } catch (ruleError) {
                context.log.error(`Error processing rule ${rule.RuleName}:`, ruleError);
            }
        }
    } catch (error) {
        context.log.error('Error checking automation rules:', error);
    }
}

async function evaluateTrigger(trigger: any, telemetryData: any): Promise<boolean> {
    switch (trigger.type) {
        case 'sensor_threshold':
            if (trigger.device === telemetryData.deviceId && 
                trigger.messageType === telemetryData.messageType) {
                const value = parseFloat(telemetryData.value);
                const threshold = parseFloat(trigger.threshold);
                
                switch (trigger.operator) {
                    case '>': return value > threshold;
                    case '<': return value < threshold;
                    case '>=': return value >= threshold;
                    case '<=': return value <= threshold;
                    case '==': return value === threshold;
                    default: return false;
                }
            }
            break;
        case 'device_status':
            return trigger.device === telemetryData.deviceId && 
                   trigger.status === telemetryData.messageType;
        default:
            return false;
    }
    return false;
}

async function executeAction(action: any, context: InvocationContext): Promise<void> {
    switch (action.type) {
        case 'device_command':
            const iotHub = await getIotHubClient();
            const commandMessage = {
                command: action.command,
                parameters: action.parameters || {}
            };
            
            await iotHub.send(action.device, JSON.stringify(commandMessage));
            context.log(`Sent command ${action.command} to device ${action.device}`);
            break;
        case 'notification':
            // TODO: Implement notification system
            context.log(`Notification: ${action.message}`);
            break;
        default:
            context.log(`Unknown action type: ${action.type}`);
    }
}

// Register IoT Hub trigger
app.eventHub('processTelemetry', {
    connection: 'IOT_HUB_CONNECTION_STRING',
    eventHubName: 'messages/events',
    handler: processTelemetry,
});