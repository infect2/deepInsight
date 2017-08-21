FROM node:boron

# create app directory
WORKDIR /home/sangseoklim/deepInsight

# COPY package.json package-lock.json

COPY package.json .
COPY package-lock.json .

# Bundle app source
COPY . .

RUN npm install
RUN npm install -g nodemon

EXPOSE 3000

CMD ["./cmd.sh"]
#CMD ["npm", "start"]
