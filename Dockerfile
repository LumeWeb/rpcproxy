FROM node:latest
LABEL maintainer="Derick Hammer <contact@lumeweb.com>"

RUN apt update && apt install libunbound-dev inotify-tools psmisc -y

WORKDIR /app

ADD src src/
ADD *.json ./
ADD yarn.lock ./


# Install all dependencies needed for production build
RUN yarn && yarn build

# Clean
RUN rm -rf node_modules
RUN yarn cache clean

# install production dependencies only
RUN yarn install --production

ADD entrypoint.sh /
ADD reload.sh /

ENTRYPOINT ["/bin/sh","/entrypoint.sh"]
CMD ["npm","start"]
