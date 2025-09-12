#!/bin/bash

# Blue Carbon MRV Production Deployment Script
# This script sets up a production deployment of the Blue Carbon MRV system

set -e

echo "Blue Carbon MRV Production Deployment"
echo "======================================"

# Configuration
NODE_ENV=${NODE_ENV:-production}
DATA_DIR=${DATA_DIR:-/var/lib/bc-mrv}
LOG_DIR=${LOG_DIR:-/var/log/bc-mrv}
SERVICE_USER=${SERVICE_USER:-bc-mrv}
SYSTEMD_SERVICE_FILE="/etc/systemd/system/bc-mrv.service"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root for production deployment"
   exit 1
fi

echo "Setting up production environment..."

# Create service user
if ! id "$SERVICE_USER" &>/dev/null; then
    echo "Creating service user: $SERVICE_USER"
    useradd -r -s /bin/false -d "$DATA_DIR" "$SERVICE_USER"
fi

# Create directories
echo "Creating directories..."
mkdir -p "$DATA_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$DATA_DIR/backups"

# Set ownership
chown -R "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"

# Install Node.js dependencies
echo "Installing dependencies..."
npm ci --only=production

# Create systemd service file
echo "Creating systemd service..."
cat > "$SYSTEMD_SERVICE_FILE" << EOF
[Unit]
Description=Blue Carbon MRV Blockchain Node
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node src/api/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bc-mrv

# Environment variables
Environment=NODE_ENV=$NODE_ENV
Environment=DATA_DIR=$DATA_DIR
Environment=PORT=3000
Environment=P2P_PORT=8080

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$DATA_DIR $LOG_DIR

# Resource limits
LimitNOFILE=65536
LimitNPROC=32768

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
echo "Enabling systemd service..."
systemctl daemon-reload
systemctl enable bc-mrv

# Create log rotation configuration
echo "Setting up log rotation..."
cat > /etc/logrotate.d/bc-mrv << EOF
$LOG_DIR/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0644 $SERVICE_USER $SERVICE_USER
    postrotate
        systemctl reload bc-mrv > /dev/null 2>&1 || true
    endscript
}
EOF

# Create backup script
echo "Creating backup script..."
cat > /usr/local/bin/bc-mrv-backup << 'EOF'
#!/bin/bash

# Blue Carbon MRV Backup Script
DATA_DIR=${DATA_DIR:-/var/lib/bc-mrv}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/bc-mrv}
RETENTION_DAYS=${RETENTION_DAYS:-30}

mkdir -p "$BACKUP_DIR"

# Create timestamped backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/bc-mrv-backup-$TIMESTAMP.tar.gz"

# Create compressed backup
tar -czf "$BACKUP_FILE" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"

echo "Backup created: $BACKUP_FILE"

# Clean old backups
find "$BACKUP_DIR" -name "bc-mrv-backup-*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Log backup completion
logger "BC-MRV: Backup completed - $BACKUP_FILE"
EOF

chmod +x /usr/local/bin/bc-mrv-backup

# Create daily backup cron job
echo "Setting up daily backups..."
cat > /etc/cron.d/bc-mrv-backup << EOF
# Blue Carbon MRV daily backup
0 2 * * * root /usr/local/bin/bc-mrv-backup
EOF

# Create monitoring script
echo "Creating monitoring script..."
cat > /usr/local/bin/bc-mrv-monitor << 'EOF'
#!/bin/bash

# Blue Carbon MRV Health Monitoring Script
API_URL=${API_URL:-http://localhost:3000}
ALERT_EMAIL=${ALERT_EMAIL:-admin@example.com}

# Check if service is running
if ! systemctl is-active --quiet bc-mrv; then
    echo "BC-MRV service is not running!"
    systemctl start bc-mrv
    logger "BC-MRV: Service restarted by monitor"
fi

# Check API health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL" || echo "000")

if [[ "$HTTP_CODE" != "200" ]]; then
    echo "BC-MRV API health check failed (HTTP: $HTTP_CODE)"
    systemctl restart bc-mrv
    logger "BC-MRV: Service restarted due to API failure (HTTP: $HTTP_CODE)"
fi

# Check disk space
DISK_USAGE=$(df /var/lib/bc-mrv | tail -1 | awk '{print $5}' | sed 's/%//')
if [[ $DISK_USAGE -gt 80 ]]; then
    echo "BC-MRV: Disk usage high ($DISK_USAGE%)"
    logger "BC-MRV: High disk usage warning ($DISK_USAGE%)"
fi
EOF

chmod +x /usr/local/bin/bc-mrv-monitor

# Create monitoring cron job (every 5 minutes)
cat > /etc/cron.d/bc-mrv-monitor << EOF
# Blue Carbon MRV health monitoring
*/5 * * * * root /usr/local/bin/bc-mrv-monitor
EOF

# UFW firewall rules (if UFW is available)
if command -v ufw &> /dev/null; then
    echo "Configuring firewall rules..."
    ufw allow 3000/tcp comment "BC-MRV API"
    ufw allow 8080/tcp comment "BC-MRV P2P"
fi

# Start the service
echo "Starting BC-MRV service..."
systemctl start bc-mrv

# Check service status
echo "Checking service status..."
systemctl status bc-mrv --no-pager

echo ""
echo "Production deployment completed successfully!"
echo ""
echo "Service Status:"
echo "  - Service: bc-mrv (enabled and started)"
echo "  - API: http://localhost:3000"
echo "  - P2P: ws://localhost:8080"
echo "  - Data Directory: $DATA_DIR"
echo "  - Log Directory: $LOG_DIR"
echo ""
echo "Management Commands:"
echo "  - Start:   systemctl start bc-mrv"
echo "  - Stop:    systemctl stop bc-mrv"
echo "  - Status:  systemctl status bc-mrv"
echo "  - Logs:    journalctl -u bc-mrv -f"
echo "  - Backup:  /usr/local/bin/bc-mrv-backup"
echo "  - Monitor: /usr/local/bin/bc-mrv-monitor"
echo ""
echo "Dashboard: http://your-server-ip:3000/dashboard"
echo "API Docs:  http://your-server-ip:3000/docs"