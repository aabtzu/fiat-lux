FROM node:20-slim

WORKDIR /opt/render/project/src

# Create the data directory structure matching Render
RUN mkdir -p /opt/render/project/data/imports

# Copy package files
COPY visualizer/package*.json ./visualizer/

# Install dependencies
WORKDIR /opt/render/project/src/visualizer
RUN npm install

# Copy application code
WORKDIR /opt/render/project/src
COPY . .

# Build the application
WORKDIR /opt/render/project/src/visualizer
RUN npm run build

# Set environment variables to match Render
ENV NODE_ENV=production
ENV DATA_DIR=/opt/render/project/data

EXPOSE 3000

CMD ["npm", "run", "start"]
