FROM node:22.11.0

# Install Redis CLI (Debian-based package)
RUN apt-get update && apt-get install -y redis-tools

RUN mkdir -p /var/www/docknockbackend/
COPY package*.json ./var/www/docknockbackend/
WORKDIR /var/www/docknockbackend/

RUN npm install -g npm@10.9.0 nodemon
RUN npm install
ENV PATH /var/www/docknockbackend/node_modules/.bin:$PATH

COPY . .

EXPOSE ${PORT}
CMD ["npm", "run", "start"]
