# Build stage
FROM node:22 as build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
# RUN npm run build:ssr

# Production stage for Angular Universal
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist /app/dist
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules

# Set environment variables
ENV NODE_ENV=development

# Expose the port for the Node.js server
EXPOSE 4200

# Start the Angular Universal server
# CMD ["npm", "run", "serve:ssr"]
CMD ["npm", "run", "start"]

