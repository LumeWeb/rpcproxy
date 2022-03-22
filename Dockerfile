FROM node:latest
LABEL maintainer="Derick Hammer <contact@lumeweb.com>"

RUN apt update && apt install libunbound-dev -y

WORKDIR /app

ADD src .
ADD *.json .
ADD yarn.lock .


# Install all dependencies needed for production build
RUN yarn && yarn build

# Clean
RUN rm -rf node_modules
RUN yarn cache clean

# install production dependencies only
RUN yarn install --production

CMD ["npm","start"]
