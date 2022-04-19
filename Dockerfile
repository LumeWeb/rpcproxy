FROM node:latest
LABEL maintainer="Derick Hammer <contact@lumeweb.com>"

ARG INOTIFY_VERSION="3.20.2.2"

RUN apt update && apt install libunbound-dev psmisc build-essential -y

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

RUN cd /tmp && \
wget https://github.com/inotify-tools/inotify-tools/releases/download/${INOTIFY_VERSION}/inotify-tools-${INOTIFY_VERSION}.tar.gz && \
tar xzvf inotify-tools-${INOTIFY_VERSION}.tar.gz && \
cd inotify-tools-${INOTIFY_VERSION} && \
 sh ./configure --prefix=/usr --libdir=/lib64 && \
    make && make install && \
    rm -rf /tmp/inotify-tools*

ENTRYPOINT ["/bin/sh","/entrypoint.sh"]
CMD ["npm","start"]
