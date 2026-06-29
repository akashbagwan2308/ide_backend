# Use a lightweight Linux image with Node.js installed
FROM node:18-alpine

# Install build dependencies for Icarus, plus Yosys for the Synthesis Engine
RUN apk update && apk add --no-cache \
    git build-base autoconf bison flex gperf readline-dev \
    yosys

# Clone the v12 branch of Icarus Verilog and build it from source
# This version has vastly superior SystemVerilog (IEEE 1800-2012) support
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