# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS build

# Install build dependencies
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
 && rm -rf /var/lib/apt/lists/*

# Install GenieACS
WORKDIR /opt
ARG GENIEACS_VERSION=v1.2.13
RUN git clone --depth 1 --single-branch \
      --branch "${GENIEACS_VERSION}" \
      https://github.com/genieacs/genieacs.git

WORKDIR /opt/genieacs
RUN npm ci --unsafe-perm \
 && npm run build

# Final image
FROM node:20-bookworm-slim

# Install runtime dependencies
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    supervisor \
    ca-certificates \
    iputils-ping \
    logrotate \
    mongodb-tools \
 && rm -rf /var/lib/apt/lists/*

# Copy from build stage
COPY --from=build /opt/genieacs /opt/genieacs

# Create genieacs user
RUN useradd --system --no-create-home --home /opt/genieacs genieacs \
 && mkdir -p /opt/genieacs/ext /var/log/genieacs \
 && chown -R genieacs:genieacs /opt/genieacs /var/log/genieacs

# Copy configuration and entrypoint
COPY config/ /opt/genieacs/config/
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set working directory and user
WORKDIR /opt/genieacs
USER genieacs

# Expose ports
# 7547 - CWMP (TR-069)
# 7557 - FS (File Storage)
# 7567 - NBI (Northbound Interface)
# 3000 - UI
EXPOSE 7547 7557 7567 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
