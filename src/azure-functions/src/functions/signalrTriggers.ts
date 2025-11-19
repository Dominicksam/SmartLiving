import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SignalRService } from '@azure/signalr';

let signalRService: SignalRService | null = null;

async function getSignalRService(): Promise<SignalRService> {
    if (!signalRService) {
        signalRService = new SignalRService(process.env.SIGNALR_CONNECTION_STRING!);
    }
    return signalRService;
}

export async function negotiate(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('SignalR negotiate function triggered');

    try {
        const signalR = await getSignalRService();
        const userId = request.query.get('userId') || 'anonymous';
        
        const connectionInfo = await signalR.getClientAccessToken({
            userId: userId
        });

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
            },
            jsonBody: connectionInfo
        };
    } catch (error) {
        context.log.error('Error in SignalR negotiate:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to negotiate SignalR connection' }
        };
    }
}

export async function broadcastToGroup(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('SignalR broadcast function triggered');

    try {
        const body = await request.json() as {
            groupName: string;
            target: string;
            message: any;
        };

        if (!body.groupName || !body.target || !body.message) {
            return {
                status: 400,
                jsonBody: { error: 'groupName, target, and message are required' }
            };
        }

        const signalR = await getSignalRService();
        await signalR.sendToGroup(body.groupName, body.target, body.message);

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            jsonBody: { success: true, message: 'Message broadcast successfully' }
        };
    } catch (error) {
        context.log.error('Error broadcasting to group:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to broadcast message' }
        };
    }
}

export async function sendToUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('SignalR send to user function triggered');

    try {
        const body = await request.json() as {
            userId: string;
            target: string;
            message: any;
        };

        if (!body.userId || !body.target || !body.message) {
            return {
                status: 400,
                jsonBody: { error: 'userId, target, and message are required' }
            };
        }

        const signalR = await getSignalRService();
        await signalR.sendToUser(body.userId, body.target, body.message);

        return {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            jsonBody: { success: true, message: 'Message sent successfully' }
        };
    } catch (error) {
        context.log.error('Error sending to user:', error);
        return {
            status: 500,
            jsonBody: { error: 'Failed to send message' }
        };
    }
}

// Register SignalR functions
app.http('negotiate', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    route: 'signalr/negotiate',
    handler: negotiate,
});

app.http('broadcastToGroup', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'signalr/broadcast',
    handler: broadcastToGroup,
});

app.http('sendToUser', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'signalr/send',
    handler: sendToUser,
});