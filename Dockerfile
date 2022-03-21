FROM node:latest
LABEL maintainer="Derick Hammer <contact@lumeweb.com>"

ARG branch=master

WORKDIR /

RUN git clone --single-branch --branch ${branch} https://github.com/LumeWeb/rpcproxy.git app

WORKDIR /app

RUN yarn && yarn build

CMD ["npm","start"]
