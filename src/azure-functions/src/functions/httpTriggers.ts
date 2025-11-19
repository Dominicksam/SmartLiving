import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as sql from 'mssql';

// Database connection pool
let pool: sql.ConnectionPool | null = null;

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

export async function getDevices(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`HTTP trigger function processed request for url "${request.url}"`);

    try {
        const userId = request.query.get('userId');
        if (!userId) {
            return {
                status: 400,
                jsonBody: { error: 'userId parameter is required' }
            };
        }

        const pool = await getDbPool();
        const result = await pool.request()
            .input('UserId', sql.UniqueIdentifier, userId)
            .query(`
                SELECT 
                    d.DeviceId,
                    d.DeviceName,
                    d.DeviceType,
                    d.Location,
                    d.IsOnline,
                    d.LastSeen,
                    d.Properties,
                    d.CreatedAt,
                    d.UpdatedAt
                FROM dbo.Devices d
                WHERE d.UserId = @UserId
                ORDER BY d.DeviceName
            `);

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            jsonBody: {
                devices: result.recordset.map(device => ({
                    ...device,
                    Properties: device.Properties ? JSON.parse(device.Properties) : null
                }))
            }
        };
    } catch (error) {
        context.log.error('Error fetching devices:', error);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' }
        };
    }
}

export async function getDeviceTelemetry(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`HTTP trigger function processed request for url "${request.url}"`);

    try {
        const deviceId = request.query.get('deviceId');
        const messageType = request.query.get('messageType');
        const hours = parseInt(request.query.get('hours') || '24');

        if (!deviceId) {
            return {
                status: 400,
                jsonBody: { error: 'deviceId parameter is required' }
            };
        }

        const pool = await getDbPool();
        let query = `
            SELECT 
                TelemetryId,
                DeviceId,
                Timestamp,
                MessageType,
                Value,
                Unit,
                AdditionalData
            FROM dbo.DeviceTelemetry
            WHERE DeviceId = @DeviceId
            AND Timestamp >= DATEADD(hour, -@Hours, GETUTCDATE())
        `;

        const queryRequest = pool.request()
            .input('DeviceId', sql.NVarChar(255), deviceId)
            .input('Hours', sql.Int, hours);

        if (messageType) {
            query += ' AND MessageType = @MessageType';
            queryRequest.input('MessageType', sql.NVarChar(100), messageType);
        }

        query += ' ORDER BY Timestamp DESC';

        const result = await queryRequest.query(query);

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            jsonBody: {
                telemetry: result.recordset.map(row => ({
                    ...row,
                    AdditionalData: row.AdditionalData ? JSON.parse(row.AdditionalData) : null
                }))
            }
        };
    } catch (error) {
        context.log.error('Error fetching telemetry:', error);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' }
        };
    }
}

export async function sendDeviceCommand(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`HTTP trigger function processed request for url "${request.url}"`);

    try {
        const body = await request.json() as {
            deviceId: string;
            userId: string;
            commandType: string;
            commandPayload?: any;
        };

        if (!body.deviceId || !body.userId || !body.commandType) {
            return {
                status: 400,
                jsonBody: { error: 'deviceId, userId, and commandType are required' }
            };
        }

        const pool = await getDbPool();
        
        // Insert command record
        const result = await pool.request()
            .input('DeviceId', sql.NVarChar(255), body.deviceId)
            .input('UserId', sql.UniqueIdentifier, body.userId)
            .input('CommandType', sql.NVarChar(100), body.commandType)
            .input('CommandPayload', sql.NVarChar(sql.MAX), body.commandPayload ? JSON.stringify(body.commandPayload) : null)
            .query(`
                INSERT INTO dbo.DeviceCommands (DeviceId, UserId, CommandType, CommandPayload, Status)
                OUTPUT INSERTED.CommandId
                VALUES (@DeviceId, @UserId, @CommandType, @CommandPayload, 'pending')
            `);

        const commandId = result.recordset[0].CommandId;

        // TODO: Send command to IoT Hub (implement in next step)
        
        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            jsonBody: {
                success: true,
                commandId: commandId,
                message: 'Command queued successfully'
            }
        };
    } catch (error) {
        context.log.error('Error sending device command:', error);
        return {
            status: 500,
            jsonBody: { error: 'Internal server error' }
        };
    }
}

// Register HTTP triggers
app.http('getDevices', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'devices',
    handler: getDevices,
});

app.http('getDeviceTelemetry', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'telemetry',
    handler: getDeviceTelemetry,
});

app.http('sendDeviceCommand', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'commands',
    handler: sendDeviceCommand,
});