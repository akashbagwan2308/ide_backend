# Use a Node.js image based on Debian (more compatible than Alpine for EDA tools)
FROM node:18-bullseye-slim

# Install dependencies and tools
RUN apt-get update && apt-get install -y \
    git build-base autoconf bison flex gperf readline-dev \
    gcc g++ make pkg-config libreadline-dev tcl-dev libffi-dev \
    git graphviz xdot pkg-config python3 libftdi-dev gawk \
    tcl libffi-dev libreadline-dev && \
    apt-get clean

# 1. Install Yosys from official repository
RUN apt-get install -y yosys

# 2. Build Icarus Verilog from source
RUN git clone --branch v12-branch https://github.com/steveicarus/iverilog.git /tmp/iverilog && \
    cd /tmp/iverilog && \
    sh autoconf.sh && \
    ./configure && \
    make -j$(nproc) && \
    make install && \
    rm -rf /tmp/iverilog

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY server.js ./

# Expose the port the app runs on
EXPOSE 3000

# Command to run the application
CMD [ "npm", "start" ]