# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies cleanly
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the production bundle
RUN npm run build

# Stage 2: Serve with lightweight NGINX
FROM nginx:alpine

# Copy custom NGINX configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
