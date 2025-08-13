#!/bin/bash
set -e

# Set environment variables with defaults
export NODE_ENV=${NODE_ENV:-production}
export GENIEACS_EXT_DIR=${GENIEACS_EXT_DIR:-/opt/genieacs/ext}
export GENIEACS_UI_INITIAL_PASSWORD=${GENIEACS_UI_INITIAL_PASSWORD:-admin}

# Create required directories if they don't exist
mkdir -p "${GENIEACS_EXT_DIR}" /var/log/genieacs
chown -R genieacs:genieacs "${GENIEACS_EXT_DIR}" /var/log/genieacs

# Generate JWT secret if not set
if [ -z "$GENIEACS_UI_JWT_SECRET" ]; then
    export GENIEACS_UI_JWT_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    echo "Generated JWT_SECRET: ${GENIEACS_UI_JWT_SECRET}"
fi

# Check if we need to initialize the database
if [ "$INIT_DB" = "true" ]; then
    echo "Initializing database..."
    node /opt/genieacs/bin/genieacs-cwmp --initialize
    node /opt/genieacs/bin/genieacs-nbi --initialize
    node /opt/genieacs/bin/genieacs-fs --initialize
    node /opt/genieacs/bin/genieacs-ui --initialize
    
    # Create initial admin user if specified
    if [ -n "$GENIEACS_UI_INITIAL_USER" ] && [ -n "$GENIEACS_UI_INITIAL_PASSWORD" ]; then
        echo "Creating initial admin user: ${GENIEACS_UI_INITIAL_USER}"
        node /opt/genieacs/bin/genieacs-ui --create-user "${GENIEACS_UI_INITIAL_USER}" \
            --password "${GENIEACS_UI_INITIAL_PASSWORD}" \
            --full-name "Admin User" \
            --roles admin
    fi
fi

# Start services
echo "Starting GenieACS services..."

exec "$@"
