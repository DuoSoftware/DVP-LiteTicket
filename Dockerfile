#FROM ubuntu
#RUN apt-get update
#RUN apt-get install -y git nodejs npm nodejs-legacy
#RUN git clone git://github.com/DuoSoftware/DVP-LiteTicket.git /usr/local/src/liteticket
#RUN cd /usr/local/src/liteticket; npm install
#CMD ["nodejs", "/usr/local/src/liteticket/app.js"]

#EXPOSE 8872

FROM node:5.10.0
ARG VERSION_TAG
RUN git clone -b $VERSION_TAG https://github.com/DuoSoftware/DVP-LiteTicket.git /usr/local/src/liteticket
RUN cd /usr/local/src/liteticket;
WORKDIR /usr/local/src/liteticket
RUN npm install
COPY . .
EXPOSE 8872
CMD [ "node", --expose-gc "/usr/local/src/liteticket/app.js" ]
