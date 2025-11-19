-- SmartLiving IoT Database Schema
-- Microsoft SQL Server

-- Drop tables if they exist (for development/testing)
IF OBJECT_ID('dbo.DeviceTelemetry', 'U') IS NOT NULL DROP TABLE dbo.DeviceTelemetry;
IF OBJECT_ID('dbo.AutomationRules', 'U') IS NOT NULL DROP TABLE dbo.AutomationRules;
IF OBJECT_ID('dbo.DeviceCommands', 'U') IS NOT NULL DROP TABLE dbo.DeviceCommands;
IF OBJECT_ID('dbo.Devices', 'U') IS NOT NULL DROP TABLE dbo.Devices;
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
GO

-- Users table
CREATE TABLE dbo.Users (
    UserId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AzureAdObjectId NVARCHAR(255) NOT NULL UNIQUE,
    Email NVARCHAR(255) NOT NULL,
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- Devices table
CREATE TABLE dbo.Devices (
    DeviceId NVARCHAR(255) PRIMARY KEY,
    DeviceName NVARCHAR(255) NOT NULL,
    DeviceType NVARCHAR(100) NOT NULL, -- 'sensor', 'actuator', 'controller'
    Location NVARCHAR(255),
    UserId UNIQUEIDENTIFIER NOT NULL,
    IsOnline BIT DEFAULT 0,
    LastSeen DATETIME2,
    ConnectionString NVARCHAR(MAX),
    Properties NVARCHAR(MAX), -- JSON string for device-specific properties
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

-- Device Commands table
CREATE TABLE dbo.DeviceCommands (
    CommandId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    DeviceId NVARCHAR(255) NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    CommandType NVARCHAR(100) NOT NULL, -- 'turn_on', 'turn_off', 'set_temperature', etc.
    CommandPayload NVARCHAR(MAX), -- JSON string
    Status NVARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'completed', 'failed'
    SentAt DATETIME2,
    CompletedAt DATETIME2,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (DeviceId) REFERENCES dbo.Devices(DeviceId) ON DELETE CASCADE,
    FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

-- Device Telemetry table (time-series data)
CREATE TABLE dbo.DeviceTelemetry (
    TelemetryId BIGINT IDENTITY(1,1) PRIMARY KEY,
    DeviceId NVARCHAR(255) NOT NULL,
    Timestamp DATETIME2 NOT NULL,
    MessageType NVARCHAR(100) NOT NULL, -- 'temperature', 'humidity', 'motion', 'energy', etc.
    Value FLOAT,
    Unit NVARCHAR(50),
    AdditionalData NVARCHAR(MAX), -- JSON string for complex telemetry
    ProcessedAt DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (DeviceId) REFERENCES dbo.Devices(DeviceId) ON DELETE CASCADE
);
GO

-- Automation Rules table
CREATE TABLE dbo.AutomationRules (
    RuleId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserId UNIQUEIDENTIFIER NOT NULL,
    RuleName NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    IsActive BIT DEFAULT 1,
    TriggerConditions NVARCHAR(MAX) NOT NULL, -- JSON string defining triggers
    Actions NVARCHAR(MAX) NOT NULL, -- JSON string defining actions
    Schedule NVARCHAR(MAX), -- JSON string for scheduling (cron-like)
    LastExecuted DATETIME2,
    ExecutionCount INT DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId) ON DELETE CASCADE
);
GO

-- Indexes for performance optimization
CREATE INDEX IX_DeviceTelemetry_DeviceId_Timestamp ON dbo.DeviceTelemetry(DeviceId, Timestamp);
CREATE INDEX IX_DeviceTelemetry_MessageType_Timestamp ON dbo.DeviceTelemetry(MessageType, Timestamp);
CREATE INDEX IX_DeviceCommands_DeviceId_Status ON dbo.DeviceCommands(DeviceId, Status);
CREATE INDEX IX_DeviceCommands_UserId_CreatedAt ON dbo.DeviceCommands(UserId, CreatedAt);
CREATE INDEX IX_Devices_UserId_IsOnline ON dbo.Devices(UserId, IsOnline);
CREATE INDEX IX_AutomationRules_UserId_IsActive ON dbo.AutomationRules(UserId, IsActive);
GO

-- Create a view for latest device telemetry
CREATE VIEW dbo.LatestDeviceTelemetry AS
WITH LatestTelemetry AS (
    SELECT 
        DeviceId,
        MessageType,
        Value,
        Unit,
        AdditionalData,
        Timestamp,
        ROW_NUMBER() OVER (PARTITION BY DeviceId, MessageType ORDER BY Timestamp DESC) as rn
    FROM dbo.DeviceTelemetry
)
SELECT 
    DeviceId,
    MessageType,
    Value,
    Unit,
    AdditionalData,
    Timestamp
FROM LatestTelemetry 
WHERE rn = 1;
GO

-- Create a stored procedure for device registration
CREATE PROCEDURE dbo.RegisterDevice
    @DeviceId NVARCHAR(255),
    @DeviceName NVARCHAR(255),
    @DeviceType NVARCHAR(100),
    @Location NVARCHAR(255),
    @UserEmail NVARCHAR(255),
    @Properties NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @UserId UNIQUEIDENTIFIER;
    
    -- Get user ID
    SELECT @UserId = UserId FROM dbo.Users WHERE Email = @UserEmail;
    
    IF @UserId IS NULL
    BEGIN
        RAISERROR('User not found with email: %s', 16, 1, @UserEmail);
        RETURN;
    END
    
    -- Insert or update device
    MERGE dbo.Devices AS target
    USING (SELECT @DeviceId as DeviceId) AS source
    ON target.DeviceId = source.DeviceId
    WHEN MATCHED THEN
        UPDATE SET 
            DeviceName = @DeviceName,
            DeviceType = @DeviceType,
            Location = @Location,
            UserId = @UserId,
            Properties = @Properties,
            UpdatedAt = GETUTCDATE()
    WHEN NOT MATCHED THEN
        INSERT (DeviceId, DeviceName, DeviceType, Location, UserId, Properties)
        VALUES (@DeviceId, @DeviceName, @DeviceType, @Location, @UserId, @Properties);
        
    SELECT 'Device registered successfully' as Message;
END
GO

-- Create a stored procedure for inserting telemetry data
CREATE PROCEDURE dbo.InsertTelemetry
    @DeviceId NVARCHAR(255),
    @MessageType NVARCHAR(100),
    @Value FLOAT = NULL,
    @Unit NVARCHAR(50) = NULL,
    @AdditionalData NVARCHAR(MAX) = NULL,
    @Timestamp DATETIME2 = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    IF @Timestamp IS NULL
        SET @Timestamp = GETUTCDATE();
    
    -- Verify device exists
    IF NOT EXISTS (SELECT 1 FROM dbo.Devices WHERE DeviceId = @DeviceId)
    BEGIN
        RAISERROR('Device not found: %s', 16, 1, @DeviceId);
        RETURN;
    END
    
    -- Insert telemetry
    INSERT INTO dbo.DeviceTelemetry (DeviceId, Timestamp, MessageType, Value, Unit, AdditionalData)
    VALUES (@DeviceId, @Timestamp, @MessageType, @Value, @Unit, @AdditionalData);
    
    -- Update device last seen
    UPDATE dbo.Devices 
    SET LastSeen = @Timestamp, IsOnline = 1, UpdatedAt = GETUTCDATE()
    WHERE DeviceId = @DeviceId;
END
GO

-- Sample data for development
INSERT INTO dbo.Users (AzureAdObjectId, Email, FirstName, LastName) VALUES
('sample-azure-ad-object-id-1', 'user@example.com', 'Smart', 'User');

DECLARE @UserId UNIQUEIDENTIFIER = (SELECT UserId FROM dbo.Users WHERE Email = 'user@example.com');

-- Sample devices
INSERT INTO dbo.Devices (DeviceId, DeviceName, DeviceType, Location, UserId) VALUES
('living-room-temp', 'Living Room Temperature Sensor', 'sensor', 'Living Room', @UserId),
('kitchen-humidity', 'Kitchen Humidity Sensor', 'sensor', 'Kitchen', @UserId),
('bedroom-light', 'Bedroom Smart Light', 'actuator', 'Bedroom', @UserId),
('garage-door', 'Garage Door Controller', 'controller', 'Garage', @UserId);

-- Sample automation rule
INSERT INTO dbo.AutomationRules (UserId, RuleName, Description, TriggerConditions, Actions) VALUES
(@UserId, 'Evening Light Automation', 'Turn on bedroom light at sunset', 
'{"triggers":[{"type":"time","condition":"sunset"}],"conditions":[{"type":"device_status","device":"bedroom-light","status":"off"}]}',
'{"actions":[{"type":"device_command","device":"bedroom-light","command":"turn_on","brightness":70}]}');

PRINT 'Database schema created successfully with sample data!';
GO