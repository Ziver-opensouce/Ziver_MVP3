# Use a robust base image for devcontainers
FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# Install system dependencies needed for TON tools (C++ build process)
# build-essential for make/gcc, git for cloning, curl for general use,
# python3-pip for toncli, cmake for TON build system, libssl-dev and zlib1g-dev for TON dependencies.
RUN apt-get update && \
    apt-get install -y build-essential git curl python3-pip cmake libssl-dev zlib1g-dev && \
    rm -rf /var/lib/apt/lists/*

# Clone the official TON repository (which contains the C++ func and fift)
# --recursive is important to get all submodules needed for the build
RUN git clone --recursive https://github.com/ton-blockchain/ton.git /opt/ton

# Build TON tools (func, fift, lite-client)
# Navigate to the crypto directory where the makefile for func/fift resides, then run make
RUN cd /opt/ton/crypto && make

# Add the TON tools' executable directory to the system PATH
# So func, fift, lite-client can be found directly
ENV PATH="/opt/ton/crypto:${PATH}"

# Set pip to default to pip3 (good practice, as you had)
RUN update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1

# Clean up build directories to reduce image size (optional, but good practice)
RUN rm -rf /opt/ton/crypto/CMakeFiles /opt/ton/crypto/build
