module.exports = {
  DB: {
    Type: "postgres",
    User: "duo",
    Password: "DuoS123",
    Port: 5432,
    Host: "localhost",
    Database: "dvpdb",
  },

  Redis: {
    mode: "instance", //instance, cluster, sentinel
    ip: "13.59.52.179",
    port: 6379,
    user: "duo",
    password: "DuoS123",
    redisDB: 8,
    sentinels: {
      hosts: "138.197.90.92,45.55.205.92,138.197.90.92",
      port: 16379,
      name: "redis-cluster",
    },
  },

  Security: {
    ip: "13.59.52.179",
    port: 6379,
    user: "duo",
    password: "DuoS123",
    mode: "instance", //instance, cluster, sentinel
    sentinels: {
      hosts: "138.197.90.92,45.55.205.92,138.197.90.92",
      port: 16389,
      name: "redis-cluster",
    },
  },

  DashboardRedis: {
    mode: "instance", //instance, cluster, sentinel
    ip: "",
    port: 6389,
    user: "",
    redisDB: 8,
    password: "",
    sentinels: {
      hosts: "138.197.90.92,45.55.205.92,138.197.90.92",
      port: 16389,
      name: "redis-cluster",
    },
  },

  //"Redis":
  //{
  //  "ip": "45.55.142.207",
  //  "port": 6389,
  //  "user": "duo",
  //  "password": "DuoS123",
  //  "redisDB":8
  //},
  //
  //"Security":
  //{
  //  "ip" : "45.55.142.207",
  //  "port": 6389,
  //  "user": "duo",
  //  "password": "DuoS123"
  //},
  //
  //
  //"DashboardRedis":
  //{
  //  "ip": "104.131.67.21",
  //  "port": 6379,
  //  "user": "duo",
  //  "password": "DuoS123",
  //  "redisDB":8
  //},

  Host: {
    resource: "cluster",
    vdomain: "127.0.0.1",
    domain: "127.0.0.1",
    port: "3635",
    version: "1.0.0.0",
    HashKey: "ticket",
    UseDashboardMsgQueue: "false",
  },

  LBServer: {
    ip: "192.168.0.45",
    port: "3635",
  },

  //mongodb+srv://facetone:Hds7236YD@facetone-prod.2xyao.mongodb.net/test?authSource=admin&replicaSet=atlas-unwxnp-shard-0&readPreference=primary&appname=MongoDB%20Compass&ssl=true
  Mongo: {
    ip: "facetone-prod.2xyao.mongodb.net",
    port: "",
    dbname: "dvpdb",
    password: "Hds7236YD",
    user: "facetone",
    type: "mongodb+srv",
  },

  RabbitMQ: {
    ip: "45.55.142.207",
    port: 5672,
    user: "admin",
    password: "admin",
    vhost: "/",
  },

  Services: {
    accessToken:
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdWtpdGhhIiwianRpIjoiYWEzOGRmZWYtNDFhOC00MWUyLTgwMzktOTJjZTY0YjM4ZDFmIiwic3ViIjoiNTZhOWU3NTlmYjA3MTkwN2EwMDAwMDAxMjVkOWU4MGI1YzdjNGY5ODQ2NmY5MjExNzk2ZWJmNDMiLCJleHAiOjE5MDIzODExMTgsInRlbmFudCI6LTEsImNvbXBhbnkiOi0xLCJzY29wZSI6W3sicmVzb3VyY2UiOiJhbGwiLCJhY3Rpb25zIjoiYWxsIn1dLCJpYXQiOjE0NzAzODExMTh9.Gmlu00Uj66Fzts-w6qEwNUz46XYGzE8wHUhAJOFtiRo",
    resourceServiceHost: "app.facetone.com",
    resourceServicePort: "8831",
    resourceServiceVersion: "1.0.0.0",
    sipuserendpointserviceHost: "app.facetone.com",
    sipuserendpointservicePort: "8831",
    sipuserendpointserviceVersion: "1.0.0.0",
    clusterconfigserviceHost: "app.facetone.com",
    clusterconfigservicePort: "8831",
    clusterconfigserviceVersion: "1.0.0.0",
    ardsServiceHost: "app.facetone.com",
    ardsServicePort: "8828",
    ardsServiceVersion: "1.0.0.0",
    notificationServiceHost: "app.facetone.com",
    notificationServicePort: "8089",
    notificationServiceVersion: "1.0.0.0",
    scheduleWorkerHost: "192.168.0.16",
    scheduleWorkerPort: "8080",
    scheduleWorkerVersion: "1.0.0.0",
    interactionServiceHost: "app.facetone.com",
    interactionServicePort: "8080",
    interactionServiceVersion: "1.0.0.0",
    fileServiceHost: "app.facetone.com",
    fileServicePort: 5645,
    fileServiceVersion: "1.0.0.0",
    dynamicPort: true,
  },

  Token:
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdWtpdGhhIiwianRpIjoiYWEzOGRmZWYtNDFhOC00MWUyLTgwMzktOTJjZTY0YjM4ZDFmIiwic3ViIjoiNTZhOWU3NTlmYjA3MTkwN2EwMDAwMDAxMjVkOWU4MGI1YzdjNGY5ODQ2NmY5MjExNzk2ZWJmNDMiLCJleHAiOjE5MDIzODExMTgsInRlbmFudCI6LTEsImNvbXBhbnkiOi0xLCJzY29wZSI6W3sicmVzb3VyY2UiOiJhbGwiLCJhY3Rpb25zIjoiYWxsIn1dLCJpYXQiOjE0NzAzODExMTh9.Gmlu00Uj66Fzts-w6qEwNUz46XYGzE8wHUhAJOFtiRo",
};
