# Použij Node.js image
FROM node:22

# Nastav pracovní adresář
WORKDIR /app

# COPY package*.json /app/
COPY . /app/

RUN npm install

# Zkopíruj projektové soubory

# Spusť Quasar dev server
# CMD ["npm", "run", "dev"]
ENTRYPOINT npm run dev