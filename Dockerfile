FROM node:boron

# create app directory
WORKDIR /home/sangseoklim/deepInsight

# COPY package.json package-lock.json

COPY package.json .
COPY package-lock.json .

# Bundle app source
COPY . .

RUN npm install

EXPOSE 3000

CMD ["npm", "start"]
