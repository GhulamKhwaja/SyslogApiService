FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

# Copy all app files
COPY . .

# App port
#EXPOSE 3000

#CMD ["node", "app.js"]
