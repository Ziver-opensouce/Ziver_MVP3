# Use a Dev Container base image with Node.js 18 pre-installed.
# You can change '18' to '20' if you prefer a newer Node.js version.
FROM mcr.microsoft.com/devcontainers/javascript-node:18

# Install git (usually already there but good to ensure)
RUN apt-get update && \
    apt-get install -y git && \
    rm -rf /var/lib/apt/lists/*

# Install Python and pip if you need them for your FastAPI backend in the same Codespace.
# If your FastAPI backend is already working, you might already have these, but including for completeness.
RUN apt-get update && \
    apt-get install -y python3-pip && \
    rm -rf /var/lib/apt/lists/*
RUN update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1
