FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# Install system dependencies
RUN apt-get update && \
    apt-get install -y build-essential git curl python3-pip cargo && \
    rm -rf /var/lib/apt/lists/*

# Clone and build FunC
RUN git clone https://github.com/ton-blockchain/func.git /opt/func && \
    cd /opt/func && \
    cargo build --release

# Add FunC to PATH
ENV PATH="/opt/func/target/release:${PATH}"

# Set pip to default to pip3
RUN update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1
