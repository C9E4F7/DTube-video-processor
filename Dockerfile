FROM node:latest

RUN apt-get update -y
RUN apt-get install  ffmpeg imagemagick  libjansson4 build-essential make -y

RUN  wget http://ppa.launchpad.net/stebbins/handbrake-releases/ubuntu/pool/main/h/handbrake/handbrake-cli_1.1.2-zhb-1ppa1~xenial1_amd64.deb
RUN dpkg -i ./handbrake-cli_1.1.2-zhb-1ppa1~xenial1_amd64.deb

COPY . /DtubeVideoProcessor
WORKDIR /DtubeVideoProcessor
RUN npm install

EXPOSE 5000

ENV CORSVAR '*'
ENV IPFSIP  "127.0.0.1"
ENV IPFSPORT  "5001"
ENV IPFSPROTOCOL "http"

CMD ["npm", "start"]
